"""Capture real local E2 responses and confirm demo metrics against direct adapter.

Run an existing backend first; no mocks or extra explanation-only solves.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys

import httpx

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.optimizer.interface import optimize_scenario
from scripts.verify_e1_engineering_evidence import check, near


def scenarios():
    configs=joint_demonstration_configs()
    records=[]
    for name,mode in [('joint_recovery','ev_only'),('joint_recovery','joint'),
                      ('joint_price_shift','joint'),('joint_infeasible','joint')]:
        records.append((name,mode,configs[name].scenario.model_dump()))
    raw=configs['joint_price_shift'].scenario.model_dump()
    individual=deepcopy(raw)
    individual['flexible_equipment'][0]['energy_required_kwh']=5
    records.append(('device-window-shortfall','joint',individual))
    fixed=deepcopy(raw)
    fixed['building_max_demand_kw']=0.5
    records.append(('fixed-demand-shortfall','joint',fixed))
    lp=deepcopy(raw)
    lp['fixed_demand_kw'][:2]=[0,2]
    lp['building_max_demand_kw']=2
    lp['flexible_equipment'][0]['max_power_kw']=1
    records.append(('solver-only-infeasibility','joint',lp))
    captured=json.loads(Path('docs/verification/joint-application-captures.json').read_text())
    commercial=next(r['scenario'] for r in captured['requests'] if r['id']=='sources-dashboard')
    for limit in [25,15,3]:
        s=deepcopy(commercial)
        s['building_max_demand_kw']=limit
        records.append((f'commercial-{limit}kw','joint',s))
    return records


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:8011')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    report=dict(source='real_local_http',base_revision='904c618602beacc564e686d75c3e2ea4390b1f3b',
                implementation='E2 working tree; base_revision is not the implementation or deployment SHA',
                backend=args.base_url,cases=[],checks=[])
    with httpx.Client(base_url=args.base_url,timeout=45) as client:
        for name,mode,body in scenarios():
            response=client.post('/api/optimize',params={'scheduling_mode':mode},json=body)
            assert response.status_code==200,(name,response.text)
            payload=response.json()
            record=dict(name=name,scheduling_mode=mode,scenario=body,response=payload,http_status=response.status_code)
            report['cases'].append(record)
            metrics=check(record)  # Check same-response device arrays; no second solve here.
            direct=optimize_scenario(Scenario.model_validate(body),optimize_flexible=mode=='joint')
            parsed=OptimizationResult.model_validate(payload)
            assert parsed.feasibility_status==direct.feasibility_status
            assert payload['infeasibility_evidence']==[e.model_dump() for e in direct.infeasibility_evidence]
            assert parsed.baseline_demand_kw==direct.baseline_demand_kw
            for kind in ['baseline','optimized']:
                demand=getattr(parsed,f'{kind}_demand_kw')
                if demand is None:
                    assert getattr(direct,f'{kind}_demand_kw') is None
                    continue
                # Equivalent optimal arrays need not coincide across separate solves.
                near(sum(demand),sum(getattr(direct,f'{kind}_demand_kw')))
                near(getattr(parsed,f'{kind}_electricity_cost_usd'),getattr(direct,f'{kind}_electricity_cost_usd'),2e-7)
                near(getattr(parsed,f'{kind}_peak_demand_kw'),getattr(direct,f'{kind}_peak_demand_kw'))
            metrics['evidence_codes']=[e.code for e in parsed.infeasibility_evidence]
            report['checks'].append(metrics)
            print(f'{name}/{mode}: {parsed.feasibility_status}; {metrics["evidence_codes"]}')
    report['pass']=True
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')


if __name__=='__main__':
    if not __debug__:
        raise RuntimeError('Verification requires assertions; do not run with -O')
    main()
