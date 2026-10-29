"""Real HTTP mode checks; joint acceptance requires the engineering adapter.

Run with a local backend on port 8000. No AI credentials are used.
"""
import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.optimizer.__main__ import joint_demonstration_configs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000',
                        help='Backend origin (default: %(default)s)')
    args = parser.parse_args()
    if not __debug__:
        parser.error('Run without -O or PYTHONOPTIMIZE: numerical checks require assertions')
    print(f'Target: {args.base_url}/api/optimize', flush=True)
    missing = False
    with httpx.Client(base_url=args.base_url, timeout=45) as client:
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
