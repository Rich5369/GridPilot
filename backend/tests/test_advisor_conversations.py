"""Curated acceptance fixtures: injected model text, real HTTP and real optimizer.
These tests validate orchestration, not genuine Meta quality.
"""
import json
from copy import deepcopy
import pytest
from backend.tests.test_advisor import provider, client, SAMPLE, ask
from backend.ai.advisor import BusinessProfile

WAREHOUSE = ('I operate a warehouse with 30 employees working from 7 AM to 7 PM. '
             'My electricity bill is about $6,000 per month. We have four electric forklifts '
             'and charge delivery trucks. I want to cut our electricity expenses by 50%.')


def test_warehouse_multiturn(provider):
    profile = BusinessProfile(business_type='warehouse', employee_count=30,
        operating_hours='7 AM to 7 PM', electricity_cost_and_period='$6,000 per month',
        equipment='four electric forklifts', goals='cut our electricity expenses by 50%').model_dump()
    evidence = {key: WAREHOUSE for key, value in profile.items() if value is not None}
    answer = 'Charging flexibility may offer a useful starting point. Your bill reduction goal needs measured consumption and a tariff breakdown before we can assess it.'
    questions = ['Do you have interval electricity consumption data? It helps distinguish steady demand from charging peaks.',
                 'Does your bill include demand charges? That determines whether peak power affects your total bill.']
    provider[1](answer=answer, category='clarification_required', profile=profile,
                profile_evidence=evidence, follow_up_questions=questions, fact_keys=[])
    response = client.post('/api/ai/conversation', json={'request': WAREHOUSE, 'scenario': SAMPLE}).json()
    assert response['profile'] == profile
    assert response['profile']['consumption_and_units'] is None
    assert response['follow_up_questions'] == questions
    assert response['changes'] == dict.fromkeys(['building_max_demand_kw','all_ev_deadline_hour','peak_price_increase_percent'])
    history = [{'role':'user','content':WAREHOUSE}, {'role':'assistant','content':answer+' '+ ' '.join(questions)}]
    provider[1](answer='Charging outside working hours could reduce disruption if your tariff offers cheaper periods. We need charging requirements before testing a supported same-day window.',
        category='clarification_required', profile={}, follow_up_questions=['How much energy does each vehicle need, and when must it be ready? This defines the scheduling window.'], fact_keys=[])
    second = client.post('/api/ai/conversation', json={'request':'Interval data is unknown. Forklifts can charge after work.', 'profile':profile, 'history':history,'scenario':SAMPLE}).json()
    assert second['profile'] == profile  # model omissions cannot erase memory
    payload=json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['history'] == history
    assert not second['proposed_scenario']


@pytest.mark.parametrize('text', ['You will save USD 999.', 'You can save fifty percent.', 'Demand is ² kW.', 'It will reduce your bill.', 'Costs will halve by half.', 'A guaranteed saving.'])
def test_reject_unsupported_quantities(provider, text):
    provider[1](answer=text)
    assert ask().status_code == 502


def test_question_limits_and_profile_evidence(provider):
    provider[1](follow_up_questions=['Question?']*3)
    assert ask().status_code == 502
    provider[1](profile={'consumption_and_units':'100 kWh'}, profile_evidence={'consumption_and_units':'100 kWh'})
    assert ask(history=[{'role':'assistant','content':'100 kWh'}]).status_code == 502
    provider[1](profile={'consumption_and_units':'N/A'})
    assert ask().json()['profile']['consumption_and_units'] is None


def test_exact_execution_and_no_recompute(provider, monkeypatch):
    first=client.post('/api/optimize',json=SAMPLE).json()
    second=client.post('/api/optimize',json=SAMPLE).json()
    assert first['result_id'] != second['result_id']
    monkeypatch.setattr('backend.api.routes.optimize_scenario',lambda *a,**k: pytest.fail('Unexpected new solve'))
    provider[1](answer='The retained result shows how eligible loads were scheduled against submitted prices.',fact_keys=['cost','constraints','devices'])
    response=ask(result_id=first['result_id']).json()
    assert f"{first['optimized_electricity_cost_usd']:.4f}" in response['facts'][0]
    assert 'Proof status:' in response['facts'][1]
    assert 'device schedules:' in response['facts'][2]
    assert 'No retained' in ask(result_id='expired').json()['facts'][0]
    assert 'No retained' in ask().json()['facts'][0]
    assert client.post('/api/ai/explain',json={'scenario':SAMPLE,'result_id':'expired'}).status_code == 409


def test_infeasibility_uses_real_reasons(provider):
    scenario=deepcopy(SAMPLE);scenario['building_max_demand_kw']=0.1
    result=client.post('/api/optimize',json=scenario).json()
    assert result['feasibility_status']=='infeasible'
    provider[1](answer='The retained solver reasons describe the conflict. Review them before changing operational requirements.',fact_keys=['constraints'])
    response=client.post('/api/ai/conversation',json={'request':"Why can't GridPilot schedule all my equipment?",'scenario':scenario,'result_id':result['result_id']}).json()
    assert all(reason in response['facts'][0] for reason in result['constraint_violations'])


def test_reviewed_alternative_has_solver_outcome(provider):
    baseline=client.post('/api/optimize',json=SAMPLE).json()
    provider[1](category='scenario_proposal',answer='Review this site-cap proposal before applying or comparing it.',changes={'building_max_demand_kw':15.0},fact_keys=[])
    proposed=ask(result_id=baseline['result_id']).json()
    assert proposed['proposed_scenario']['building_max_demand_kw']==15
    assert 'result_id' not in proposed['proposed_scenario']
    alternative=client.post('/api/optimize',json=proposed['proposed_scenario']).json()
    assert alternative['result_id'] != baseline['result_id']
    assert alternative['feasibility_status'] in ('feasible','infeasible')
