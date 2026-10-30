"""Real HTTP mode checks; joint acceptance requires the engineering adapter.

Run with a local backend on port 8000. No AI credentials are used.
"""
import argparse
import sys
import json
from time import monotonic
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.models.contracts import OptimizationResult
from backend.optimizer.interface import optimize_scenario


def focused_checks(base_url, output):
    """Four bounded hosted probes; API fixture records contain no DOM snapshots."""
    report = {'target': base_url, 'source': 'engineering_fixture_http',
              'deployedBackendCommit': None, 'requests': []}
    configs = joint_demonstration_configs()
    with httpx.Client(base_url=base_url, timeout=45) as client:
        for name, mode in [('joint_recovery', 'joint'), ('joint_recovery', 'ev_only'),
                           ('joint_price_shift', 'joint'), ('joint_infeasible', 'joint')]:
            scenario = configs[name].scenario
            record = {'case': name, 'scheduling_mode': mode,
                      'scenario': scenario.model_dump(mode='json'), 'attempts': []}
            report['requests'].append(record)
            try:
                for attempt in range(2):
                    started = monotonic()
                    try:
                        response = client.post('/api/optimize', params={'scheduling_mode': mode}, json=record['scenario'])
                        record['attempts'].append({'elapsedSeconds': monotonic()-started, 'httpStatus': response.status_code})
                        break
                    except httpx.TimeoutException as exc:
                        record['attempts'].append({'elapsedSeconds': monotonic()-started, 'error': type(exc).__name__})
                        if attempt == 1:
                            raise
                record['httpStatus'] = response.status_code
                record['response'] = response.json()
                assert response.status_code == 200, response.text
                result = OptimizationResult.model_validate(record['response'])
                direct = optimize_scenario(scenario, optimize_flexible=mode == 'joint')
                assert result.feasibility_status == direct.feasibility_status
                for a, b in zip(result.baseline_demand_kw, direct.baseline_demand_kw):
                    assert abs(a-b) <= 1e-6
                for prefix in ('baseline', 'optimized'):
                    demand = getattr(result, prefix+'_demand_kw')
                    if demand is None:
                        assert result.constraint_violations
                        assert result.optimized_electricity_cost_usd is result.optimized_peak_demand_kw is None
                        continue
                    cost = getattr(result, prefix+'_electricity_cost_usd')
                    peak = getattr(result, prefix+'_peak_demand_kw')
                    assert abs(sum(p*d for p,d in zip(scenario.electricity_prices_usd_per_kwh, demand))-cost) <= 2e-7
                    assert abs(max(demand)-peak) <= 1e-6
                    assert abs(cost-getattr(direct, prefix+'_electricity_cost_usd')) <= 2e-7
                    assert abs(peak-getattr(direct, prefix+'_peak_demand_kw')) <= 1e-6
                    if prefix == 'optimized':
                        expected_energy = 28 if name == 'joint_recovery' else 26
                        assert abs(sum(demand)-expected_energy) <= 1e-6
                        assert all(f-1e-6 <= d <= scenario.building_max_demand_kw+1e-6
                                   for f,d in zip(scenario.fixed_demand_kw,demand))
                record['status'] = 'PASS'
            except Exception as exc:
                record['status'] = 'FAIL'
                record['error'] = f'{type(exc).__name__}: {exc}'
            print(f'{name}/{mode}: {record["status"]}; attempts={record["attempts"]}')
    report['status'] = 'PASS' if all(r['status'] == 'PASS' for r in report['requests']) else 'FAIL'
    if output:
        Path(output).write_text(json.dumps(report, indent=2)+'\n')
    return 0 if report['status'] == 'PASS' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000',
                        help='Backend origin (default: %(default)s)')
    parser.add_argument('--focused', action='store_true', help='Run only four hosted mode/numerical probes')
    parser.add_argument('--output', help='Separate JSON evidence file for --focused')
    args = parser.parse_args()
    url = httpx.URL(args.base_url)
    if url.scheme not in ('http', 'https') or not url.host or url.path not in ('', '/') or url.query or url.fragment or url.username or url.password:
        parser.error('--base-url must be an HTTP(S) origin without credentials, path, query or fragment')
    if not __debug__:
        parser.error('Run without -O or PYTHONOPTIMIZE: numerical checks require assertions')
    if args.output and not args.focused:
        parser.error('--output requires --focused')
    print(f'Target: {args.base_url.rstrip("/")}/api/optimize', flush=True)
    if args.focused:
        return focused_checks(args.base_url.rstrip('/'), args.output)
    missing = False
    with httpx.Client(base_url=args.base_url.rstrip('/'), timeout=45) as client:
        for name, config in joint_demonstration_configs().items():
            body = config.scenario.model_dump(mode='json')
            omitted = client.post('/api/optimize', json=body)
            ev = client.post('/api/optimize?scheduling_mode=ev_only', json=body)
            assert omitted.status_code == ev.status_code == 200
            assert omitted.json()['feasibility_status'] == ev.json()['feasibility_status']
            assert client.post('/api/optimize?scheduling_mode=unknown', json=body).status_code == 422
            joint = client.post('/api/optimize?scheduling_mode=joint', json=body)
            if joint.status_code == 503:
                assert joint.json()['detail']['code'] == 'joint_adapter_unavailable'
                missing = True
                print(f'{name}: EV-only={ev.json()["feasibility_status"]}; joint BLOCKED: adapter unavailable')
                continue
            assert joint.status_code == 200, joint.text
            result = joint.json()
            if name == 'joint_infeasible':
                assert result['feasibility_status'] == 'infeasible'
                assert result['constraint_violations']
                assert all(result[field] is None for field in ('optimized_demand_kw', 'optimized_electricity_cost_usd', 'optimized_peak_demand_kw'))
            else:
                assert result['feasibility_status'] == 'feasible'
                energy, cost = (28, 5.6) if name == 'joint_recovery' else (26, 7.3)
                assert abs(sum(result['optimized_demand_kw']) - energy) < 1e-6
                assert abs(result['optimized_electricity_cost_usd'] - cost) < 2e-7
                if name == 'joint_recovery':
                    assert ev.json()['feasibility_status'] == 'infeasible'
                    assert abs(result['optimized_peak_demand_kw'] - 3) < 1e-6
                else:
                    assert abs(ev.json()['optimized_electricity_cost_usd'] - 7.9) < 2e-7
                    assert abs(sum(ev.json()['optimized_demand_kw']) - 26) < 1e-6
            print(f'{name}: joint acceptance PASS')
    if missing:
        print('BLOCKED: mode compatibility/validation checked; joint numerical acceptance NOT completed.')
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
