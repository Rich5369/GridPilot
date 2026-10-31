"""Offline independent accuracy audit; optionally verify a local HTTP server.

Never calls AI. No data/provider retrieval. Output fixtures are synthetic.
Run from the checkout with its backend environment, e.g.:
python scripts/audit_backend_accuracy.py --output /tmp/backend-accuracy.json
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import Scenario
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.verification.accuracy import check_result, exhaustive_cost, small_case


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--base-url',help='Optional LOCAL HTTP origin; no AI endpoint is used')
    args=parser.parse_args()
    if args.base_url:
        from urllib.parse import urlparse
        if urlparse(args.base_url).hostname not in ('localhost','127.0.0.1','::1'):
            parser.error('Only local HTTP is allowed for this audit.')
    from ortools.linear_solver import pywraplp
    from backend.main import app
    report=dict(source='synthetic engineering inputs; no measured business data; no live AI',
                utc=datetime.now(timezone.utc).isoformat(),commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
                working_tree_changes=subprocess.check_output(['git','status','--short'],text=True).splitlines(),
                source_sha256={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path('backend').rglob('*.py'))},
                python=platform.python_version(),solver=pywraplp.Solver.CreateSolver('GLOP').SolverVersion(),
                schema_sha256=hashlib.sha256(json.dumps(app.openapi(),sort_keys=True).encode()).hexdigest(),
                exhaustive=[],representative=[],stress=[],http=[],live_meta_requests=0)
    for mode in ('ev_only','joint'):
        for seed in range(100):
            scenario=small_case(seed)
            optimum=exhaustive_cost(scenario,mode)
            result=optimize_scenario(Scenario.model_validate(scenario),optimize_flexible=mode=='joint').model_dump(mode='json')
            check_result(scenario,result,mode)
            assert (optimum is not None)==(result['feasibility_status']=='feasible')
            if optimum is not None: assert abs(float(optimum)-result['optimized_electricity_cost_usd'])<=2e-7
            report['exhaustive'].append(dict(seed=seed,mode=mode,status=result['feasibility_status'],exact_optimum_usd=str(optimum) if optimum is not None else None))
    cases=joint_demonstration_configs()
    for name,config in cases.items():
        for mode in ('ev_only','joint'):
            scenario=config.scenario.model_dump(mode='json')
            result=optimize_scenario(config.scenario,optimize_flexible=mode=='joint').model_dump(mode='json')
            metrics=check_result(scenario,result,mode)
            report['representative'].append(dict(name=name,mode=mode,scenario=scenario,response=result,recomputed=metrics))
    for count in (10,100,300):
        scenario=dict(operating_hours=dict(start_hour=0,end_hour=24),fixed_demand_kw=[1.0]*24,building_max_demand_kw=5,
            electricity_prices_usd_per_kwh=[0.2]*24,ev_requirements=[dict(id=f'ev-{i}',arrival_hour=0,deadline_hour=24,energy_required_kwh=.125,max_charging_power_kw=.25) for i in range(count)],
            flexible_equipment=[dict(id=f'load-{i}',available_hours=dict(start_hour=0,end_hour=24),energy_required_kwh=.125,max_power_kw=.25) for i in range(count//2)])
        for mode in ('ev_only','joint'):
            started=perf_counter()
            result=optimize_scenario(Scenario.model_validate(scenario),optimize_flexible=mode=='joint').model_dump(mode='json')
            seconds=perf_counter()-started
            check_result(scenario,result,mode)
            # In joint mode the constant allocation attains the average-power bound.
            if mode=='joint':
                expected=1+(count+count//2)*.125/24
                assert abs(result['optimized_peak_demand_kw']-expected)<=1e-6
                assert abs(result['optimized_electricity_cost_usd']-(24+(count+count//2)*.125)*.2)<=2e-7
            report['stress'].append(dict(ev_count=count,flexible_count=count//2,mode=mode,status=result['feasibility_status'],seconds=seconds,optimized_peak_kw=result['optimized_peak_demand_kw']))
    if args.base_url:
        import httpx
        with httpx.Client(base_url=args.base_url,timeout=45) as client:
            assert client.get('/api/health').status_code==200
            for record in report['representative']:
                response=client.post('/api/optimize',params={'scheduling_mode':record['mode']},json=record['scenario'])
                assert response.status_code==200
                data=response.json()
                metrics=check_result(record['scenario'],data,record['mode'])
                assert data['result_id'] and data['feasibility_status']==record['response']['feasibility_status']
                report['http'].append(dict(name=record['name'],mode=record['mode'],status=response.status_code,result_id=data['result_id'],response=data,recomputed=metrics))
            for payload,params in [({},{}), ({**report['representative'][0]['scenario'],'unexpected':1},{}), (report['representative'][0]['scenario'],{'scheduling_mode':'invalid'})]:
                assert client.post('/api/optimize',json=payload,params=params).status_code==422
            bad=json.dumps({**report['representative'][0]['scenario'],'building_max_demand_kw':'OVERFLOW'}).replace('"OVERFLOW"','1e309')
            assert client.post('/api/optimize',content=bad,headers={'Content-Type':'application/json'}).status_code==422
            report['invalid_http_checks']=4
            assert client.get('/openapi.json').json()==app.openapi()
    report['summary']=dict(exhaustive_cases=len(report['exhaustive']),classifications=dict(Counter(r['status'] for r in report['exhaustive'])),representative_cases=len(report['representative']),stress_cases=len(report['stress']),http_cases=len(report['http']),status='PASS')
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps(report['summary']))


if __name__=='__main__': main()
