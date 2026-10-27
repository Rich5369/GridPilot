"""Hand-checkable LP objectives and independent electrical assertions."""
from copy import deepcopy
from pathlib import Path

import pytest
from ortools.linear_solver import pywraplp

from backend.models.contracts import Scenario
from backend.optimizer import solver
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.scheduler import ORToolsSchedulingEngine, _comparison
from backend.simulator.building import BuildingConfig
from backend.simulator.engine import evaluate_building_schedules, simulate_building
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules


@pytest.fixture
def scenario():
    return Scenario.model_validate(dict(
        operating_hours={'start_hour': 8, 'end_hour': 18}, fixed_demand_kw=[1] * 24,
        electricity_prices_usd_per_kwh=[0.4, 0.1] + [0.3] * 22,
        building_max_demand_kw=5,
        ev_requirements=[dict(id='a', arrival_hour=0, deadline_hour=2,
                              energy_required_kwh=2, max_charging_power_kw=2)]))


def as_building(scenario, **tariff):
    return BuildingConfig(name='Hand-checkable office', scenario=scenario,
                          background_loads_kw={'base': scenario.fixed_demand_kw},
                          hvac_demand_kw=[0] * 24, hvac_max_power_kw=0, tariff=tariff)


def assert_verified(scenario, outcome):
    assert outcome.status in ('optimal', 'feasible'), outcome.reasons
    schedules = outcome.schedules
    assert schedules['fixed'] == scenario.fixed_demand_kw
    for ev in scenario.ev_requirements:
        loads = schedules[f'ev:{ev.id}']
        assert sum(loads) == pytest.approx(ev.energy_required_kwh, abs=1e-6)
        for h, power in enumerate(loads):
            assert -1e-6 <= power <= ev.max_charging_power_kw + 1e-6
            if not ev.arrival_hour <= h < ev.deadline_hour:
                assert abs(power) <= 1e-6
    held = baseline_schedules(scenario)
    for key in held:
        if not key.startswith('ev:'):
            assert schedules[key] == held[key]
    demand = [sum(values[h] for values in schedules.values()) for h in range(24)]
    assert max(demand) <= scenario.building_max_demand_kw + 1e-6
    assert outcome.evaluated.demand_kw == pytest.approx(demand)
    assert outcome.evaluated.peak_demand_kw == pytest.approx(max(demand))
    assert outcome.evaluated.electricity_cost_usd == pytest.approx(
        sum(p * price for p, price in zip(demand, scenario.electricity_prices_usd_per_kwh)))
    assert not outcome.evaluated.constraint_violations


def test_hand_checkable_price_shift_and_shared_adapter(scenario):
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    # Fixed energy costs .4 + .1 + 22*.3 = $7.10; EV 2*.1 = $.20.
    assert outcome.evaluated.electricity_cost_usd == pytest.approx(7.3, abs=2e-7)
    assert sum(outcome.schedules['ev:a'][1:2]) == pytest.approx(2, abs=1e-6)
    result = optimize_scenario(scenario)
    assert result.baseline_electricity_cost_usd == pytest.approx(7.9)
    assert result.optimized_electricity_cost_usd == pytest.approx(7.3, abs=2e-7)
    assert outcome.primary_status == outcome.secondary_status == 'optimal'


def test_multiple_evs_resolve_overloaded_baseline(scenario):
    data = scenario.model_dump()
    data.update(building_max_demand_kw=3, electricity_prices_usd_per_kwh=[0.2]*24)
    data['ev_requirements'].append({**data['ev_requirements'][0], 'id':'b'})
    scenario = Scenario.model_validate(data)
    result = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert result.baseline.feasibility_status == 'infeasible'
    assert result.baseline.peak_demand_kw == 5
    assert result.baseline.constraint_violations
    assert result.status == 'optimal'
    assert result.optimized.peak_demand_kw == pytest.approx(3)
    assert not result.optimized.constraint_violations
    assert result.comparison.valid
    assert result.comparison.energy_charge_reduction_usd == pytest.approx(0, abs=2e-7)
    assert_verified(scenario, solver.solve_ev_charging(scenario))
    assert optimize_scenario(scenario).constraint_violations == []


def test_impossible_energy_deadline_preserves_partial_baseline(scenario):
    data = scenario.model_dump()
    data['ev_requirements'][0]['energy_required_kwh'] = 5
    scenario = Scenario.model_validate(data)
    r = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert r.status == 'infeasible' and r.optimized is None and r.comparison is None
    assert r.baseline.feasibility_status == 'infeasible'
    assert sum(r.baseline.equipment_schedules_kw['ev:a']) == 4
    assert any('availability-window' in x for x in r.infeasibility_reasons)
    shared = optimize_scenario(scenario)
    assert shared.optimized_electricity_cost_usd is None
    assert shared.constraint_violations


def test_fixed_demand_above_cap(scenario):
    data = scenario.model_dump()
    data['fixed_demand_kw'][23] = 6  # Outside business hours still authoritative.
    r = solver.solve_ev_charging(Scenario.model_validate(data))
    assert r.status == 'infeasible' and r.schedules is None
    assert any('fixed demand' in reason for reason in r.reasons)


def test_shared_site_capacity_proves_infeasibility(scenario):
    data = scenario.model_dump()
    data['building_max_demand_kw'] = 2
    data['ev_requirements'].append({**data['ev_requirements'][0], 'id':'b'})
    r = solver.solve_ev_charging(Scenario.model_validate(data))
    assert r.status == 'infeasible'
    assert any('shared charging capacity' in x for x in r.reasons)


def test_fixed_flexible_load_is_included_once(scenario):
    data = scenario.model_dump()
    data['building_max_demand_kw'] = 3
    data['flexible_equipment'] = [dict(id='pump', available_hours={'start_hour':1,'end_hour':2},
                                       energy_required_kwh=1, max_power_kw=1)]
    scenario = Scenario.model_validate(data)
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    # Cheap hour can accept only 1 kWh of EV charging, the other goes at $.40.
    # Fixed cost $7.10, pump $.10, EV $.50 -> $7.70.
    assert outcome.evaluated.electricity_cost_usd == pytest.approx(7.7, abs=2e-7)
    assert outcome.schedules['flexible:pump'][1] == 1
    assert outcome.evaluated.demand_kw[1] == pytest.approx(3, abs=1e-6)
    data['flexible_equipment'][0]['energy_required_kwh'] = 3
    assert solver.solve_ev_charging(Scenario.model_validate(data)).status == 'infeasible'


def test_solver_proven_infeasibility_when_charger_and_site_headroom_interact(scenario):
    data = scenario.model_dump()
    data['fixed_demand_kw'][:2] = [0, 2]
    data['building_max_demand_kw'] = 2
    data['ev_requirements'][0]['max_charging_power_kw'] = 1
    result = solver.solve_ev_charging(Scenario.model_validate(data))
    assert result.status == result.primary_status == 'infeasible'
    assert result.schedules is None and any('GLOP proved' in x for x in result.reasons)


def test_deadline_boundary_fractional_average(scenario):
    data = scenario.model_dump()
    data['electricity_prices_usd_per_kwh'][2] = -10  # Deadline hour is unavailable.
    data['ev_requirements'][0].update(arrival_hour=1, energy_required_kwh=0.5)
    scenario = Scenario.model_validate(data)
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    assert outcome.schedules['ev:a'][1] == pytest.approx(0.5)
    assert outcome.schedules['ev:a'][0] == outcome.schedules['ev:a'][2] == 0


@pytest.mark.parametrize('zero_evs', [True, False])
def test_zero_evs_and_zero_energy(scenario, zero_evs):
    data = scenario.model_dump()
    if zero_evs:
        data['ev_requirements'] = []
    else:
        data['ev_requirements'][0]['energy_required_kwh'] = 0
    scenario = Scenario.model_validate(data)
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    assert outcome.evaluated.demand_kw == [1]*24


def test_negative_prices_cannot_overcharge(scenario):
    data = scenario.model_dump()
    data['electricity_prices_usd_per_kwh'] = [-1]*24
    scenario = Scenario.model_validate(data)
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    assert sum(outcome.schedules['ev:a']) == pytest.approx(2)
    assert outcome.evaluated.electricity_cost_usd == pytest.approx(-26)
    # Equal price: secondary objective spreads EV power over its two-hour window.
    assert outcome.evaluated.peak_demand_kw == pytest.approx(2)


@pytest.mark.parametrize('history,rate,objective', [
    (1, 1, 'energy_plus_incremental_demand'),
    (None, 1, 'energy_only'), (1, 0, 'energy_only'),
])
def test_demand_tariff_objectives(scenario, history, rate, objective):
    config = as_building(scenario, demand_charge_usd_per_kw=rate,
                         existing_monthly_peak_kw=history, fixed_charge_usd=2)
    r = ORToolsSchedulingEngine().optimize(config)
    assert r.status == 'optimal'
    assert r.solver_metadata.objective == objective
    assert r.optimized.fixed_charge_usd == r.baseline.fixed_charge_usd == 2
    if history is None:
        assert r.optimized.incremental_demand_charge_usd is None
        assert r.optimized.baseline_operating_cost_usd is None
        assert r.comparison.modeled_cost_reduction_usd is None
        assert r.comparison.conditional_demand_charge_reduction_usd is None
        assert r.solver_metadata.warnings
    elif rate:
        # Equal sharing costs EV $.50 rather than $.20, but cuts demand fee $2->$1.
        assert r.optimized.peak_demand_kw == pytest.approx(2, abs=1e-6)
        assert r.optimized.energy_charges_usd == pytest.approx(7.6, abs=2e-7)
        assert r.optimized.incremental_demand_charge_usd == pytest.approx(1, abs=1e-6)
        assert r.optimized.baseline_operating_cost_usd == pytest.approx(10.6, abs=2e-7)
    else:
        assert r.optimized.energy_charges_usd == pytest.approx(7.3, abs=2e-7)
        assert r.optimized.incremental_demand_charge_usd == 0


def test_office_regression_and_independent_metrics():
    c = BuildingConfig.model_validate_json(Path('sample_data/commercial_office.json').read_text())
    r = ORToolsSchedulingEngine().optimize(c)
    assert r.status == 'optimal'
    assert r.baseline.total_energy_kwh == pytest.approx(208)
    assert r.baseline.peak_demand_kw == pytest.approx(28.5)
    assert r.baseline.energy_charges_usd == pytest.approx(40.184)
    assert r.optimized.total_energy_kwh == pytest.approx(208)
    assert r.optimized.energy_charges_usd == pytest.approx(40.184, abs=2e-7)
    assert r.optimized.peak_demand_kw == pytest.approx(18.35, abs=1e-6)
    assert r.optimized.incremental_demand_charge_usd == 0
    assert r.comparison.conditional_demand_charge_reduction_usd == pytest.approx(6)
    for key, values in r.baseline.equipment_schedules_kw.items():
        if not key.startswith('ev:'):
            assert r.optimized.equipment_schedules_kw[key] == values
    # Metrics from the returned schedules, not baseline reconstruction.
    demand = [sum(v[h] for v in r.optimized.equipment_schedules_kw.values()) for h in range(24)]
    assert r.optimized.demand_kw == pytest.approx(demand)
    assert sum(demand) == pytest.approx(r.optimized.total_energy_kwh)
    charges = [demand[h]*c.scenario.electricity_prices_usd_per_kwh[h] for h in range(24)]
    assert r.optimized.hourly_energy_charges_usd == pytest.approx(charges)
    assert sum(charges) == pytest.approx(r.optimized.energy_charges_usd)
    assert r.optimized.peak_demand_kw == pytest.approx(max(demand))


@pytest.mark.parametrize('mutation', ['energy', 'window', 'power', 'fixed', 'flexible'])
def test_independent_evaluator_rejects_changed_or_invalid_schedules(scenario, mutation):
    data = scenario.model_dump()
    data['flexible_equipment'] = [dict(id='pump', available_hours={'start_hour':4,'end_hour':6},
                                       energy_required_kwh=1, max_power_kw=1)]
    config = as_building(Scenario.model_validate(data))
    schedules = deepcopy(simulate_building(config).equipment_schedules_kw)
    if mutation == 'energy':
        schedules['ev:a'] = [0]*24
    elif mutation == 'window':
        schedules['ev:a'][0], schedules['ev:a'][2] = 0, 2
    elif mutation == 'power':
        schedules['ev:a'][0] = 3
    elif mutation == 'fixed':
        schedules['background:base'][0] += 1
    else:
        schedules['flexible:pump'][4], schedules['flexible:pump'][5] = 0, 1
    result = evaluate_building_schedules(config, schedules)
    assert result.feasibility_status == 'infeasible'
    assert result.constraint_violations


def test_comparison_invalid_for_incomplete_baseline(scenario):
    config = as_building(scenario)
    complete = simulate_building(config)
    incomplete = complete.model_copy(deep=True)
    incomplete.equipment_schedules_kw['ev:a'] = [0]*24
    comparison = _comparison(config, incomplete, complete)
    assert not comparison.valid and comparison.invalid_reasons
    assert comparison.modeled_cost_reduction_usd is None
    assert comparison.energy_charge_reduction_usd is None


@pytest.mark.parametrize('code,status,exception', [
    (pywraplp.Solver.NOT_SOLVED, 'unresolved', solver.OptimizationUnresolvedError),
    (pywraplp.Solver.ABNORMAL, 'error', solver.OptimizationSolverError),
    (pywraplp.Solver.UNBOUNDED, 'error', solver.OptimizationSolverError),
    (pywraplp.Solver.MODEL_INVALID, 'error', solver.OptimizationSolverError),
])
def test_solver_failure_is_never_infeasibility(monkeypatch, scenario, code, status, exception):
    monkeypatch.setattr(solver, '_run_solver', lambda _: code)
    detailed = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert detailed.status == status
    assert detailed.optimized is None and detailed.comparison is None
    assert detailed.failure_reasons and not detailed.infeasibility_reasons
    assert detailed.baseline
    with pytest.raises(exception):
        optimize_scenario(scenario)


def test_missing_solver_and_solver_exception(monkeypatch, scenario):
    monkeypatch.setattr(solver, '_create_solver', lambda: None)
    with pytest.raises(solver.OptimizationSolverError):
        optimize_scenario(scenario)
    def broken():
        raise RuntimeError('simulated native solver error')
    monkeypatch.setattr(solver, '_create_solver', broken)
    r = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert r.status == 'error' and r.optimized is None


def test_verified_feasible_without_optimality_proof(monkeypatch, scenario):
    def feasible(engine):
        assert engine.Solve() == pywraplp.Solver.OPTIMAL
        return pywraplp.Solver.FEASIBLE
    monkeypatch.setattr(solver, '_run_solver', feasible)
    result = solver.solve_ev_charging(scenario)
    assert_verified(scenario, result)
    assert result.status == 'feasible' and result.primary_optimum_usd is None
    assert result.secondary_status == 'not_run'
    assert result.warnings


def test_secondary_timeout_retains_verified_primary(monkeypatch, scenario):
    calls = 0
    def run(engine):
        nonlocal calls
        calls += 1
        return engine.Solve() if calls == 1 else pywraplp.Solver.NOT_SOLVED
    monkeypatch.setattr(solver, '_run_solver', run)
    result = solver.solve_ev_charging(scenario)
    assert_verified(scenario, result)
    assert result.status == 'optimal' and result.secondary_status == 'unresolved'
    assert result.warnings


def test_secondary_error_returns_no_optimized_values(monkeypatch, scenario):
    calls = 0
    def run(engine):
        nonlocal calls
        calls += 1
        return engine.Solve() if calls == 1 else pywraplp.Solver.ABNORMAL
    monkeypatch.setattr(solver, '_run_solver', run)
    result = solver.solve_ev_charging(scenario)
    assert result.status == 'error' and result.schedules is None


@pytest.mark.parametrize('mutation', ['energy', 'nonfinite', 'fixed', 'cost'])
def test_solver_values_must_pass_independent_verification(monkeypatch, scenario, mutation):
    extract = solver._extract_schedules
    def corrupt(variables, fixed):
        schedules = extract(variables, fixed)
        if mutation == 'energy':
            schedules['ev:a'] = [0]*24
        elif mutation == 'nonfinite':
            schedules['ev:a'][0] = float('nan')
        elif mutation == 'fixed':
            schedules['fixed'][0] += 0.1
        else:
            # Feasible but wrong cost: independently evaluated objective must fail.
            schedules['ev:a'] = [2]+[0]*23
        return schedules
    monkeypatch.setattr(solver, '_extract_schedules', corrupt)
    with pytest.raises(solver.OptimizationVerificationError):
        optimize_scenario(scenario)
    r = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert r.status == 'verification_failed'
    assert r.optimized is None and r.failure_reasons


def test_schedule_shape_and_missing_keys_raise_validation_error(scenario):
    with pytest.raises(ValueError):
        evaluate_scenario_schedules(scenario, {'fixed': [1]*23})
    config = as_building(scenario)
    with pytest.raises(ValueError, match='keys'):
        evaluate_building_schedules(config, {})
    with pytest.raises(ValueError, match='keys'):
        evaluate_scenario_schedules(scenario, {})


def test_end_of_day_window_and_site_limit_not_business_hours(scenario):
    data = scenario.model_dump()
    data['ev_requirements'][0].update(arrival_hour=23, deadline_hour=24,
                                     energy_required_kwh=0.75)
    scenario = Scenario.model_validate(data)
    outcome = solver.solve_ev_charging(scenario)
    assert_verified(scenario, outcome)
    assert outcome.schedules['ev:a'][23] == pytest.approx(0.75)


def test_evaluator_accepts_roundoff_in_fixed_component_aggregation(scenario):
    data = scenario.model_dump()
    data['fixed_demand_kw'] = [0.3]*24
    config = BuildingConfig(name='Floating point decomposition', scenario=data,
                          background_loads_kw={'one':[0.1]*24, 'two':[0.2]*24},
                          hvac_demand_kw=[0]*24, hvac_max_power_kw=0)
    r = ORToolsSchedulingEngine().optimize(config)
    assert r.status == 'optimal'
    assert r.baseline.feasibility_status == r.optimized.feasibility_status == 'feasible'


def test_secondary_feasible_without_peak_proof(monkeypatch, scenario):
    calls = 0
    def run(engine):
        nonlocal calls
        calls += 1
        code = engine.Solve()
        assert code == pywraplp.Solver.OPTIMAL
        return code if calls == 1 else pywraplp.Solver.FEASIBLE
    monkeypatch.setattr(solver, '_run_solver', run)
    r = solver.solve_ev_charging(scenario)
    assert_verified(scenario, r)
    assert r.status == 'optimal' and r.secondary_status == 'feasible'
    assert any('without a peak optimality proof' in warning for warning in r.warnings)


def test_detailed_evaluation_failure_is_not_infeasibility(monkeypatch, scenario):
    from backend.optimizer import scheduler
    def fail(*args, **kwargs):
        raise ValueError('independent component verification failure')
    monkeypatch.setattr(scheduler, 'evaluate_building_schedules', fail)
    result = ORToolsSchedulingEngine().optimize(as_building(scenario))
    assert result.status == 'verification_failed' and result.optimized is None
    assert not result.infeasibility_reasons and result.failure_reasons


def test_demos_have_expected_statuses_and_metrics():
    from backend.optimizer.__main__ import demonstration_configs
    results = {key: ORToolsSchedulingEngine().optimize(value)
               for key, value in demonstration_configs().items()}
    assert [r.status for r in results.values()] == ['optimal']*3 + ['infeasible']
    assert results['price_shift'].comparison.energy_charge_reduction_usd == pytest.approx(0.6, abs=2e-7)
    assert results['tight_cap'].optimized.peak_demand_kw == pytest.approx(3)
    assert results['infeasible'].optimized is None


def test_independent_peak_verification_rejects_nonminimal_equal_cost_schedule(monkeypatch, scenario):
    data = scenario.model_dump()
    data['electricity_prices_usd_per_kwh'] = [0.2]*24
    scenario = Scenario.model_validate(data)
    extract = solver._extract_schedules
    def wrong_peak(variables, fixed):
        schedules = extract(variables, fixed)
        schedules['ev:a'] = [2]+[0]*23
        return schedules
    monkeypatch.setattr(solver, '_extract_schedules', wrong_peak)
    with pytest.raises(solver.OptimizationVerificationError, match='secondary optimum'):
        optimize_scenario(scenario)
