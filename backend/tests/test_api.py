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


def test_real_optimization_response():
    response = client.post('/api/optimize', json=SAMPLE)
    assert response.status_code == 200
    result = OptimizationResult.model_validate(response.json())
    assert result.feasibility_status == 'feasible'
    assert response.json() == result.model_dump(mode='json')
    assert result.optimized_electricity_cost_usd == pytest.approx(80.64)
    assert result.optimized_electricity_cost_usd <= result.baseline_electricity_cost_usd + 1e-6
    assert len(result.baseline_demand_kw) == len(result.optimized_demand_kw) == 24
    assert max(result.optimized_demand_kw) <= SAMPLE['building_max_demand_kw'] + 1e-6
    prices = SAMPLE['electricity_prices_usd_per_kwh']
    assert sum(p * d for p, d in zip(prices, result.optimized_demand_kw)) == pytest.approx(result.optimized_electricity_cost_usd)
    assert result.baseline_peak_demand_kw == max(result.baseline_demand_kw)
    assert result.optimized_peak_demand_kw == max(result.optimized_demand_kw)


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
    response = client.post('/api/optimize', json=scenario)
    assert response.status_code == 200
    result = OptimizationResult.model_validate(response.json())
    assert result.feasibility_status == 'infeasible'
    assert result.constraint_violations
    assert len(result.baseline_demand_kw) == 24
    assert result.optimized_demand_kw is None
    assert result.optimized_peak_demand_kw is None
    assert result.optimized_electricity_cost_usd is None


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
    responses = schema['paths']['/api/optimize']['post']['responses']
    assert {'200', '422', '500', '503'} <= responses.keys()
    assert '501' not in responses
    assert responses['200']['content']['application/json']['schema']['$ref'].endswith('/OptimizationResult')


def test_optimizer_returns_verified_result():
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


@pytest.mark.parametrize('kind,primary,status,code', [
    ('unresolved', 'not_solved', 503, 'optimization_unresolved'),
    ('error', 'not_run', 503, 'solver_unavailable'),
    ('error', 'abnormal', 500, 'solver_error'),
    ('verification_failed', 'optimal', 500, 'verification_failed'),
    ('unexpected', 'not_run', 500, 'optimization_error'),
])
def test_solver_failure_responses(monkeypatch, caplog, kind, primary, status, code):
    from backend.api import routes
    from backend.optimizer.solver import (
        SolveOutcome, OptimizationUnresolvedError, OptimizationSolverError,
        OptimizationVerificationError,
    )
    outcome = SolveOutcome(status=kind, objective='energy_only',
                           primary_status=primary, reasons=['private diagnostic'])
    errors = {'unresolved': OptimizationUnresolvedError,
              'error': OptimizationSolverError,
              'verification_failed': OptimizationVerificationError}
    error = errors[kind](outcome) if kind in errors else RuntimeError('private diagnostic')

    def fail(scenario):
        raise error

    monkeypatch.setattr(routes, 'optimize_scenario', fail)
    response = client.post('/api/optimize', json=SAMPLE)
    assert response.status_code == status
    assert response.json()['detail']['code'] == code
    assert 'private diagnostic' not in response.text
    assert 'private diagnostic' in caplog.text
    assert 'feasibility_status' not in response.json()


def test_actual_solver_unavailable(monkeypatch):
    from backend.optimizer import solver
    monkeypatch.setattr(solver, '_create_solver', lambda: None)
    response = client.post('/api/optimize', json=SAMPLE)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'solver_unavailable'
