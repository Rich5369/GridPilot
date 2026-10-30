"""Same-outcome E1 plans: independent arithmetic, physical and serialization checks."""
from copy import deepcopy
from math import isfinite

import pytest
from fastapi.testclient import TestClient
from ortools.linear_solver import pywraplp
from pydantic import ValidationError

from backend.main import app
from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer import interface, solver
from backend.optimizer.__main__ import demonstration_configs, joint_demonstration_configs


client = TestClient(app)
CASES = ['joint_recovery', 'joint_price_shift', 'joint_infeasible']


def check_components(scenario, result):
    plan = result.operating_plan
    assert plan is not None
    expected = [(ev.id, 'ev', ev.arrival_hour, ev.deadline_hour,
                 ev.energy_required_kwh, ev.max_charging_power_kw) for ev in scenario.ev_requirements]
    expected += [(e.id, 'flexible', e.available_hours.start_hour, e.available_hours.end_hour,
                  e.energy_required_kwh, e.max_power_kw) for e in scenario.flexible_equipment]
    assert [(d.device_id, d.device_type) for d in plan.device_schedules] == [(e[0], e[1]) for e in expected]
    baseline = list(scenario.fixed_demand_kw)
    optimized = list(scenario.fixed_demand_kw)
    for device, (identifier, kind, start, end, energy, bound) in zip(plan.device_schedules, expected):
        assert device.required_energy_kwh == energy
        assert device.max_power_kw == bound
        assert (device.available_hours.start_hour, device.available_hours.end_hour) == (start, end)
        assert sum(device.baseline_power_kw) == pytest.approx(device.baseline_delivered_energy_kwh, abs=1e-6)
        for h, power in enumerate(device.baseline_power_kw):
            baseline[h] += power
        if result.feasibility_status == 'infeasible':
            assert device.optimized_power_kw is device.optimized_delivered_energy_kwh is None
            continue
        values = device.optimized_power_kw
        assert len(values) == 24 and all(isfinite(p) and 0 <= p <= bound + 1e-6 for p in values)
        assert sum(values) == pytest.approx(energy, abs=1e-6)
        assert device.optimized_delivered_energy_kwh == pytest.approx(sum(values), abs=1e-6)
        assert all(abs(values[h]) <= 1e-6 for h in range(24) if not start <= h < end)
        if kind == 'flexible' and plan.scheduling_mode == 'ev_only':
            assert device.scheduling_role == 'held_at_baseline'
            assert values == device.baseline_power_kw
        else:
            assert device.scheduling_role == 'optimized'
        for h, power in enumerate(values):
            optimized[h] += power
    assert baseline == pytest.approx(result.baseline_demand_kw, abs=1e-6)
    assert max(baseline) == pytest.approx(result.baseline_peak_demand_kw, abs=1e-6)
    assert sum(d*p for d,p in zip(baseline, scenario.electricity_prices_usd_per_kwh)) == pytest.approx(result.baseline_electricity_cost_usd, abs=2e-7)
    if result.feasibility_status == 'feasible':
        assert plan.verification_status == 'passed'
        assert optimized == pytest.approx(result.optimized_demand_kw, abs=1e-6)
        assert sum(optimized) == pytest.approx(sum(result.optimized_demand_kw), abs=1e-6)
        assert max(optimized) <= scenario.building_max_demand_kw + 1e-6
        assert max(optimized) == pytest.approx(result.optimized_peak_demand_kw, abs=1e-6)
        assert sum(d*p for d,p in zip(optimized, scenario.electricity_prices_usd_per_kwh)) == pytest.approx(result.optimized_electricity_cost_usd, abs=2e-7)
    else:
        assert plan.solver_status == 'infeasible' and plan.verification_status == 'unavailable'
        assert result.constraint_violations


@pytest.mark.parametrize('joint', [False, True])
@pytest.mark.parametrize('name', CASES)
def test_exact_same_outcome_supplies_device_and_aggregate_values(monkeypatch, name, joint):
    scenario = joint_demonstration_configs()[name].scenario
    solve = interface.solve_ev_charging
    calls = []
    create = solver._create_solver
    instances = []
    def counted_create():
        instance = create()
        instances.append(instance)
        return instance
    def record(*args, **kwargs):
        outcome = solve(*args, **kwargs)
        calls.append(outcome)
        return outcome
    monkeypatch.setattr(interface, 'solve_ev_charging', record)
    monkeypatch.setattr(solver, '_create_solver', counted_create)
    result = interface.optimize_scenario(scenario, optimize_flexible=joint)
    assert len(calls) == 1, 'Never run a second optimization to reconstruct device plans'
    outcome = calls[0]
    assert len(instances) == (0 if outcome.primary_status == 'analytic_infeasibility' else 1)
    check_components(scenario, result)
    assert result.operating_plan.solver_status == outcome.status
    assert result.operating_plan.warnings == outcome.warnings
    if outcome.schedules is not None:
        for device in result.operating_plan.device_schedules:
            assert device.optimized_power_kw == outcome.schedules[f'{device.device_type}:{device.device_id}']
            assert device.optimized_power_kw is not outcome.schedules[f'{device.device_type}:{device.device_id}']
        assert result.optimized_demand_kw == outcome.evaluated.demand_kw
        assert result.optimized_electricity_cost_usd == outcome.evaluated.electricity_cost_usd
        assert result.optimized_peak_demand_kw == outcome.evaluated.peak_demand_kw
    if name == 'joint_recovery':
        assert result.feasibility_status == ('feasible' if joint else 'infeasible')
        if joint:
            assert sum(result.optimized_demand_kw) == pytest.approx(28)
            assert result.optimized_electricity_cost_usd == pytest.approx(5.6, abs=2e-7)
            assert result.optimized_peak_demand_kw == pytest.approx(3, abs=1e-6)
            assert result.operating_plan.baseline_constraint_violations
    elif name == 'joint_price_shift':
        assert result.optimized_electricity_cost_usd == pytest.approx(7.3 if joint else 7.9, abs=2e-7)
        assert sum(result.optimized_demand_kw) == pytest.approx(26)


@pytest.mark.parametrize('joint', [False, True])
@pytest.mark.parametrize('name', CASES)
def test_real_api_serializes_same_result_plan_and_legacy_fields(name, joint):
    scenario = joint_demonstration_configs()[name].scenario
    response = client.post('/api/optimize', params={'scheduling_mode': 'joint' if joint else 'ev_only'},
                           json=scenario.model_dump(mode='json'))
    assert response.status_code == 200
    result = OptimizationResult.model_validate(response.json())
    assert result.model_dump(mode='json') == response.json()
    check_components(scenario, result)
    # Old result payloads remain valid input to the extended Pydantic contract.
    legacy = {k: v for k,v in response.json().items() if k != 'operating_plan'}
    assert OptimizationResult.model_validate(legacy).operating_plan is None


def test_device_identity_order_and_cross_type_collision_are_unambiguous():
    data = joint_demonstration_configs()['joint_recovery'].scenario.model_dump()
    data['building_max_demand_kw'] = 10
    data['ev_requirements'][0]['id'] = 'pump:1'
    data['ev_requirements'].append({**data['ev_requirements'][0], 'id': 'second'})
    data['flexible_equipment'][0]['id'] = 'pump:1'
    scenario = Scenario.model_validate(data)
    result = interface.optimize_scenario(scenario, optimize_flexible=True)
    check_components(scenario, result)
    assert [(d.device_type,d.device_id) for d in result.operating_plan.device_schedules] == [
        ('ev','pump:1'), ('ev','second'), ('flexible','pump:1')]


def test_partial_baseline_and_infeasibility_do_not_claim_completed_work():
    scenario = demonstration_configs()['infeasible'].scenario
    result = interface.optimize_scenario(scenario, optimize_flexible=True)
    first = result.operating_plan.device_schedules[0]
    assert first.required_energy_kwh == 5 and first.baseline_delivered_energy_kwh == 4
    assert result.operating_plan.baseline_constraint_violations
    assert first.optimized_power_kw is None
    check_components(scenario, result)


@pytest.mark.parametrize('energy', [0, 0.5, 2])
def test_fractional_zero_and_negative_price_device_energy_is_not_rounded(energy):
    data = joint_demonstration_configs()['joint_price_shift'].scenario.model_dump()
    data['electricity_prices_usd_per_kwh'] = [-1]*24
    data['flexible_equipment'][0]['energy_required_kwh'] = energy
    scenario = Scenario.model_validate(data)
    result = interface.optimize_scenario(scenario, optimize_flexible=True)
    check_components(scenario, result)
    device = result.operating_plan.device_schedules[0]
    assert device.optimized_power_kw[:2] == pytest.approx([energy/2]*2, abs=1e-6)
    assert result.optimized_electricity_cost_usd == pytest.approx(-24-energy, abs=2e-7)


def test_fixed_only_response_has_verified_empty_device_list():
    data = joint_demonstration_configs()['joint_price_shift'].scenario.model_dump()
    data['flexible_equipment'] = []
    result = interface.optimize_scenario(Scenario.model_validate(data), optimize_flexible=True)
    assert result.operating_plan.device_schedules == []
    assert result.operating_plan.verification_status == 'passed'


@pytest.mark.parametrize('stage,status', [('primary', 'feasible'), ('secondary', 'unresolved'), ('secondary', 'feasible')])
def test_actual_quality_and_warning_provenance(monkeypatch, stage, status):
    count = 0
    def run(engine):
        nonlocal count
        count += 1
        if status != 'unresolved':
            assert engine.Solve() == pywraplp.Solver.OPTIMAL
        elif count == 1:
            assert engine.Solve() == pywraplp.Solver.OPTIMAL
        if (stage == 'primary' and count == 1) or (stage == 'secondary' and count == 2):
            return pywraplp.Solver.FEASIBLE if status == 'feasible' else pywraplp.Solver.NOT_SOLVED
        return pywraplp.Solver.OPTIMAL
    monkeypatch.setattr(solver, '_run_solver', run)
    scenario = joint_demonstration_configs()['joint_price_shift'].scenario
    result = interface.optimize_scenario(scenario, optimize_flexible=True)
    check_components(scenario, result)
    quality = result.operating_plan
    assert quality.warnings and quality.verification_status == 'passed'
    if stage == 'primary':
        assert quality.solver_status == quality.primary_status == 'feasible'
        assert quality.primary_optimum_usd is None and quality.peak_tiebreak_status == 'not_run'
    else:
        assert quality.solver_status == quality.primary_status == 'optimal'
        assert quality.peak_tiebreak_status == status
        assert quality.primary_optimum_usd == pytest.approx(7.3, abs=2e-7)


@pytest.mark.parametrize('status,http_code,code', [
    (pywraplp.Solver.NOT_SOLVED,503,'optimization_unresolved'),
    (pywraplp.Solver.ABNORMAL,500,'solver_error'),
])
def test_solver_failures_cannot_supply_an_actionable_plan(monkeypatch, status, http_code, code):
    monkeypatch.setattr(solver, '_run_solver', lambda _: status)
    response = client.post('/api/optimize?scheduling_mode=joint', json=joint_demonstration_configs()['joint_price_shift'].scenario.model_dump(mode='json'))
    assert response.status_code == http_code
    assert response.json()['detail']['code'] == code
    assert 'operating_plan' not in response.json()


@pytest.mark.parametrize('corrupt', ['energy', 'fixed', 'keys', 'metrics', 'window', 'power', 'negative', 'nonfinite'])
def test_adapter_independently_rejects_corrupted_plan_transfer(monkeypatch, corrupt):
    solve = interface.solve_ev_charging
    def tamper(*args, **kwargs):
        outcome = solve(*args, **kwargs)
        if corrupt == 'energy':
            outcome.schedules['flexible:pump'] = [0]*24
        elif corrupt == 'fixed':
            outcome.schedules['fixed'][0] += 0.1
        elif corrupt == 'keys':
            outcome.schedules['unexpected'] = [0]*24
        elif corrupt == 'metrics':
            outcome.evaluated.electricity_cost_usd += 0.1
        elif corrupt == 'window':
            outcome.schedules['flexible:pump'] = [0,0,2]+[0]*21
        elif corrupt == 'power':
            outcome.schedules['flexible:pump'] = [3]+[0]*23
        else:
            outcome.schedules['flexible:pump'][0] = -1 if corrupt == 'negative' else float('nan')
        return outcome
    monkeypatch.setattr(interface, 'solve_ev_charging', tamper)
    with pytest.raises(solver.OptimizationVerificationError):
        interface.optimize_scenario(joint_demonstration_configs()['joint_price_shift'].scenario, optimize_flexible=True)
    response = client.post('/api/optimize?scheduling_mode=joint', json=joint_demonstration_configs()['joint_price_shift'].scenario.model_dump(mode='json'))
    assert response.status_code == 500 and response.json()['detail']['code'] == 'verification_failed'
    assert 'operating_plan' not in response.json()


@pytest.mark.parametrize('mutation', ['unverified', 'missing_power', 'energy_total', 'duplicate', 'false_quality', 'nonfinite'])
def test_contract_rejects_inconsistent_operating_plan(mutation):
    data = interface.optimize_scenario(joint_demonstration_configs()['joint_price_shift'].scenario, optimize_flexible=True).model_dump(mode='json')
    plan = data['operating_plan']
    if mutation == 'unverified': plan['verification_status'] = 'unavailable'
    elif mutation == 'missing_power': plan['device_schedules'][0]['optimized_power_kw'] = None
    elif mutation == 'energy_total': plan['device_schedules'][0]['optimized_delivered_energy_kwh'] += 1
    elif mutation == 'duplicate': plan['device_schedules'].append(deepcopy(plan['device_schedules'][0]))
    elif mutation == 'false_quality': plan['primary_status'] = 'feasible'
    else: plan['device_schedules'][0]['optimized_power_kw'][0] = float('nan')
    with pytest.raises(ValidationError): OptimizationResult.model_validate(data)
