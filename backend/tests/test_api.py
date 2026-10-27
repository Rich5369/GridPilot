import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.main import app
from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer.interface import optimize_scenario

client = TestClient(app)
SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "sample_data/scenario.demo.json").read_text())


def test_health():
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'project': 'GridPilot'}


def test_optimization_explicitly_unimplemented():
    response = client.post('/api/optimize', json=SAMPLE)
    assert response.status_code == 501
    assert response.json()['status'] == 'not_implemented'
    assert set(response.json()) == {'status', 'message'}


@pytest.mark.parametrize('field,value', [
    ('fixed_demand_kw', [1] * 23),
    ('fixed_demand_kw', [-1] * 24),
    ('electricity_prices_usd_per_kwh', [0.1] * 25),
    ('building_max_demand_kw', 0),
    ('operating_hours', {'start_hour': 18, 'end_hour': 8}),
    ('operating_hours', {'start_hour': 8.5, 'end_hour': 18}),
    ('unexpected', True),
])
def test_invalid_scenario(field, value):
    scenario = deepcopy(SAMPLE)
    scenario[field] = value
    assert client.post('/api/optimize', json=scenario).status_code == 422


def test_invalid_ev_deadline_and_duplicate_ids():
    scenario = deepcopy(SAMPLE)
    scenario['ev_requirements'][0]['deadline_hour'] = 8
    assert client.post('/api/optimize', json=scenario).status_code == 422
    scenario = deepcopy(SAMPLE)
    scenario['ev_requirements'] *= 2
    assert client.post('/api/optimize', json=scenario).status_code == 422


def test_physically_infeasible_input_is_not_schema_error():
    scenario = deepcopy(SAMPLE)
    scenario['fixed_demand_kw'] = [101] * 24
    scenario['ev_requirements'][0]['energy_required_kwh'] = 1000
    scenario['electricity_prices_usd_per_kwh'] = [-0.1] * 24
    assert client.post('/api/optimize', json=scenario).status_code == 501


@pytest.mark.parametrize('origin', ['http://localhost:5173', 'http://127.0.0.1:5173'])
def test_cors_allowed(origin):
    response = client.options('/api/optimize', headers={
        'Origin': origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == origin


def test_cors_unknown_origin():
    response = client.get('/api/health', headers={'Origin': 'https://untrusted.example'})
    assert 'access-control-allow-origin' not in response.headers


def test_docs_and_schema():
    assert client.get('/docs').status_code == 200
    schema = client.get('/openapi.json').json()
    assert '501' in schema['paths']['/api/optimize']['post']['responses']


def test_optimizer_returns_verified_result_without_changing_http_placeholder():
    result = optimize_scenario(Scenario.model_validate(SAMPLE))
    assert result.feasibility_status == "feasible"
    assert not result.constraint_violations
    assert result.optimized_electricity_cost_usd == pytest.approx(80.64)


def test_infeasible_result_requires_reasons_and_no_optimized_values():
    result = dict(feasibility_status='infeasible', baseline_electricity_cost_usd=10,
                  baseline_peak_demand_kw=20, baseline_demand_kw=[20] * 24)
    with pytest.raises(ValidationError):
        OptimizationResult(**result)
    result['constraint_violations'] = ['Building demand exceeds capacity']
    assert OptimizationResult(**result).optimized_demand_kw is None
    with pytest.raises(ValidationError):
        OptimizationResult(**result, optimized_electricity_cost_usd=0)


def test_feasible_result_requires_complete_values():
    with pytest.raises(ValidationError):
        OptimizationResult(feasibility_status='feasible', baseline_electricity_cost_usd=10,
                           baseline_peak_demand_kw=20, baseline_demand_kw=[20] * 24)


def test_nonfinite_input_rejected():
    scenario = deepcopy(SAMPLE)
    scenario['fixed_demand_kw'][0] = float('inf')
    with pytest.raises(ValidationError):
        Scenario.model_validate(scenario)
