"""Injected completions test presentation policy; real optimizer checks grounding."""
import json
from copy import deepcopy

import pytest

from backend.tests.test_advisor import provider, client, SAMPLE, ask


@pytest.mark.parametrize('question', [
    'How can I save more money?', 'What should I try next?',
    'How can I reduce costs without disrupting work?',
])
def test_short_advice_and_optional_next_step(provider, question):
    provider[1](answer='Try running equipment when electricity is cheaper and avoid using large devices at the same time.',
                next_step='Run optimization to check whether a different schedule could lower your costs.', fact_keys=['prices', 'constraints'])
    response = client.post('/api/ai/conversation', json={'request': question, 'scenario': SAMPLE})
    assert response.status_code == 200
    body = response.json()
    assert len((body['message'] + ' ' + body['next_step']).split()) <= 60
    assert body['follow_up_questions'] == []
    assert 'Submitted hourly electricity prices' in body['facts'][0]
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['verified_facts']['constraints']
    assert payload['detailed_response'] is False
    instructions = provider[0].call_args.kwargs['messages'][0]['content']
    assert '30–60 words TOTAL' in instructions
    assert 'at most ONE' in instructions
    assert 'at most two actionable suggestions' in instructions


def test_rejects_long_ordinary_reply_without_truncating(provider):
    provider[1](answer='Equipment may run when electricity is cheaper. ' * 13)
    assert ask().status_code == 502


@pytest.mark.parametrize('question', ['Explain the scheduling method in technical detail.', 'Tell me more.'])
def test_explicit_details_allow_longer_grounded_explanations(provider, question):
    explanation = 'Equipment may run when electricity is cheaper. ' * 13
    provider[1](answer=explanation)
    response = client.post('/api/ai/conversation', json={
        'request': question, 'scenario': SAMPLE})
    assert response.status_code == 200
    assert response.json()['message'] == explanation
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['detailed_response'] is True


@pytest.mark.parametrize('fields', [
    {'follow_up_questions': ['When can charging move?', 'What is your tariff?']},
    {'answer': 'When can charging move?', 'follow_up_questions': ['What is your tariff?']},
    {'next_step': 'You will save USD 999.'},
    {'answer': 'Configuration: {"charger": "fast"}.'},
])
def test_no_multiple_questions_raw_data_or_unsafe_next_step(provider, fields):
    provider[1](**fields)
    assert ask().status_code == 502


def test_missing_result_disclosure_is_visible_without_facts(provider):
    provider[1](answer='A different schedule may help.', fact_keys=['cost'])
    body = ask().json()
    assert 'not been verified' in ' '.join(body['warnings'])
    assert body['proposed_scenario'] is None


def test_infeasibility_visible_even_if_model_omits_warning(provider):
    scenario = deepcopy(SAMPLE)
    scenario['building_max_demand_kw'] = 0.1
    result = client.post('/api/optimize', json=scenario).json()
    provider[1](answer='Review your equipment needs.', fact_keys=[])
    response = client.post('/api/ai/conversation', json={
        'request': 'What should I do next?', 'scenario': scenario, 'result_id': result['result_id']})
    assert response.status_code == 200
    notices = ' '.join(response.json()['warnings'])
    assert 'cannot meet' in notices
    assert 'power limit' in notices
    assert 'Savings are not confirmed' in notices


def test_result_explanation_is_short_and_never_resolves(provider, monkeypatch):
    result = client.post('/api/optimize', json=SAMPLE).json()
    monkeypatch.setattr('backend.api.routes.optimize_scenario', lambda *a, **k: pytest.fail('Unexpected solve'))
    provider[1](answer='Charging may have helped.', fact_keys=[])
    body = client.post('/api/ai/conversation', json={
        'request': 'Explain this optimization result.', 'scenario': SAMPLE, 'result_id': result['result_id']}).json()
    assert len(body['message'].split()) <= 60
    assert 'full electricity bill' in body['message']
    assert f"${result['baseline_electricity_cost_usd']:.2f}" in body['message']
    assert f"${result['optimized_electricity_cost_usd']:.2f}" in body['message']
    assert 'scenario evidence' not in body['message']
    assert any('Verified submitted' in fact for fact in body['facts'])


def test_solver_validity_warning_survives_in_plain_language():
    from types import SimpleNamespace
    from backend.ai.advisor_presentation import result_notices
    result = SimpleNamespace(feasibility_status='feasible', operating_plan=SimpleNamespace(
        warnings=['Primary solution is feasible without optimality proof; peak tie-break not run.']))
    assert result_notices(result, []) == [
        'The plan can work, but the lowest possible cost and peak power use have not been confirmed.']
