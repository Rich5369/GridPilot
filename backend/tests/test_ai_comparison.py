"""Real solver comparisons with injected Meta tool completions; no paid inference."""
import json
from copy import deepcopy
from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.test_advisor import SAMPLE

client = TestClient(app)


def tool_response(name='compare_reviewed_scenarios', arguments='{}', count=1):
    call = NS(id='reviewed-comparison', type='function', function=NS(name=name, arguments=arguments))
    return NS(choices=[NS(finish_reason='tool_calls', message=NS(
        content=None, refusal=None, tool_calls=[call] * count))])


def final_response(message='Review the modeled tradeoff before changing your operating plan.'):
    return NS(choices=[NS(finish_reason='stop', message=NS(
        content=json.dumps({'message': message, 'follow_up_question': None}), refusal=None))])


@pytest.fixture
def provider(monkeypatch):
    import openai
    monkeypatch.setenv('MODEL_API_MODE', 'live')
    monkeypatch.setenv('MODEL_API_KEY', 'injected-test-only')
    create = MagicMock(side_effect=[tool_response(), final_response()])
    sdk = MagicMock()
    sdk.__enter__.return_value.chat.completions.create = create
    constructor = MagicMock(return_value=sdk)
    monkeypatch.setattr(openai, 'OpenAI', constructor)
    return create, constructor


def compare(changes=None, mode='ev_only', scenario=None):
    return client.post('/api/ai/compare', json={
        'scenario': scenario or SAMPLE, 'changes': changes if changes is not None else {'building_max_demand_kw': 25.0},
        'scheduling_mode': mode,
    })


@pytest.mark.parametrize('mode', ['ev_only', 'joint'])
def test_real_tool_comparison_and_owned_evidence(provider, mode):
    original = deepcopy(SAMPLE)
    response = compare(mode=mode)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['source'] == body['explanation_source'] == 'meta'
    assert body['current']['result_id'] != body['alternative']['result_id']
    assert body['scheduling_mode'] == mode
    assert body['proposed_scenario']['building_max_demand_kw'] == 25
    assert SAMPLE == original
    assert body['current']['operating_plan']['verification_status'] == 'passed'
    assert body['alternative']['operating_plan']['verification_status'] == 'passed'
    assert body['daily_cost_difference_usd'] == pytest.approx(
        body['current']['optimized_electricity_cost_usd'] - body['alternative']['optimized_electricity_cost_usd'])
    assert provider[0].call_count == 2
    first, last = [call.kwargs for call in provider[0].call_args_list]
    assert first['tools'][0]['function']['name'] == 'compare_reviewed_scenarios'
    assert 'tools' not in last
    evidence = json.loads(last['messages'][-1]['content'])
    assert evidence['alternative']['optimized_daily_energy_cost_usd'] == body['alternative']['optimized_electricity_cost_usd']
    assert evidence['financial_scope'] == 'modeled daily energy charges only'
    assert provider[1].call_args.kwargs['max_retries'] == 0


def test_infeasible_alternative_is_not_free(provider):
    response = compare({'building_max_demand_kw': 1.0})
    assert response.status_code == 200
    body = response.json()
    assert body['alternative']['feasibility_status'] == 'infeasible'
    assert body['alternative']['optimized_electricity_cost_usd'] is None
    assert body['daily_cost_difference_usd'] is None
    assert body['peak_difference_kw'] is None
    assert any('Alternative:' in warning for warning in body['warnings'])


@pytest.mark.parametrize('name,args,count', [
    ('change_equipment', '{}', 1), ('compare_reviewed_scenarios', '{"site_limit": 1}', 1),
    ('compare_reviewed_scenarios', 'not-json', 1), ('compare_reviewed_scenarios', '{}', 2),
    ('compare_reviewed_scenarios', 'null', 1),
])
def test_invalid_tool_never_executes(provider, monkeypatch, name, args, count):
    provider[0].side_effect = [tool_response(name, args, count)]
    solve = MagicMock(side_effect=AssertionError('Unexpected solver execution'))
    monkeypatch.setattr('backend.ai.comparison.optimize', solve)
    assert compare().status_code == 502
    solve.assert_not_called()
    assert provider[0].call_count == 1


@pytest.mark.parametrize('changes', [{}, {'building_max_demand_kw': -1}, {'all_ev_deadline_hour': 1}, {'equipment': []}, {'building_max_demand_kw': '15'}])
def test_invalid_reviewed_changes_never_call_provider(provider, changes):
    assert compare(changes).status_code in (422, 502)
    provider[0].assert_not_called()


def test_unchanged_scenario_never_calls_provider(provider):
    assert compare({'building_max_demand_kw': SAMPLE['building_max_demand_kw']}).status_code == 422
    provider[0].assert_not_called()


@pytest.mark.parametrize('final', [
    final_response('You will save USD 999.'),
    NS(choices=[]),
    tool_response(),  # A second request cannot execute the tool again.
])
def test_bad_explanation_preserves_solver_results(provider, final):
    provider[0].side_effect = [tool_response(), final]
    body = compare().json()
    assert body['explanation_source'] == 'unavailable'
    assert body['alternative']['operating_plan']['verification_status'] == 'passed'
    assert '999' not in body['message']
    assert any('no automatic retry' in w for w in body['warnings'])
    assert provider[0].call_count == 2


def test_timeout_after_execution_preserves_results(provider):
    from openai import APITimeoutError
    provider[0].side_effect = [tool_response(), APITimeoutError(request=httpx.Request('POST', 'https://example.test'))]
    response = compare()
    assert response.status_code == 200
    assert response.json()['explanation_source'] == 'unavailable'
    assert provider[0].call_count == 2


def test_solver_failure_is_sanitized_and_does_not_request_explanation(provider, monkeypatch):
    monkeypatch.setattr('backend.api.routes.optimize_scenario', MagicMock(side_effect=RuntimeError('private solver internals')))
    response = compare()
    assert response.status_code == 500
    assert 'private solver internals' not in response.text
    assert provider[0].call_count == 1


def test_tariff_comparison_is_explicitly_not_operational_savings(provider):
    scenario = deepcopy(SAMPLE)
    scenario['electricity_prices_usd_per_kwh'] = [0.1] * 12 + [0.3] * 12
    response = compare({'peak_price_increase_percent': 25.0}, scenario=scenario)
    assert response.status_code == 200
    assert any('not an operational saving' in w for w in response.json()['warnings'])


def test_missing_credentials_and_mock_mode_never_solve(monkeypatch):
    solve = MagicMock(side_effect=AssertionError('Unexpected solver execution'))
    monkeypatch.setattr('backend.ai.comparison.optimize', solve)
    monkeypatch.setenv('MODEL_API_MODE', 'live')
    monkeypatch.delenv('MODEL_API_KEY', raising=False)
    assert compare().status_code == 503
    monkeypatch.setenv('MODEL_API_MODE', 'mock')
    assert compare().status_code == 503
    solve.assert_not_called()


def test_follow_up_uses_exact_retained_comparison_without_resolving(provider, monkeypatch):
    from backend.ai.advisor import BusinessProfile
    body = compare().json()
    reply = dict(category='answer', fact_keys=['insights'], clarification='none',
                 profile=BusinessProfile().model_dump(), changes={},
                 answer='The proposed limit changes the available scheduling flexibility.')
    provider[0].side_effect = [NS(choices=[NS(finish_reason='stop', message=NS(
        content=json.dumps(reply), refusal=None))])]
    monkeypatch.setattr('backend.api.routes.optimize_scenario', MagicMock(side_effect=AssertionError('Follow-up must not solve')))
    response = client.post('/api/ai/conversation', json={
        'request': 'Why are the alternative costs different?', 'scenario': SAMPLE,
        'result_id': body['current']['result_id'],
        'comparison': {'changes': body['changes'], 'alternative_result_id': body['alternative']['result_id']},
    })
    assert response.status_code == 200, response.text
    assert response.json()['message'] == reply['answer']
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert 'Reviewed comparison' in payload['verified_facts']['insights']
    assert str(body['alternative']['optimized_electricity_cost_usd']) in payload['verified_facts']['insights']


def test_missing_comparison_handle_never_recomputes_or_calls_meta(provider, monkeypatch):
    body = compare().json()
    provider[0].reset_mock()
    monkeypatch.setattr('backend.api.routes.optimize_scenario', MagicMock(side_effect=AssertionError('Must not solve')))
    response = client.post('/api/ai/conversation', json={
        'request': 'Explain the alternative.', 'scenario': SAMPLE,
        'result_id': body['current']['result_id'],
        'comparison': {'changes': body['changes'], 'alternative_result_id': 'missing-execution'},
    })
    assert response.status_code == 409
    provider[0].assert_not_called()
