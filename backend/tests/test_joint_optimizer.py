"""Joint-mode engineering checks, independent of LP expressions and evaluators."""
from copy import deepcopy
import json
import subprocess
import sys

import pytest
from ortools.linear_solver import pywraplp

from backend.optimizer import solver
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.scheduler import ORToolsSchedulingEngine
from backend.simulator.building import BuildingConfig
from backend.simulator.engine import evaluate_building_schedules, simulate_building
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules


def case(name):
    return joint_demonstration_configs()[name]


def joint(config):
    return ORToolsSchedulingEngine(optimize_flexible=True).optimize(config)


def independently_check(config, result):
    """Reconstruct physical totals from detailed output, without engine helpers."""
    assert result.status in ('optimal', 'feasible'), result.failure_reasons
    assert result.scheduling_mode == 'joint'
    optimized = result.optimized
    assert optimized.feasibility_status == 'feasible'
    schedules = optimized.equipment_schedules_kw
    expected_keys = {'hvac'} | {f'background:{key}' for key in config.background_loads_kw}
    items = [(f'ev:{ev.id}', ev.arrival_hour, ev.deadline_hour,
              ev.energy_required_kwh, ev.max_charging_power_kw)
             for ev in config.scenario.ev_requirements]
    items += [(f'flexible:{item.id}', item.available_hours.start_hour,
               item.available_hours.end_hour, item.energy_required_kwh, item.max_power_kw)
              for item in config.scenario.flexible_equipment]
    assert set(schedules) == expected_keys | {item[0] for item in items}
    for key in expected_keys:
        assert schedules[key] == result.baseline.equipment_schedules_kw[key]
    for key, start, end, energy, limit in items:
        values = schedules[key]
        assert len(values) == 24
        assert sum(values) == pytest.approx(energy, abs=1e-6)
        for hour, power in enumerate(values):
            assert 0 <= power <= limit + 1e-6
            if not start <= hour < end:
                assert power == pytest.approx(0, abs=1e-6)
    demand = [sum(values[h] for values in schedules.values()) for h in range(24)]
    assert max(demand) <= config.scenario.building_max_demand_kw + 1e-6
    assert optimized.demand_kw == pytest.approx(demand, abs=1e-6)
    assert optimized.total_energy_kwh == pytest.approx(sum(demand), abs=1e-6)
    assert optimized.peak_demand_kw == pytest.approx(max(demand), abs=1e-6)
    assert optimized.energy_charges_usd == pytest.approx(sum(
        demand[h] * config.scenario.electricity_prices_usd_per_kwh[h] for h in range(24)), abs=2e-7)


def test_recovery_preserves_default_and_transfers_flexible_schedule():
    config = case('joint_recovery')
    baseline = simulate_building(config)
    held = ORToolsSchedulingEngine().optimize(config)
    shared = optimize_scenario(config.scenario)
    assert held.scheduling_mode == 'ev_only'
    assert held.status == shared.feasibility_status == 'infeasible'
    assert held.optimized is None and shared.optimized_demand_kw is None
    result = joint(config)
    independently_check(config, result)
    assert result.baseline == held.baseline == baseline
    assert baseline.peak_demand_kw == 5
    assert baseline.feasibility_status == 'infeasible'
    assert result.optimized.equipment_schedules_kw['ev:a'] == pytest.approx([2]+[0]*23, abs=1e-6)
    assert result.optimized.equipment_schedules_kw['flexible:pump'] == pytest.approx([0, 2]+[0]*22, abs=1e-6)
    assert result.optimized.total_energy_kwh == pytest.approx(28)
    assert result.optimized.energy_charges_usd == pytest.approx(5.6, abs=2e-7)
    assert result.optimized.peak_demand_kw == pytest.approx(3, abs=1e-6)
    assert result.comparison.valid


def test_flexible_only_price_shift_and_default_preservation():
    config = case('joint_price_shift')
    held = ORToolsSchedulingEngine().optimize(config)
    result = joint(config)
    independently_check(config, result)
    assert held.status == result.status == 'optimal'
    assert held.optimized.equipment_schedules_kw == held.baseline.equipment_schedules_kw
    assert held.optimized.energy_charges_usd == pytest.approx(7.9)
    assert result.baseline == held.baseline
    assert result.optimized.total_energy_kwh == result.baseline.total_energy_kwh == pytest.approx(26)
    assert result.optimized.energy_charges_usd == pytest.approx(7.3, abs=2e-7)
    assert result.solver_metadata.primary_optimum_usd == pytest.approx(7.3, abs=2e-7)
    assert result.optimized.equipment_schedules_kw['flexible:pump'][1] == pytest.approx(2, abs=1e-6)
    # Independent evaluators accept shifted work only with explicit joint mode.
    shared = {'fixed': list(config.scenario.fixed_demand_kw),
              'flexible:pump': result.optimized.equipment_schedules_kw['flexible:pump']}
    assert evaluate_scenario_schedules(config.scenario, shared).constraint_violations
    assert not evaluate_scenario_schedules(config.scenario, shared, optimize_flexible=True).constraint_violations
    assert evaluate_building_schedules(config, result.optimized.equipment_schedules_kw).constraint_violations
    assert not evaluate_building_schedules(config, result.optimized.equipment_schedules_kw,
                                           optimize_flexible=True).constraint_violations


def test_shared_capacity_infeasibility_counts_ev_and_flexible_energy():
    result = joint(case('joint_infeasible'))
    assert result.scheduling_mode == 'joint'
    assert result.status == 'infeasible'
    assert result.optimized is result.comparison is None
    assert not result.constraints_satisfied and not result.failure_reasons
    assert result.solver_metadata.primary_status == 'analytic_infeasibility'
    assert any('Window [0, 2)' in reason and '5 kWh' in reason and '4 kWh' in reason
               and 'EVs and flexible equipment' in reason for reason in result.infeasibility_reasons)


def test_bad_held_equipment_placement_is_not_joint_infeasibility():
    config = case('joint_price_shift')
    data = config.model_dump()
    data['scenario']['building_max_demand_kw'] = 2
    config = BuildingConfig.model_validate(data)
    assert ORToolsSchedulingEngine().optimize(config).status == 'infeasible'
    result = joint(config)
    independently_check(config, result)
    assert result.optimized.equipment_schedules_kw['flexible:pump'][:2] == pytest.approx([1, 1], abs=1e-6)


@pytest.mark.parametrize('conflict,proof,reason', [
    ('immutable', 'analytic_infeasibility', 'immutable background/HVAC demand'),
    ('item', 'analytic_infeasibility', 'availability-window capacity'),
    ('flexible_window', 'analytic_infeasibility', 'Window [4, 5)'),
    ('lp_interaction', 'infeasible', 'GLOP proved'),
])
def test_joint_infeasibility_diagnostics_and_solver_proof(conflict, proof, reason):
    data = case('joint_price_shift').model_dump()
    if conflict == 'immutable':
        data['scenario']['building_max_demand_kw'] = 0.5
    elif conflict == 'item':
        data['scenario']['flexible_equipment'][0]['energy_required_kwh'] = 5
    elif conflict == 'flexible_window':
        # Both individually fit, but only 2 kWh site headroom in this later window.
        item = data['scenario']['flexible_equipment'][0]
        item['available_hours'] = {'start_hour': 4, 'end_hour': 5}
        data['scenario']['flexible_equipment'].append({**deepcopy(item), 'id': 'second'})
    else:
        # Aggregate window headroom is 2 kWh; item can use only 1 kWh of it
        # because of its own power bound. Necessary window checks cannot prove this.
        data['scenario']['fixed_demand_kw'][:2] = [0, 2]
        data['background_loads_kw']['base'][:2] = [0, 2]
        data['scenario']['building_max_demand_kw'] = 2
        data['scenario']['flexible_equipment'][0]['max_power_kw'] = 1
    result = joint(BuildingConfig.model_validate(data))
    assert result.status == 'infeasible' and result.optimized is result.comparison is None
    assert result.solver_metadata.primary_status == proof
    assert any(reason in message for message in result.infeasibility_reasons)
    assert not result.failure_reasons


def test_joint_named_fixed_profiles_cannot_change_even_with_same_aggregate():
    data = case('joint_price_shift').model_dump()
    data.update(background_loads_kw={'base': [0.6]*24}, hvac_demand_kw=[0.4]*24,
                hvac_max_power_kw=1)
    config = BuildingConfig.model_validate(data)
    result = joint(config)
    schedules = deepcopy(result.optimized.equipment_schedules_kw)
    schedules['background:base'][0] += 0.1
    schedules['hvac'][0] -= 0.1
    evaluated = evaluate_building_schedules(config, schedules, optimize_flexible=True)
    assert evaluated.demand_kw == pytest.approx(result.optimized.demand_kw)
    assert evaluated.feasibility_status == 'infeasible'
    assert 'Fixed schedule background:base changed' in evaluated.constraint_violations
    assert 'Fixed schedule hvac changed' in evaluated.constraint_violations


@pytest.mark.parametrize('energy', [0, 0.5, 2])
def test_negative_prices_exact_flexible_energy_and_exclusive_window(energy):
    data = case('joint_price_shift').model_dump()
    data['scenario']['electricity_prices_usd_per_kwh'] = [-1]*24
    data['scenario']['electricity_prices_usd_per_kwh'][2] = -100
    data['scenario']['flexible_equipment'][0]['energy_required_kwh'] = energy
    config = BuildingConfig.model_validate(data)
    result = joint(config)
    independently_check(config, result)
    assert result.optimized.energy_charges_usd == pytest.approx(-123-energy, abs=2e-7)
    assert result.optimized.equipment_schedules_kw['flexible:pump'][2] == 0
    assert result.optimized.peak_demand_kw == pytest.approx(1+energy/2, abs=1e-6)


def test_joint_without_any_movable_loads():
    data = case('joint_price_shift').model_dump()
    data['scenario']['flexible_equipment'] = []
    config = BuildingConfig.model_validate(data)
    result = joint(config)
    independently_check(config, result)
    assert result.optimized.demand_kw == [1]*24


@pytest.mark.parametrize('mutation,reason', [
    ('energy', 'delivered energy'), ('window', 'outside availability'),
    ('power', 'power bounds'), ('cap', 'building limit'),
    ('background', 'Fixed schedule background:base'), ('hvac', 'Fixed schedule hvac'),
])
def test_independent_joint_evaluation_rejects_invalid_loads(mutation, reason):
    data = case('joint_price_shift').model_dump()
    data.update(background_loads_kw={'base': [0.6]*24}, hvac_demand_kw=[0.4]*24,
                hvac_max_power_kw=1)
    config = BuildingConfig.model_validate(data)
    result = joint(config)
    independently_check(config, result)
    schedules = deepcopy(result.optimized.equipment_schedules_kw)
    if mutation == 'energy':
        schedules['flexible:pump'] = [0]*24
    elif mutation == 'window':
        schedules['flexible:pump'] = [0, 0, 2]+[0]*21
    elif mutation == 'power':
        schedules['flexible:pump'] = [3]+[0]*23
    elif mutation == 'cap':
        config = config.model_copy(update={'scenario': config.scenario.model_copy(
            update={'building_max_demand_kw': 2})})
    else:
        schedules['background:base' if mutation == 'background' else 'hvac'][0] += 0.1
    evaluated = evaluate_building_schedules(config, schedules, optimize_flexible=True)
    assert evaluated.feasibility_status == 'infeasible'
    assert any(reason in message for message in evaluated.constraint_violations)
    if mutation in ('background', 'hvac'):
        assert evaluated.demand_kw[0] == pytest.approx(result.optimized.demand_kw[0]+0.1)


@pytest.mark.parametrize('mutation', ['missing', 'extra', 'nonfinite', 'shape'])
def test_joint_shared_evaluator_rejects_malformed_schedules(mutation):
    scenario = case('joint_price_shift').scenario
    schedules = baseline_schedules(scenario)
    if mutation == 'missing':
        del schedules['flexible:pump']
    elif mutation == 'extra':
        schedules['flexible:unknown'] = [0]*24
    elif mutation == 'nonfinite':
        schedules['flexible:pump'][0] = float('nan')
    else:
        schedules['flexible:pump'].pop()
    with pytest.raises(ValueError):
        evaluate_scenario_schedules(scenario, schedules, optimize_flexible=True)


@pytest.mark.parametrize('history', [1, None])
def test_joint_conditional_demand_objective(history):
    data = case('joint_price_shift').model_dump()
    data['tariff'] = dict(demand_charge_usd_per_kw=1, existing_monthly_peak_kw=history,
                          fixed_charge_usd=2)
    config = BuildingConfig.model_validate(data)
    result = joint(config)
    independently_check(config, result)
    assert result.optimized.fixed_charge_usd == 2
    if history is None:
        assert result.solver_metadata.objective == 'energy_only'
        assert result.optimized.baseline_operating_cost_usd is None
        assert result.comparison.conditional_demand_charge_reduction_usd is None
        assert result.solver_metadata.warnings
    else:
        # Energy alone shifts 2 kWh; with $1/kW incremental demand, 1+1 wins.
        assert result.solver_metadata.objective == 'energy_plus_incremental_demand'
        assert result.optimized.peak_demand_kw == pytest.approx(2, abs=1e-6)
        assert result.optimized.energy_charges_usd == pytest.approx(7.6, abs=2e-7)
        assert result.optimized.incremental_demand_charge_usd == pytest.approx(1, abs=1e-6)
        assert result.optimized.baseline_operating_cost_usd == pytest.approx(10.6, abs=2e-7)


@pytest.mark.parametrize('code,status', [
    (pywraplp.Solver.NOT_SOLVED, 'unresolved'), (pywraplp.Solver.ABNORMAL, 'error'),
    (pywraplp.Solver.MODEL_INVALID, 'error'), (pywraplp.Solver.UNBOUNDED, 'error'),
])
def test_joint_primary_failure_is_not_infeasibility(monkeypatch, code, status):
    monkeypatch.setattr(solver, '_run_solver', lambda _: code)
    result = joint(case('joint_price_shift'))
    assert result.status == status and result.scheduling_mode == 'joint'
    assert result.optimized is result.comparison is None
    assert result.failure_reasons and not result.infeasibility_reasons


@pytest.mark.parametrize('code', [pywraplp.Solver.NOT_SOLVED, pywraplp.Solver.ABNORMAL,
                                pywraplp.Solver.FEASIBLE])
def test_joint_secondary_outcomes_and_verified_primary_fallback(monkeypatch, code):
    calls = 0
    def run(engine):
        nonlocal calls
        calls += 1
        if calls == 1 or code == pywraplp.Solver.FEASIBLE:
            assert engine.Solve() == pywraplp.Solver.OPTIMAL
        return pywraplp.Solver.OPTIMAL if calls == 1 else code
    monkeypatch.setattr(solver, '_run_solver', run)
    config = case('joint_price_shift')
    result = joint(config)
    if code == pywraplp.Solver.ABNORMAL:
        assert result.status == 'error' and result.optimized is None
        assert result.failure_reasons and not result.infeasibility_reasons
    else:
        independently_check(config, result)
        assert result.status == 'optimal'
        assert result.solver_metadata.warnings
        assert result.optimized.energy_charges_usd == pytest.approx(7.3, abs=2e-7)


def test_joint_feasible_without_primary_proof(monkeypatch):
    def run(engine):
        assert engine.Solve() == pywraplp.Solver.OPTIMAL
        return pywraplp.Solver.FEASIBLE
    monkeypatch.setattr(solver, '_run_solver', run)
    config = case('joint_price_shift')
    result = joint(config)
    independently_check(config, result)
    assert result.status == 'feasible'
    assert result.solver_metadata.primary_optimum_usd is None
    assert result.solver_metadata.peak_tiebreak_status == 'not_run'


@pytest.mark.parametrize('corruption', ['energy', 'fixed', 'cost', 'nonfinite'])
def test_corrupt_joint_solver_output_is_verification_failure(monkeypatch, corruption):
    extract = solver._extract_schedules
    def corrupt(variables, fixed):
        schedules = extract(variables, fixed)
        if corruption == 'fixed':
            schedules['fixed'][0] += 0.1
        elif corruption == 'nonfinite':
            schedules['flexible:pump'][0] = float('nan')
        else:
            schedules['flexible:pump'] = ([0]*24 if corruption == 'energy' else [2]+[0]*23)
        return schedules
    monkeypatch.setattr(solver, '_extract_schedules', corrupt)
    result = joint(case('joint_price_shift'))
    assert result.status == 'verification_failed' and result.optimized is None
    assert result.failure_reasons and not result.infeasibility_reasons


def test_cli_selects_mode_and_reports_full_flexible_schedule():
    for flags, mode, cost in [([], 'ev_only', 7.9), (['--optimize-flexible'], 'joint', 7.3)]:
        completed = subprocess.run([sys.executable, '-m', 'backend.optimizer', '--json',
                                    '--example', 'joint_price_shift', *flags],
                                   check=True, capture_output=True, text=True)
        result = json.loads(completed.stdout)['joint_price_shift']
        assert result['scheduling_mode'] == mode
        assert result['optimized']['energy_charges_usd'] == pytest.approx(cost, abs=2e-7)
        assert sum(result['optimized']['equipment_schedules_kw']['flexible:pump']) == pytest.approx(2)
