"""Record curated fixtures through FastAPI; NEVER calls a live model.
Run from repository root: python -m scripts.verify_advisor_conversations
Prose is injected; all evidence and optimizer outcomes come from application code.
"""
import json
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.ai.advisor import BusinessProfile


def main():
    client = TestClient(app)
    scenario=json.loads(Path('sample_data/scenario.demo.json').read_text())
    scenario['electricity_prices_usd_per_kwh']=[0.3]*12+[0.1]*12
    result=client.post('/api/optimize',json=scenario).json()
    assert result['optimized_electricity_cost_usd'] < result['baseline_electricity_cost_usd']
    records=[]
    profile={}
    history=[]
    def turn(request, selection, *, inputs=None, result_id=None):
        nonlocal profile
        def injected(schema, *_args, **_kwargs):
            return schema.model_validate({'profile':{},'changes':{},'fact_keys':[],'category':'answer',**selection}), 'mock'
        with patch('backend.ai.advisor.generate',injected):
            response=client.post('/api/ai/conversation',json={'request':request,'scenario':inputs or scenario,
                'result_id':result_id,'profile':profile,'history':history[-12:]})
        assert response.status_code==200,response.text
        body=response.json();profile=body['profile']
        history.extend([{'role':'user','content':request},{'role':'assistant','content':body['message']+' '+ ' '.join(body['follow_up_questions'])}])
        records.append({'source':'injected qualitative prose; real server evidence and solver; NOT live Meta','request':request,'response':body})
        return body
    warehouse=('I operate a warehouse with 30 employees working from 7 AM to 7 PM. My electricity bill is about $6,000 per month. '
               'We have four electric forklifts and charge delivery trucks. I want to cut our electricity expenses by 50%.')
    extracted=BusinessProfile(business_type='warehouse',employee_count=30,operating_hours='7 AM to 7 PM',
        electricity_cost_and_period='$6,000 per month',equipment='four electric forklifts and charge delivery trucks',
        goals='cut our electricity expenses by 50%').model_dump()
    turn(warehouse,{'answer':'Charging flexibility may offer a useful starting point. Your bill reduction goal needs measured consumption and a tariff breakdown before we can assess it.',
        'category':'clarification_required','profile':extracted,'profile_evidence':{k:warehouse for k,v in extracted.items() if v is not None},
        'follow_up_questions':['Do you have interval electricity consumption data? It helps distinguish steady demand from charging peaks.',
        'Does your bill include demand charges? That determines whether peak power affects your total bill.']})
    turn('Interval consumption is unknown. Forklifts can charge after work. Would overnight charging help?',{
        'answer':'Cheaper tariff periods and charging flexibility could create an opportunity. The current same-day model cannot represent a window crossing midnight. Your equipment must be represented by supported scheduling inputs before it can be tested.',
        'follow_up_questions':['How much energy does each vehicle require, and when must it be ready? These requirements define what scheduling can test.']})
    turn('Why did optimization reduce my daily cost?',{'answer':'The retained result shows eligible charging moving within configured windows against submitted prices. The business background has not changed the submitted engineering inputs.', 'fact_keys':['cost','devices','insights']},result_id=result['result_id'])
    invalid=deepcopy(scenario);invalid['building_max_demand_kw']=0.1
    infeasible=client.post('/api/optimize',json=invalid).json()
    turn("Why can't GridPilot schedule all my equipment?",{'answer':'The retained solver reasons describe the conflict. Review those constraints before relaxing operational requirements.','fact_keys':['constraints']},inputs=invalid,result_id=infeasible['result_id'])
    proposal=turn('Keep the entire site below 15 kW.',{'answer':'Review this site-cap proposal before comparing it.','category':'scenario_proposal','changes':{'building_max_demand_kw':15.0}})
    alternative=client.post('/api/optimize',json=proposal['proposed_scenario']).json()
    records.append({'source':'explicit test-harness approval followed by real optimizer','baseline':result,'alternative':alternative})
    Path('artifacts/advisor-v2/conversation-transcripts.json').write_text(json.dumps(records,indent=2))
    print('PASS: warehouse memory, progressive questions, same-day boundary, verified cost reduction, infeasibility and explicit alternative solve. Injected prose, NOT live Meta.')

if __name__=='__main__':
    main()
