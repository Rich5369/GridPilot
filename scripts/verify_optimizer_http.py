"""Compare engineering demonstrations over real HTTP with independent direct solves.

Start the backend, then run: backend/.venv/bin/python scripts/verify_optimizer_http.py
"""
import json
import math
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import OptimizationResult
from backend.optimizer.__main__ import demonstration_configs
from backend.optimizer.interface import optimize_scenario


def close(actual, expected, tolerance):
    assert math.isclose(actual, expected, rel_tol=0, abs_tol=tolerance), (actual, expected)


def verify(result, scenario):
    for prefix in ('baseline', 'optimized'):
        demand = getattr(result, f'{prefix}_demand_kw')
        cost = getattr(result, f'{prefix}_electricity_cost_usd')
        peak = getattr(result, f'{prefix}_peak_demand_kw')
        if demand is None:
            assert cost is None and peak is None
            continue
        assert len(demand) == 24 and all(math.isfinite(p) and p >= 0 for p in demand)
        close(sum(p * price for p, price in zip(demand, scenario.electricity_prices_usd_per_kwh)), cost, 2e-7)
        close(max(demand), peak, 1e-6)
        if prefix == 'optimized':
            assert peak <= scenario.building_max_demand_kw + 1e-6
            close(sum(demand), sum(scenario.fixed_demand_kw) + sum(ev.energy_required_kwh for ev in scenario.ev_requirements), 1e-6)


def main():
    expected = {'price_shift': (7.9, 7.3, 3, 3), 'tight_cap': (5.6, 5.6, 5, 3),
                'infeasible': (6, None, 5, None)}
    configs = demonstration_configs()
    # Match the production client's budget, rather than the old 5/10-second checks.
    with httpx.Client(base_url='http://127.0.0.1:8000', timeout=45) as client:
        for name, values in expected.items():
            scenario = configs[name].scenario
            response = client.post('/api/optimize', json=scenario.model_dump(mode='json'))
            assert response.status_code == 200, response.text
            actual = OptimizationResult.model_validate(response.json())
            direct = optimize_scenario(scenario)
            verify(actual, scenario)
            verify(direct, scenario)
            assert actual.feasibility_status == direct.feasibility_status == ('infeasible' if name == 'infeasible' else 'feasible')
            if name == 'infeasible':
                assert actual.constraint_violations and direct.constraint_violations
            for field, expected_value in zip(('baseline_electricity_cost_usd', 'optimized_electricity_cost_usd', 'baseline_peak_demand_kw', 'optimized_peak_demand_kw'), values):
                value = getattr(actual, field)
                if expected_value is None:
                    assert value is None and getattr(direct, field) is None
                else:
                    tolerance = 2e-7 if 'cost' in field else 1e-6
                    close(value, expected_value, tolerance)
                    close(value, getattr(direct, field), tolerance)
            # Independent optima can have different hourly schedules; compare their
            # energy totals and metrics rather than demanding identical arrays.
            close(sum(actual.baseline_demand_kw), sum(direct.baseline_demand_kw), 1e-6)
            if actual.optimized_demand_kw is not None:
                close(sum(actual.optimized_demand_kw), sum(direct.optimized_demand_kw), 1e-6)
            print(json.dumps({'case': name, 'http_status': response.status_code, **actual.model_dump(mode='json')}))
    print('PASS: all three HTTP demonstrations match direct optimizer metrics and engineering tolerances')


if __name__ == '__main__':
    main()
