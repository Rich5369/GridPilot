"""Independent arithmetic and real proofs for E2; no alternative solver model."""
import pytest
from ortools.linear_solver import pywraplp

from backend.models.contracts import Scenario
from backend.optimizer import solver
from backend.optimizer.infeasibility import analytical_evidence, select_evidence
from backend.simulator.interface import baseline_schedules


def scenario(*, fixed=None, cap=3, evs=(), flex=()):
    return Scenario.model_validate(dict(
        operating_hours={'start_hour': 0, 'end_hour': 24},
        fixed_demand_kw=[1.0]*24 if fixed is None else fixed,
        electricity_prices_usd_per_kwh=[0.2]*24, building_max_demand_kw=cap,
        ev_requirements=list(evs), flexible_equipment=list(flex)))


def ev(identifier='a', start=0, end=2, energy=3, power=2):
    return dict(id=identifier, arrival_hour=start, deadline_hour=end,
                energy_required_kwh=energy, max_charging_power_kw=power)


def flexible(identifier='pump', start=0, end=2, energy=3, power=2):
    return dict(id=identifier, available_hours={'start_hour': start, 'end_hour': end},
                energy_required_kwh=energy, max_power_kw=power)


def independent_quantities(s, item, joint):
    """Derive each reported bound from original inputs, not production helpers."""
    objects = {('ev', d.id): (d.arrival_hour, d.deadline_hour, d.energy_required_kwh,
                             d.max_charging_power_kw) for d in s.ev_requirements}
    objects.update({('flexible', d.id): (d.available_hours.start_hour, d.available_hours.end_hour,
                                      d.energy_required_kwh, d.max_power_kw) for d in s.flexible_equipment})
    held = [0.0]*24
    if not joint:
        for d in s.flexible_equipment:
            remaining = d.energy_required_kwh
            for h in range(d.available_hours.start_hour, d.available_hours.end_hour):
                p = min(remaining, d.max_power_kw)
                held[h] += p
                remaining -= p
    assert item.context.scheduling_mode == ('joint' if joint else 'ev_only')
    assert item.required > item.available + item.context.tolerance
    start, end = item.window['start_hour'], item.window['end_hour']
    references = [(d.device_type, d.device_id) for d in item.devices]
    if item.code == 'device_window_capacity':
        a, b, energy, power = objects[references[0]]
        assert (start, end) == (a, b)
        assert item.required == energy
        assert item.available == power*(b-a)
        assert item.context.max_power_kw == power
        assert item.unit == 'kWh'
    elif item.code == 'fixed_demand_above_site_limit':
        assert end == start+1
        assert item.required == pytest.approx(s.fixed_demand_kw[start]+held[start], abs=1e-12)
        assert item.available == s.building_max_demand_kw
        assert item.context.immutable_fixed_power_kw == s.fixed_demand_kw[start]
        assert item.context.held_flexible_power_kw == held[start]
        assert item.unit == 'kW'
    else:
        contained = [key for key, (a,b,_,_) in objects.items()
                     if (joint or key[0]=='ev') and start <= a and b <= end]
        assert references == contained
        assert item.required == sum(objects[key][2] for key in contained)
        expected = sum(max(0, s.building_max_demand_kw-s.fixed_demand_kw[h]-held[h])
                       for h in range(start,end))
        assert item.available == pytest.approx(expected, abs=1e-12)
        assert item.context.immutable_fixed_energy_kwh == sum(s.fixed_demand_kw[start:end])
        assert item.context.held_flexible_energy_kwh == sum(held[start:end])
        assert item.unit == 'kWh'


@pytest.mark.parametrize('joint', [False, True])
@pytest.mark.parametrize('kind', ['ev', 'flexible'])
def test_device_window_exact_quantities_and_identifiers(joint, kind):
    kwargs = {'evs': [ev('same:id', start=3, end=5, energy=5, power=2)]} if kind=='ev' else {
        'flex': [flexible('same:id', start=3, end=5, energy=5, power=2)]}
    s = scenario(**kwargs)
    result = solver.solve_ev_charging(s, optimize_flexible=joint)
    assert result.status == 'infeasible' and result.primary_status == 'analytic_infeasibility'
    item = next(e for e in result.infeasibility_evidence if e.code=='device_window_capacity')
    assert item.devices[0].device_type == kind and item.devices[0].device_id == 'same:id'
    independent_quantities(s, item, joint)
    assert result.schedules is result.evaluated is None


@pytest.mark.parametrize('joint', [False, True])
def test_fixed_and_held_power_counted_once(joint):
    s = scenario(fixed=[8]+[1]*23, cap=6, flex=[flexible(start=0,end=1,energy=2)])
    outcome = solver.solve_ev_charging(s, optimize_flexible=joint)
    for item in outcome.infeasibility_evidence:
        independent_quantities(s, item, joint)
    item = next(e for e in outcome.infeasibility_evidence if e.code=='fixed_demand_above_site_limit')
    assert item.required == (8 if joint else 10)
    assert len(item.devices) == (0 if joint else 1)


@pytest.mark.parametrize('joint', [False, True])
def test_held_schedule_is_not_an_immutable_joint_load(joint):
    s = scenario(cap=3, evs=[ev(end=1,energy=2)], flex=[flexible(energy=2)])
    outcome = solver.solve_ev_charging(s, optimize_flexible=joint)
    assert outcome.status == ('optimal' if joint else 'infeasible')
    if joint:
        assert not outcome.infeasibility_evidence
    else:
        for item in outcome.infeasibility_evidence:
            independent_quantities(s, item, joint)


@pytest.mark.parametrize('joint', [False, True])
def test_shared_window_different_windows_and_overlaps(joint):
    s = scenario(cap=3, evs=[ev('a',0,2,4), ev('b',1,3,4), ev('wide',0,24,1)],
                 flex=[flexible('late',8,10,4)])
    result = solver.solve_ev_charging(s, optimize_flexible=joint)
    assert result.status=='infeasible'
    records = result.infeasibility_evidence
    for item in records:
        independent_quantities(s, item, joint)
    conflict = next(e for e in records if e.window=={'start_hour':0,'end_hour':3})
    assert {d.device_id for d in conflict.devices} == {'a','b'}
    assert (conflict.required,conflict.available)==(8,6)
    assert all(d.device_id!='wide' for d in conflict.devices)


def test_distinct_device_sets_and_distinct_fixed_hours_survive_grouping():
    s = scenario(fixed=[4,3,3,3,4]+[3]*19, evs=[ev('a',0,2,4),ev('b',2,4,4)])
    fixed = list(s.fixed_demand_kw)
    raw = analytical_evidence(s, fixed)
    selected = select_evidence(raw)
    assert len(selected) < len(raw)
    assert selected == select_evidence(raw)
    assert sum(e.code=='fixed_demand_above_site_limit' for e in selected)==2
    assert {e.devices for e in raw if e.code=='shared_window_capacity'} == {
        e.devices for e in selected if e.code=='shared_window_capacity'}
    for item in selected:
        independent_quantities(s,item,False)
    # Every selected representative is at least as strong as same-set duplicates.
    for item in raw:
        if item.code=='shared_window_capacity':
            chosen = next(e for e in selected if e.code==item.code and e.devices==item.devices)
            assert chosen.available <= item.available


@pytest.mark.parametrize('joint', [False, True])
def test_real_solver_only_infeasibility_has_no_invented_certificate(joint):
    s = scenario(fixed=[0,2]+[0]*22,cap=2,
                 evs=[] if joint else [ev(energy=2,power=1)],
                 flex=[flexible(energy=2,power=1)] if joint else [])
    result = solver.solve_ev_charging(s,optimize_flexible=joint)
    assert result.status=='infeasible' and result.primary_status=='infeasible'
    [item] = result.infeasibility_evidence
    assert item.code==item.proof_source=='solver_infeasible'
    assert not item.devices
    assert item.window is item.required is item.available is item.unit is None
    assert item.context.site_limit_kw is None


@pytest.mark.parametrize('category,tolerance', [('device',1e-8),('fixed',1e-6),('shared',1e-6)])
@pytest.mark.parametrize('factor,expected', [(0.5,False),(2,True)])
def test_analytical_comparison_tolerance_boundaries(category,tolerance,factor,expected):
    delta=tolerance*factor
    if category=='device':
        s=scenario(evs=[ev(end=1,energy=2+delta)])
        code='device_window_capacity'
    elif category=='fixed':
        s=scenario(fixed=[3+delta]+[1]*23)
        code='fixed_demand_above_site_limit'
    else:
        s=scenario(evs=[ev('a',end=1,energy=1+delta/2),ev('b',end=1,energy=1+delta/2)])
        code='shared_window_capacity'
    items=analytical_evidence(s,s.fixed_demand_kw)
    assert any(e.code==code for e in items)==expected


@pytest.mark.parametrize('status', [pywraplp.Solver.NOT_SOLVED,pywraplp.Solver.ABNORMAL,
                                  pywraplp.Solver.MODEL_INVALID,pywraplp.Solver.UNBOUNDED])
def test_solver_failure_is_not_evidence(monkeypatch,status):
    monkeypatch.setattr(solver,'_run_solver',lambda _:status)
    outcome=solver.solve_ev_charging(scenario(evs=[ev()]))
    assert outcome.status in ('error','unresolved')
    assert not outcome.infeasibility_evidence and outcome.schedules is None


@pytest.mark.parametrize('unavailable', [True,False])
def test_unavailable_and_unexpected_solver_exception_have_no_evidence(monkeypatch,unavailable):
    def create():
        if unavailable:
            return None
        raise RuntimeError('injected failure')
    monkeypatch.setattr(solver,'_create_solver',create)
    result=solver.solve_ev_charging(scenario())
    assert result.status=='error' and not result.infeasibility_evidence


@pytest.mark.parametrize('joint',[False,True])
def test_feasible_and_equivalent_schedules_no_infeasibility_cards(joint):
    calls=0
    create=solver._create_solver
    def counted():
        nonlocal calls
        calls+=1
        return create()
    # Two equal-price available hours admit many valid schedules before tie-breaking.
    s=scenario(evs=[ev(energy=2)],flex=[flexible(energy=0)])
    from unittest.mock import patch
    with patch.object(solver,'_create_solver',counted):
        outcome=solver.solve_ev_charging(s,optimize_flexible=joint)
    assert calls==1 and outcome.status=='optimal' and not outcome.infeasibility_evidence
    assert sum(outcome.schedules['ev:a'])==pytest.approx(2,abs=1e-6)


def test_invalid_inputs_are_validation_errors():
    from pydantic import ValidationError
    data=scenario().model_dump()
    data['fixed_demand_kw'][0]=-1
    with pytest.raises(ValidationError):
        solver.solve_ev_charging(data)


@pytest.mark.parametrize('joint', [False, True])
@pytest.mark.parametrize('conflict', ['device','fixed','shared','solver_only','feasible'])
def test_real_http_contract_and_legacy_consumers(joint,conflict):
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.models.contracts import OptimizationResult
    from backend.optimizer.interface import optimize_scenario
    if conflict=='device':
        s=scenario(evs=[ev(energy=5)])
    elif conflict=='fixed':
        s=scenario(fixed=[4]+[1]*23)
    elif conflict=='shared':
        s=scenario(evs=[ev('a',energy=3),ev('b',energy=3)])
    elif conflict=='solver_only':
        s=scenario(fixed=[0,2]+[0]*22,cap=2,evs=[ev(energy=2,power=1)])
    else:
        s=scenario(evs=[ev(energy=2)])
    mode='joint' if joint else 'ev_only'
    response=TestClient(app).post(f'/api/optimize?scheduling_mode={mode}',json=s.model_dump())
    assert response.status_code==200
    payload=response.json()
    direct=optimize_scenario(s,optimize_flexible=joint)
    assert payload['infeasibility_evidence']==[e.model_dump() for e in direct.infeasibility_evidence]
    assert bool(payload['infeasibility_evidence'])==(conflict!='feasible')
    if conflict!='feasible':
        assert payload['optimized_demand_kw'] is payload['optimized_electricity_cost_usd'] is payload['optimized_peak_demand_kw'] is None
        assert all(d['optimized_power_kw'] is None for d in payload['operating_plan']['device_schedules'])
    # The newly optional field does not become required on old captures.
    del payload['infeasibility_evidence']
    assert OptimizationResult.model_validate(payload).infeasibility_evidence is None


@pytest.mark.parametrize('failure,expected_http', [('timeout',503),('unavailable',503),('exception',503),('abnormal',500)])
def test_http_failures_have_no_result_or_evidence(monkeypatch,failure,expected_http):
    from fastapi.testclient import TestClient
    from backend.main import app
    if failure=='unavailable':
        monkeypatch.setattr(solver,'_create_solver',lambda:None)
    elif failure=='exception':
        def broken():
            raise RuntimeError('injected')
        monkeypatch.setattr(solver,'_create_solver',broken)
    else:
        code=pywraplp.Solver.NOT_SOLVED if failure=='timeout' else pywraplp.Solver.ABNORMAL
        monkeypatch.setattr(solver,'_run_solver',lambda _:code)
    response=TestClient(app).post('/api/optimize?scheduling_mode=joint',json=scenario().model_dump())
    assert response.status_code==expected_http
    assert list(response.json())==['detail']
    assert not {'infeasibility_evidence','feasibility_status','operating_plan'} & response.json().keys()


def test_http_invalid_request_has_no_infeasibility_result():
    from fastapi.testclient import TestClient
    from backend.main import app
    data=scenario().model_dump()
    data['ev_requirements']=[ev(end=0)]
    result=TestClient(app).post('/api/optimize',json=data)
    assert result.status_code==422 and 'infeasibility_evidence' not in result.json()


@pytest.mark.parametrize('mutation', ['feasible','source','unit','no_violation','duplicate_id','mode','fake_solver_quantity'])
def test_schema_rejects_false_or_inconsistent_evidence(mutation):
    from copy import deepcopy
    from pydantic import ValidationError
    from backend.models.contracts import OptimizationResult
    from backend.optimizer.interface import optimize_scenario
    if mutation=='fake_solver_quantity':
        s=scenario(fixed=[0,2]+[0]*22,cap=2,evs=[ev(energy=2,power=1)])
    else:
        s=scenario(evs=[ev(energy=5)])
    payload=deepcopy(optimize_scenario(s).model_dump())
    item=payload['infeasibility_evidence'][0]
    if mutation=='feasible':
        feasible=optimize_scenario(scenario()).model_dump()
        feasible['infeasibility_evidence']=payload['infeasibility_evidence']
        payload=feasible
    elif mutation=='source':
        item['proof_source']='solver_infeasible'
    elif mutation=='unit':
        item['unit']='kW'
    elif mutation=='no_violation':
        item['required']=item['available']
    elif mutation=='duplicate_id':
        item['devices']*=2
    elif mutation=='mode':
        item['context']['scheduling_mode']='joint'
    else:
        item['required']=7
    with pytest.raises(ValidationError):
        OptimizationResult.model_validate(payload)


def test_one_solver_for_one_http_request_and_no_solver_for_analytic_proof(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.main import app
    count=0
    create=solver._create_solver
    def counted():
        nonlocal count
        count+=1
        return create()
    monkeypatch.setattr(solver,'_create_solver',counted)
    client=TestClient(app)
    assert client.post('/api/optimize',json=scenario(evs=[ev(energy=2)]).model_dump()).status_code==200
    assert count==1
    assert client.post('/api/optimize',json=scenario(evs=[ev(energy=5)]).model_dump()).status_code==200
    assert count==1


@pytest.mark.parametrize('joint',[False,True])
def test_partially_overlapping_windows_do_not_double_count_energy(joint):
    s=scenario(evs=[ev('early',0,2,2)],
               flex=[flexible('late',1,3,4)] if joint else [],
               cap=3)
    if not joint:
        data=s.model_dump()
        data['ev_requirements'].append(ev('late',1,3,4))
        s=Scenario.model_validate(data)
    outcome=solver.solve_ev_charging(s,optimize_flexible=joint)
    assert outcome.status=='optimal' and not outcome.infeasibility_evidence


@pytest.mark.parametrize('joint',[False,True])
def test_verified_unproved_incumbent_has_no_infeasibility_evidence(monkeypatch,joint):
    def feasible(engine):
        assert engine.Solve()==pywraplp.Solver.OPTIMAL
        return pywraplp.Solver.FEASIBLE
    monkeypatch.setattr(solver,'_run_solver',feasible)
    result=solver.solve_ev_charging(scenario(evs=[ev(energy=2)]),optimize_flexible=joint)
    assert result.status=='feasible' and result.primary_optimum_usd is None
    assert not result.infeasibility_evidence and result.evaluated is not None
