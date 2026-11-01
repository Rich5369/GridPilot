"""Specific input comparisons without invented schedules or relaxed numeric validation."""
import json
from copy import deepcopy

from backend.tests.test_advisor import provider, client, SAMPLE, ask
from backend.ai.advisor_specifics import scenario_specifics
from backend.models.contracts import Scenario


def test_flat_price_explains_no_timing_benefit_with_exact_input(provider):
    provider[1](answer='@price_context Confirm which office equipment can change operating times before testing alternatives.',
                summary_bullets=['Changing timing alone cannot lower energy charges at this rate.'])
    body = ask().json()
    assert '$0.16/kWh' in body['message']
    assert 'throughout the day' in body['message']
    assert 'timing alone cannot lower' in body['message']
    assert '@price_context' not in body['message']
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert '@price_context' in payload['scenario_specifics']
    assert '@result_context' not in payload['scenario_specifics']


def test_prices_and_charging_compare_only_allowed_hours_without_solving(provider, monkeypatch):
    scenario = deepcopy(SAMPLE)
    scenario['electricity_prices_usd_per_kwh'] = [0.1]*9 + [0.2]*5 + [0.4]*6 + [0.1]*4
    provider[1](answer='@price_context @charging_context Confirm charging flexibility before changing operations.',
                summary_bullets=['Check charging flexibility before changing operations.'], fact_keys=[])
    monkeypatch.setattr('backend.api.routes.optimize_scenario', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Unexpected solve')))
    response = client.post('/api/ai/conversation', json={
        'request': 'How can I reduce electricity costs without disrupting operations?', 'scenario': scenario})
    assert response.status_code == 200
    text = response.json()['message']
    assert '14:00–20:00' in text
    assert '$0.4/kWh' in text
    assert '09:00–14:00' in text  # Does not recommend cheaper overnight hours outside availability.
    assert '09:00–17:00 charging availability' in text
    assert 'not a verified charging plan' in text
    assert 'first configured vehicle' in text
    assert response.json()['proposed_scenario'] is None


def test_disconnected_equal_price_hours_are_not_claimed_as_continuous_window():
    scenario = deepcopy(SAMPLE)
    scenario['electricity_prices_usd_per_kwh'] = [0.4 if h in (10, 12) else 0.1 for h in range(24)]
    text = scenario_specifics(Scenario.model_validate(scenario), None)['@price_context']
    assert '10:00–11:00' in text
    assert '10:00–13:00' not in text


def test_tokens_do_not_allow_fabricated_quantities_or_unavailable_results(provider):
    for text in ['@unknown_context', '@result_context', '@price_context You will save USD 999.']:
        provider[1](answer=text)
        assert ask().status_code == 502


def test_no_charging_details_invented_when_no_vehicle_is_configured(provider):
    scenario = deepcopy(SAMPLE)
    scenario['ev_requirements'] = []
    provider[1](answer='@charging_context')
    response = client.post('/api/ai/conversation', json={'request': 'When can I charge?', 'scenario': scenario})
    assert response.status_code == 502
