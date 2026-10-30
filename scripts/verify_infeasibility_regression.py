"""Compare existing demonstrations and seeded cases with the pre-E2 solver.

Loads that known revision from local Git; does not fetch or change repository files.
"""
import argparse,json,random,subprocess,sys,types
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.models.contracts import Scenario
from backend.optimizer import solver
from backend.optimizer.__main__ import demonstration_configs,joint_demonstration_configs
if not __debug__:
    raise RuntimeError('Verification requires assertions; do not run with -O')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
base='904c618602beacc564e686d75c3e2ea4390b1f3b'
source=subprocess.check_output(['git','show',base+':backend/optimizer/solver.py'],text=True)
old=types.ModuleType('backend.optimizer._pre_e2_solver')
sys.modules[old.__name__]=old
exec(compile(source,'pre_e2_solver.py','exec'),old.__dict__)
rng=random.Random(20261030)
cases=[c.scenario for c in {**demonstration_configs(),**joint_demonstration_configs()}.values()]
for _ in range(100):
    evs=[]; flex=[]
    for i in range(rng.randrange(4)):
        start=rng.randrange(23); end=rng.randrange(start+1,25); power=rng.choice([0.5,1,2,7.2])
        evs.append(dict(id=f'ev:{i}',arrival_hour=start,deadline_hour=end,max_charging_power_kw=power,
                        energy_required_kwh=rng.choice([0,0.5,1,1.1])*power*(end-start)))
    for i in range(rng.randrange(3)):
        start=rng.randrange(23); end=rng.randrange(start+1,25); power=rng.choice([0.5,1,2,3])
        flex.append(dict(id=f'flex:{i}',available_hours=dict(start_hour=start,end_hour=end),max_power_kw=power,
                         energy_required_kwh=rng.choice([0,0.5,1,1.1])*power*(end-start)))
    cases.append(Scenario(operating_hours=dict(start_hour=0,end_hour=24),fixed_demand_kw=[rng.choice([0,1,2,3]) for _ in range(24)],
                          electricity_prices_usd_per_kwh=[rng.choice([-0.1,0,0.12,0.28]) for _ in range(24)],
                          building_max_demand_kw=rng.choice([2,4,10,25]),ev_requirements=evs,flexible_equipment=flex))
report=dict(base_revision=base,source='pre_E2_solver_loaded_from_git_vs_working_tree',seed=20261030,
            comparisons=0,status_counts={},legacy_messages_identical=True,max_cost_residual_usd=0,max_peak_residual_kw=0)
for s in cases:
    for joint in (False,True):
        a=old.solve_ev_charging(s,optimize_flexible=joint); b=solver.solve_ev_charging(s,optimize_flexible=joint)
        for field in ('status','objective','primary_status','secondary_status','reasons','warnings'):
            assert getattr(a,field)==getattr(b,field),(field,a,b)
        assert (a.primary_optimum_usd is None)==(b.primary_optimum_usd is None)
        if a.primary_optimum_usd is not None:
            assert abs(a.primary_optimum_usd-b.primary_optimum_usd)<=2e-7
        assert (a.evaluated is None)==(b.evaluated is None)
        if a.evaluated is not None:
            cost=abs(a.evaluated.electricity_cost_usd-b.evaluated.electricity_cost_usd)
            peak=abs(a.evaluated.peak_demand_kw-b.evaluated.peak_demand_kw)
            assert cost<=2e-7 and peak<=1e-6
            assert abs(sum(a.evaluated.demand_kw)-sum(b.evaluated.demand_kw))<=1e-6
            report['max_cost_residual_usd']=max(report['max_cost_residual_usd'],cost)
            report['max_peak_residual_kw']=max(report['max_peak_residual_kw'],peak)
        report['comparisons']+=1
        report['status_counts'][b.status]=report['status_counts'].get(b.status,0)+1
args.output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
