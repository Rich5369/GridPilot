"""Injected provider selections; solver/HTTP behavior is real, not Meta acceptance."""
import json
from copy import deepcopy
from pathlib import Path
from unittest.mock import MagicMock
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.ai.advisor import BusinessProfile
from backend.ai import snapshots

client = TestClient(app)
SAMPLE = json.loads((Path(__file__).resolve().parents[2] / 'sample_data/scenario.demo.json').read_text())

@pytest.fixture
def provider(monkeypatch):
    import openai
    monkeypatch.setenv('MODEL_API_MODE', 'live')
    monkeypatch.setenv('MODEL_API_KEY', 'injected-test-only')
    with snapshots._lock:
        snapshots._results.clear()
    create = MagicMock()
    sdk = MagicMock()
    sdk.__enter__.return_value.chat.completions.create = create
    monkeypatch.setattr(openai, 'OpenAI', MagicMock(return_value=sdk))
    def select(**overrides):
        data = dict(category='answer', fact_keys=['cost'], clarification='none', profile=BusinessProfile().model_dump(), changes={})
        data.update(overrides)
        create.return_value = SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop', message=SimpleNamespace(content=json.dumps(data), refusal=None))])
    select()
    return create, select

def ask(**kwargs):
    return client.post('/api/ai/conversation', json=dict(request='What are my costs?', scenario=SAMPLE, **kwargs))

def test_grounding_without_resolve_and_isolation(provider, monkeypatch):
    result = client.post('/api/optimize', json=SAMPLE).json()
    monkeypatch.setattr('backend.api.routes.optimize_scenario', lambda *a, **k: pytest.fail('Informational question solved again'))
    response = ask().json()
    assert f"{result['baseline_electricity_cost_usd']:.4f}" in response['facts'][0]
    assert 'No retained' in ask(scheduling_mode='joint').json()['facts'][0]
    draft = deepcopy(SAMPLE); draft['building_max_demand_kw'] = 999
    missing = client.post('/api/ai/conversation', json=dict(request='cost?', scenario=draft)).json()
    assert 'No retained' in missing['facts'][0]

def test_continuity_profile_and_clarification(provider):
    profile = BusinessProfile(business_type='office', employee_count=10, electricity_cost_and_period='USD 2000 monthly').model_dump()
    provider[1](category='clarification_required', clarification='scope', profile=profile, fact_keys=[])
    history=[dict(role='user', content='Can we stay below 15 kW?'), dict(role='assistant', content='For the whole building?')]
    response=ask(history=history, profile=profile)
    assert response.status_code == 200
    assert response.json()['profile'] == profile
    assert response.json()['proposed_scenario'] is None
    payload=json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['history'] == history
    assert payload['profile']['consumption_and_units'] is None
    assert 'entire building' in response.json()['message']

@pytest.mark.parametrize('changes', [{'building_max_demand_kw':15.0}, {'all_ev_deadline_hour':17}, {'peak_price_increase_percent':25.0}])
def test_valid_proposals_no_execution(provider, changes, monkeypatch):
    monkeypatch.setattr('backend.api.routes.optimize_scenario', lambda *a, **k: pytest.fail('Proposal executed'))
    provider[1](category='scenario_proposal', changes=changes)
    scenario = deepcopy(SAMPLE)
    scenario['electricity_prices_usd_per_kwh'] = [0.1]*12+[0.3]*12
    response=client.post('/api/ai/conversation', json=dict(request='Change tariff', scenario=scenario))
    assert response.status_code == 200
    assert response.json()['proposed_scenario'] is not None
    assert SAMPLE['building_max_demand_kw'] != 15

@pytest.mark.parametrize('changes', [{'building_max_demand_kw':-1}, {'all_ev_deadline_hour':1}, {'equipment_id':'heater'}, {'building_max_demand_kw':'15'}])
def test_invalid_proposals(provider, changes):
    provider[1](category='scenario_proposal', changes=changes)
    assert ask().status_code in (422,502)

def test_reject_fabricated_output(provider):
    provider[1](message='You will save USD 999', fact_keys=['cost'])
    assert ask().status_code == 502
    provider[1](fact_keys=['savings_999'])
    assert ask().status_code == 502

def test_unsupported_and_inconsistent_changes(provider):
    provider[1](category='unavailable_or_unsupported', fact_keys=[])
    assert ask().json()['proposed_scenario'] is None
    provider[1](category='answer', changes={'building_max_demand_kw':15.0})
    assert ask().status_code == 502

def test_unavailable_and_bounds(monkeypatch):
    monkeypatch.setenv('MODEL_API_MODE','live'); monkeypatch.delenv('MODEL_API_KEY', raising=False)
    assert ask().status_code == 503
    assert ask(history=[dict(role='user',content='x')]*13).status_code == 422
    assert client.post('/api/ai/conversation', json=dict(request='x'*2001, scenario=SAMPLE)).status_code == 422

def test_snapshot_bounded_and_immutable(provider):
    from backend.models.contracts import Scenario
    original=client.post('/api/optimize',json=SAMPLE).json()
    scenario=Scenario.model_validate(SAMPLE)
    result=snapshots.lookup(scenario,'ev_only')
    result.baseline_demand_kw[0]=999
    assert snapshots.lookup(scenario,'ev_only').baseline_demand_kw[0] == original['baseline_demand_kw'][0]
    for cap in range(100,166):
        alternate=scenario.model_copy(update={'building_max_demand_kw':float(cap)})
        snapshots.remember(alternate,'ev_only',result)
    assert len(snapshots._results)==64
    assert snapshots.lookup(scenario,'ev_only') is None
