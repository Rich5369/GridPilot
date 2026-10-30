"""Review captured E1 response arrays independently; never run optimization.

Usage: backend/.venv/bin/python scripts/verify_e1_engineering_evidence.py
An optional first argument selects a capture with cases[]. Results go to stdout.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import OptimizationResult, Scenario
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules, simulate_baseline


def near(actual, expected, tolerance=1e-6):
    assert abs(actual-expected) <= tolerance, (actual, expected, tolerance)


def check(record):
    scenario = Scenario.model_validate(record['scenario'])
    result = OptimizationResult.model_validate(record['response'])
    joint = record['scheduling_mode'] == 'joint'
    plan = result.operating_plan
    assert plan is not None and plan.scheduling_mode == record['scheduling_mode']
    original = baseline_schedules(scenario)
    baseline = simulate_baseline(scenario)
    assert baseline.demand_kw == result.baseline_demand_kw
    assert baseline.constraint_violations == plan.baseline_constraint_violations
    expected = {('ev', d.id): (d.arrival_hour, d.deadline_hour, d.energy_required_kwh, d.max_charging_power_kw)
                for d in scenario.ev_requirements}
    expected.update({('flexible', d.id): (d.available_hours.start_hour, d.available_hours.end_hour,
                                        d.energy_required_kwh, d.max_power_kw) for d in scenario.flexible_equipment})
    assert [(d.device_type, d.device_id) for d in plan.device_schedules] == list(expected)
    for d in plan.device_schedules:
        key = f'{d.device_type}:{d.device_id}'
        assert (d.available_hours.start_hour,d.available_hours.end_hour,d.required_energy_kwh,d.max_power_kw) == expected[(d.device_type,d.device_id)]
        assert d.baseline_power_kw == original[key]
        near(sum(d.baseline_power_kw), d.baseline_delivered_energy_kwh)
        assert d.scheduling_role == ('held_at_baseline' if d.device_type=='flexible' and not joint else 'optimized')
        if result.feasibility_status == 'infeasible':
            assert d.optimized_power_kw is d.optimized_delivered_energy_kwh is None
        else:
            near(sum(d.optimized_power_kw),d.required_energy_kwh)
            near(sum(d.optimized_power_kw),d.optimized_delivered_energy_kwh)
            for h,p in enumerate(d.optimized_power_kw):
                assert -1e-6 <= p <= d.max_power_kw+1e-6
                if not d.available_hours.start_hour <= h < d.available_hours.end_hour:
                    near(p,0)
            if d.scheduling_role=='held_at_baseline':
                assert d.optimized_power_kw == d.baseline_power_kw
    metrics = {}
    for kind in ('baseline','optimized'):
        aggregate = getattr(result,f'{kind}_demand_kw')
        if aggregate is None:
            assert result.feasibility_status=='infeasible' and result.constraint_violations
            continue
        arrays = {'fixed': scenario.fixed_demand_kw, **{f'{d.device_type}:{d.device_id}':getattr(d,f'{kind}_power_kw') for d in plan.device_schedules}}
        demand = [sum(values[h] for values in arrays.values()) for h in range(24)]
        residual = max(abs(a-b) for a,b in zip(demand,aggregate))
        assert residual <= 1e-6
        energy = sum(demand)
        cost = sum(p*r for p,r in zip(demand,scenario.electricity_prices_usd_per_kwh))
        peak = max(demand)
        near(energy,sum(aggregate))
        near(cost,getattr(result,f'{kind}_electricity_cost_usd'),2e-7)
        near(peak,getattr(result,f'{kind}_peak_demand_kw'))
        if kind=='optimized':
            assert peak <= scenario.building_max_demand_kw+1e-6
            assert not evaluate_scenario_schedules(scenario,arrays,optimize_flexible=joint).constraint_violations
        metrics[kind] = dict(energy_kwh=energy,energy_cost_usd=cost,peak_kw=peak,max_hourly_residual_kw=residual)
    return dict(name=record['name'],mode=record['scheduling_mode'],feasibility=result.feasibility_status,
                primary_status=plan.primary_status,peak_status=plan.peak_tiebreak_status,metrics=metrics)


if __name__=='__main__':
    if not __debug__:
        raise RuntimeError('Verification requires assertions; do not run with -O')
    path = Path(sys.argv[1] if len(sys.argv)>1 else 'artifacts/e1/acceptance.json')
    capture=json.loads(path.read_text())
    print(json.dumps(dict(capture=str(path),source=capture['source'],recorded_base=capture.get('baseRevision'),
                         no_optimization_runs=True,cases=[check(c) for c in capture['cases']]),indent=2))
