"""Independently check the recorded application inputs/responses; no HTTP mocking.

Run from repo root: backend/.venv/bin/python scripts/verify_joint_application_captures.py
"""
import json
import hashlib
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.solver import solve_ev_charging
from backend.simulator.interface import evaluate_scenario_schedules, simulate_baseline

ROOT = Path(__file__).resolve().parents[1]
PHYSICAL = 1e-6
COST = 2e-7


def near(actual, expected, tolerance=PHYSICAL):
    if abs(actual - expected) > tolerance:
        raise AssertionError(f'{actual} != {expected} within {tolerance}')


def main():
    if not __debug__:
        raise RuntimeError('Run verification with Python assertions enabled')
    captures = json.loads((ROOT / 'docs/verification/joint-application-captures.json').read_text())
    assert captures['status'] == 'PASS'
    frontend_source = (ROOT / 'frontend/src/data/demoScenario.ts').read_text()
    hvac = json.loads(re.search(r'export const hvac = (\[[\s\S]*?\])', frontend_source)[1].replace(',\n]', '\n]'))
    background = float(re.search(r'export const background = Array<number>\(24\).fill\((.*?)\)', frontend_source)[1])
    results = []
    by_id = {item['id']: item for item in captures['requests']}
    assert len(by_id) == len(captures['requests'])
    for item in captures['requests']:
        scenario = Scenario.model_validate(item['scenario'])
        response = OptimizationResult.model_validate(item['response'])
        assert item['status'] == 200
        assert item['scheduling_mode'] in ('ev_only', 'joint')
        joint = item['scheduling_mode'] == 'joint'
        snapshot = item['editorSnapshot']
        profile = snapshot['demandProfile']
        if profile['mode'] == 'sources':
            fixed = [sum(float(source['values'][h]) for source in profile['sources']) for h in range(24)]
        elif profile['mode'] == 'custom':
            fixed = list(map(float, profile['values']))
        else:
            assert profile['mode'] == 'demo'
            fixed = [background + value for value in hvac]
        # Independent sum/replacement check: no demo or movable demand added.
        assert fixed == scenario.fixed_demand_kw
        baseline = simulate_baseline(scenario)
        for actual, expected in zip(response.baseline_demand_kw, baseline.demand_kw):
            near(actual, expected)
        near(response.baseline_electricity_cost_usd, baseline.electricity_cost_usd, COST)
        near(response.baseline_peak_demand_kw, baseline.peak_demand_kw)
        near(sum(p * d for p, d in zip(scenario.electricity_prices_usd_per_kwh,
                                       response.baseline_demand_kw)), response.baseline_electricity_cost_usd, COST)
        near(max(response.baseline_demand_kw), response.baseline_peak_demand_kw)
        direct = optimize_scenario(scenario, optimize_flexible=joint)
        assert response.feasibility_status == direct.feasibility_status
        outcome = solve_ev_charging(scenario, optimize_flexible=joint)
        summary = {'id': item['id'], 'profile': profile['mode'], 'mode': item['scheduling_mode'],
                   'httpFeasibility': response.feasibility_status,
                   'directSolverStatus': outcome.status, 'directPrimaryStatus': outcome.primary_status,
                   'directPeakStatus': outcome.secondary_status,
                   'baselineKwh': sum(response.baseline_demand_kw),
                   'baselineEnergyUsd': response.baseline_electricity_cost_usd,
                   'baselinePeakKw': response.baseline_peak_demand_kw,
                   'optimizedKwh': None, 'optimizedEnergyUsd': None, 'optimizedPeakKw': None}
        if response.feasibility_status == 'infeasible':
            assert outcome.status == 'infeasible' and outcome.schedules is None
            assert response.constraint_violations and direct.constraint_violations
            assert response.optimized_demand_kw is response.optimized_electricity_cost_usd is response.optimized_peak_demand_kw is None
            summary['reasons'] = response.constraint_violations
        else:
            assert outcome.status in ('optimal', 'feasible'), outcome.reasons
            assert not response.constraint_violations
            demand = response.optimized_demand_kw
            assert len(demand) == 24
            for fixed_kw, total in zip(fixed, demand):
                assert fixed_kw - PHYSICAL <= total <= scenario.building_max_demand_kw + PHYSICAL
            required = sum(fixed) + sum(ev.energy_required_kwh for ev in scenario.ev_requirements)
            required += sum(e.energy_required_kwh for e in scenario.flexible_equipment)
            near(sum(demand), required)
            near(sum(demand), sum(direct.optimized_demand_kw))
            near(response.optimized_electricity_cost_usd, direct.optimized_electricity_cost_usd, COST)
            near(response.optimized_peak_demand_kw, direct.optimized_peak_demand_kw)
            near(sum(d * p for d, p in zip(demand, scenario.electricity_prices_usd_per_kwh)), response.optimized_electricity_cost_usd, COST)
            near(max(demand), response.optimized_peak_demand_kw)
            # Per-equipment checks concern this direct engineering solve, not a
            # decomposition inferred from the aggregate HTTP demand curve.
            schedules = outcome.schedules
            assert schedules['fixed'] == fixed
            evaluated = evaluate_scenario_schedules(scenario, schedules, optimize_flexible=joint)
            assert not evaluated.constraint_violations
            items = [(f'ev:{ev.id}', ev.arrival_hour, ev.deadline_hour,
                      ev.energy_required_kwh, ev.max_charging_power_kw) for ev in scenario.ev_requirements]
            items += [(f'flexible:{e.id}', e.available_hours.start_hour,
                       e.available_hours.end_hour, e.energy_required_kwh, e.max_power_kw)
                      for e in scenario.flexible_equipment]
            assert set(schedules) == {'fixed'} | {i[0] for i in items}
            for key, start, end, energy, limit in items:
                values = schedules[key]
                near(sum(values), energy)
                assert all(-PHYSICAL <= p <= limit + PHYSICAL for p in values)
                assert all(abs(values[h]) <= PHYSICAL for h in range(24) if not start <= h < end)
            reconstructed = [sum(values[h] for values in schedules.values()) for h in range(24)]
            assert max(reconstructed) <= scenario.building_max_demand_kw + PHYSICAL
            near(sum(reconstructed), sum(demand))
            near(evaluated.electricity_cost_usd, response.optimized_electricity_cost_usd, COST)
            near(evaluated.peak_demand_kw, response.optimized_peak_demand_kw)
            summary.update(optimizedKwh=sum(demand), optimizedEnergyUsd=response.optimized_electricity_cost_usd,
                           optimizedPeakKw=response.optimized_peak_demand_kw,
                           directEquipmentSchedulesKw=schedules,
                           primaryOptimumUsd=outcome.primary_optimum_usd,
                           discrepancies={
                               'energyKwhVsDirect': abs(sum(demand)-sum(direct.optimized_demand_kw)),
                               'energyUsdVsDirect': abs(response.optimized_electricity_cost_usd-direct.optimized_electricity_cost_usd),
                               'peakKwVsDirect': abs(response.optimized_peak_demand_kw-direct.optimized_peak_demand_kw),
                               'energyKwhVsRequired': abs(sum(demand)-required),
                               'energyUsdVsArithmetic': abs(sum(d*p for d,p in zip(demand, scenario.electricity_prices_usd_per_kwh))-response.optimized_electricity_cost_usd),
                               'peakKwVsArithmetic': abs(max(demand)-response.optimized_peak_demand_kw),
                           })
        results.append(summary)
        print(json.dumps({k: v for k, v in summary.items() if k != 'directEquipmentSchedulesKw'}))
    pairs = []
    for pair in captures['pairs']:
        current = by_id[pair['current']]
        alternative = by_id[pair['alternative']]
        assert current['scheduling_mode'] == alternative['scheduling_mode'] == 'joint'
        a, b = current['response'], alternative['response']
        differences = None
        if a['feasibility_status'] == b['feasibility_status'] == 'feasible':
            differences = {
                'energyUsd': b['optimized_electricity_cost_usd'] - a['optimized_electricity_cost_usd'],
                'peakKw': b['optimized_peak_demand_kw'] - a['optimized_peak_demand_kw'],
                'consumptionKwh': sum(b['optimized_demand_kw']) - sum(a['optimized_demand_kw']),
            }
            assert len(pair['displayedAlternativeMinusCurrent']) == 3
            # Independent numeric checks of display units, sign and precision.
            for text, value in zip(pair['displayedAlternativeMinusCurrent'], differences.values()):
                number = float(text.replace('$', '').replace(',', '').split()[0])
                near(number, value, 0.005 + 1e-10)
        else:
            assert pair['displayedAlternativeMinusCurrent'] == []
        pairs.append({**pair, 'rawAlternativeMinusCurrent': differences})
    report = {'status': 'PASS',
              'capturesSha256': hashlib.sha256((ROOT / 'docs/verification/joint-application-captures.json').read_bytes()).hexdigest(),
              'testedFrontendCommit': captures['testedFrontendCommit'],
              'testedBackendCommit': captures['testedBackendCommit'],
              'physicalToleranceKwKwh': PHYSICAL, 'costToleranceUsd': COST,
              'requests': results, 'pairs': pairs,
              'scope': 'Captured HTTP aggregate checks; per-equipment direct solver checks; no production verification'}
    (ROOT / 'docs/verification/joint-application-numerical-checks.json').write_text(json.dumps(report, indent=2)+'\n')
    print(f'PASS: {len(results)} captured application requests; {len(pairs)} comparisons')


if __name__ == '__main__':
    main()
