"""Real shared-adapter/HTTP checks against the existing engineering cases."""
import pytest
from fastapi.testclient import TestClient
from ortools.linear_solver import pywraplp

from backend.main import app
from backend.models.contracts import OptimizationResult
from backend.optimizer import solver
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.scheduler import ORToolsSchedulingEngine
from backend.simulator.building import Tariff
from backend.simulator.interface import simulate_baseline


CASES = ['joint_recovery', 'joint_price_shift', 'joint_infeasible']
MODES = [None, False, True]
client = TestClient(app)


def check_metrics(scenario, result, *, energy, cost, peak):
    assert result.feasibility_status == 'feasible'
    demand = result.optimized_demand_kw
    assert sum(demand) == pytest.approx(energy, abs=1e-6)
    assert result.optimized_electricity_cost_usd == pytest.approx(cost, abs=2e-7)
    assert result.optimized_peak_demand_kw == pytest.approx(peak, abs=1e-6)
    assert result.optimized_peak_demand_kw == max(demand)
    assert result.optimized_electricity_cost_usd == pytest.approx(sum(
        p * d for p, d in zip(scenario.electricity_prices_usd_per_kwh, demand)), abs=2e-7)
    assert all(fixed - 1e-6 <= actual <= scenario.building_max_demand_kw + 1e-6
               for fixed, actual in zip(scenario.fixed_demand_kw, demand))
    assert not result.constraint_violations


def check_result(scenario, result, name, joint):
    baseline = simulate_baseline(scenario)
    assert result.baseline_demand_kw == baseline.demand_kw
    assert result.baseline_electricity_cost_usd == baseline.electricity_cost_usd
    assert result.baseline_peak_demand_kw == baseline.peak_demand_kw
    energy, cost, peak = {
        'joint_recovery': (28, 5.6, 5),
        'joint_price_shift': (26, 7.9, 3),
        'joint_infeasible': (29, 5.8, 5),
    }[name]
    assert sum(result.baseline_demand_kw) == pytest.approx(energy, abs=1e-6)
    assert result.baseline_electricity_cost_usd == pytest.approx(cost, abs=2e-7)
    assert result.baseline_peak_demand_kw == pytest.approx(peak, abs=1e-6)
    if name == 'joint_infeasible' or (name == 'joint_recovery' and not joint):
        assert result.feasibility_status == 'infeasible'
        assert result.optimized_demand_kw is None
        assert result.optimized_electricity_cost_usd is None
        assert result.optimized_peak_demand_kw is None
        assert result.constraint_violations
        if joint:
            assert any('5 kWh' in message and '4 kWh' in message
                       for message in result.constraint_violations)
    elif name == 'joint_recovery':
        check_metrics(scenario, result, energy=28, cost=5.6, peak=3)
    else:
        check_metrics(scenario, result, energy=26, cost=7.3 if joint else 7.9, peak=3)


@pytest.mark.parametrize('name', CASES)
@pytest.mark.parametrize('mode', MODES, ids=['omitted', 'false', 'true'])
def test_real_adapter_fixtures_and_independent_per_item_constraints(name, mode):
    config = joint_demonstration_configs()[name]
    scenario = config.scenario
    original = scenario.model_dump()
    result = (optimize_scenario(scenario) if mode is None else
              optimize_scenario(scenario, optimize_flexible=mode))
    check_result(scenario, result, name, bool(mode))
    assert scenario.model_dump() == original
    if mode is not True:
        # Identical default/False behavior, not equality between equivalent optima.
        legacy = optimize_scenario(scenario)
        assert result.feasibility_status == legacy.feasibility_status
        if legacy.optimized_demand_kw is None:
            assert result.optimized_demand_kw is None
        else:
            assert result.optimized_electricity_cost_usd == pytest.approx(
                legacy.optimized_electricity_cost_usd, abs=2e-7)
    detailed = ORToolsSchedulingEngine(optimize_flexible=bool(mode)).optimize(config)
    assert (detailed.optimized is not None) == (result.feasibility_status == 'feasible')
    if detailed.optimized is None:
        return
    assert result.optimized_electricity_cost_usd == pytest.approx(detailed.optimized.energy_charges_usd, abs=2e-7)
    assert result.optimized_peak_demand_kw == pytest.approx(detailed.optimized.peak_demand_kw, abs=1e-6)
    schedules = detailed.optimized.equipment_schedules_kw
    for key in ('background:base', 'hvac'):
        assert schedules[key] == detailed.baseline.equipment_schedules_kw[key]
    items = [(f'ev:{ev.id}', ev.arrival_hour, ev.deadline_hour,
              ev.energy_required_kwh, ev.max_charging_power_kw) for ev in scenario.ev_requirements]
    items += [(f'flexible:{item.id}', item.available_hours.start_hour,
               item.available_hours.end_hour, item.energy_required_kwh, item.max_power_kw)
              for item in scenario.flexible_equipment]
    for key, start, end, required, bound in items:
        values = schedules[key]
        assert sum(values) == pytest.approx(required, abs=1e-6)
        assert all(0 <= p <= bound + 1e-6 for p in values)
        assert all(abs(values[h]) <= 1e-6 for h in range(24) if not start <= h < end)
    demand = [sum(values[h] for values in schedules.values()) for h in range(24)]
    assert max(demand) <= scenario.building_max_demand_kw + 1e-6
    assert sum(demand) == pytest.approx(sum(result.optimized_demand_kw), abs=1e-6)
    # Check scalar metrics rather than requiring a particular equivalent schedule.
    assert max(demand) == pytest.approx(result.optimized_peak_demand_kw, abs=1e-6)


@pytest.mark.parametrize('name', CASES)
@pytest.mark.parametrize('mode', [None, 'ev_only', 'joint'], ids=['omitted', 'ev_only', 'joint'])
def test_real_fastapi_fixture_dispatch_and_serialization(name, mode):
    scenario = joint_demonstration_configs()[name].scenario
    suffix = '' if mode is None else f'?scheduling_mode={mode}'
    response = client.post('/api/optimize' + suffix, json=scenario.model_dump(mode='json'))
    assert response.status_code == 200, response.text
    result = OptimizationResult.model_validate(response.json())
    assert response.json() == result.model_dump(mode='json')
    check_result(scenario, result, name, mode == 'joint')
    direct = optimize_scenario(scenario, optimize_flexible=mode == 'joint')
    assert result.feasibility_status == direct.feasibility_status
    if result.optimized_demand_kw is not None:
        assert result.optimized_electricity_cost_usd == pytest.approx(direct.optimized_electricity_cost_usd, abs=2e-7)
        assert result.optimized_peak_demand_kw == pytest.approx(direct.optimized_peak_demand_kw, abs=1e-6)


@pytest.mark.parametrize('joint', [False, True])
@pytest.mark.parametrize('status,exception', [
    (pywraplp.Solver.NOT_SOLVED, solver.OptimizationUnresolvedError),
    (pywraplp.Solver.ABNORMAL, solver.OptimizationSolverError),
    (pywraplp.Solver.UNBOUNDED, solver.OptimizationSolverError),
    (pywraplp.Solver.MODEL_INVALID, solver.OptimizationSolverError),
])
def test_adapter_retains_typed_solver_errors(monkeypatch, joint, status, exception):
    # Fault injection at the solver boundary; adapter and dispatch remain real.
    monkeypatch.setattr(solver, '_run_solver', lambda _: status)
    with pytest.raises(exception) as raised:
        optimize_scenario(joint_demonstration_configs()['joint_price_shift'].scenario,
                          optimize_flexible=joint)
    assert raised.value.outcome.status != 'infeasible'
    assert raised.value.outcome.schedules is None
    response = client.post('/api/optimize?scheduling_mode=' + ('joint' if joint else 'ev_only'),
                           json=joint_demonstration_configs()['joint_price_shift'].scenario.model_dump(mode='json'))
    assert response.status_code == (503 if status == pywraplp.Solver.NOT_SOLVED else 500)
    assert response.json()['detail']['code'] == (
        'optimization_unresolved' if status == pywraplp.Solver.NOT_SOLVED else 'solver_error')
    assert 'feasibility_status' not in response.json()


def test_joint_unavailable_solver_maps_through_real_adapter_to_http(monkeypatch):
    monkeypatch.setattr(solver, '_create_solver', lambda: None)
    scenario = joint_demonstration_configs()['joint_price_shift'].scenario
    with pytest.raises(solver.OptimizationSolverError):
        optimize_scenario(scenario, optimize_flexible=True)
    response = client.post('/api/optimize?scheduling_mode=joint', json=scenario.model_dump(mode='json'))
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'solver_unavailable'


def test_joint_unverified_output_cannot_become_success(monkeypatch):
    extract = solver._extract_schedules
    def corrupt(variables, fixed):
        schedules = extract(variables, fixed)
        schedules['flexible:pump'] = [0]*24
        return schedules
    monkeypatch.setattr(solver, '_extract_schedules', corrupt)
    scenario = joint_demonstration_configs()['joint_price_shift'].scenario
    with pytest.raises(solver.OptimizationVerificationError):
        optimize_scenario(scenario, optimize_flexible=True)
    response = client.post('/api/optimize?scheduling_mode=joint', json=scenario.model_dump(mode='json'))
    assert response.status_code == 500
    assert response.json()['detail']['code'] == 'verification_failed'
    assert 'feasibility_status' not in response.json()


def test_joint_adapter_retains_verified_primary_after_secondary_timeout(monkeypatch):
    calls = 0
    def run(engine):
        nonlocal calls
        calls += 1
        return engine.Solve() if calls == 1 else pywraplp.Solver.NOT_SOLVED
    monkeypatch.setattr(solver, '_run_solver', run)
    scenario = joint_demonstration_configs()['joint_price_shift'].scenario
    result = optimize_scenario(scenario, optimize_flexible=True)
    check_metrics(scenario, result, energy=26, cost=7.3, peak=3)


def test_shared_joint_costs_remain_energy_only_with_detailed_tariff():
    config = joint_demonstration_configs()['joint_price_shift']
    config.tariff = Tariff(demand_charge_usd_per_kw=1, existing_monthly_peak_kw=1,
                           fixed_charge_usd=2)
    detailed = ORToolsSchedulingEngine(optimize_flexible=True).optimize(config)
    result = optimize_scenario(config.scenario, optimize_flexible=True)
    check_metrics(config.scenario, result, energy=26, cost=7.3, peak=3)
    assert detailed.optimized.energy_charges_usd == pytest.approx(7.6, abs=2e-7)
    assert detailed.optimized.baseline_operating_cost_usd == pytest.approx(10.6, abs=2e-7)
    assert result.baseline_electricity_cost_usd == pytest.approx(7.9, abs=2e-7)
