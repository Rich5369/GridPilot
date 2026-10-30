"""Real same-solve accounting and adversarial injected causal prose."""
from copy import deepcopy
import pytest
from backend.tests.test_advisor import provider, client, SAMPLE
from backend.ai.cost_attribution import describe_cost_change
from backend.models.contracts import Scenario, OptimizationResult


def commercial():
    scenario=deepcopy(SAMPLE)
    scenario.update(fixed_demand_kw=[3.0]*24,
        electricity_prices_usd_per_kwh=[0.12]*14+[0.28]*6+[0.12]*4,
        ev_requirements=[{'id':f'ev-{i}','arrival_hour':15,'deadline_hour':22,'energy_required_kwh':14.4,'max_charging_power_kw':7.2} for i in range(2)],
        flexible_equipment=[{'id':'equipment','available_hours':{'start_hour':10,'end_hour':16},'energy_required_kwh':6.0,'max_power_kw':3.0}])
    return scenario


@pytest.mark.parametrize('question', ['Why did optimization reduce my daily cost?', 'Explain this optimization result.', 'What made the optimized schedule cheaper?'])
def test_cost_question_cannot_attribute_unchanged_equipment(provider, monkeypatch, question):
    scenario=commercial()
    result=client.post('/api/optimize?scheduling_mode=joint',json=scenario).json()
    provider[1](answer='Flexible equipment caused the cost reduction.',fact_keys=['cost'])
    monkeypatch.setattr('backend.api.routes.optimize_scenario',lambda *a,**k: pytest.fail('Unexpected new solve'))
    response=client.post('/api/ai/conversation',json={'request':question,
        'scenario':scenario,'scheduling_mode':'joint','result_id':result['result_id']})
    assert response.status_code==200
    body=response.json()
    assert 'Flexible equipment caused' not in body['message']
    assert 'lower modeled daily energy charges' in body['message']
    assert 'flexible equipment: baseline USD 0.7200; optimized USD 0.7200; difference USD 0.0000' in ' '.join(body['facts'])
    assert 'difference USD 2.3040' in ' '.join(body['facts'])
    assert 'unique causal allocation' in ' '.join(body['facts'])
    assert body['source']=='meta'  # Injected provider fixture, not live acceptance.


def test_no_device_allocation_without_reconciled_evidence(provider):
    raw=commercial();scenario=Scenario.model_validate(raw)
    result=OptimizationResult.model_validate(client.post('/api/optimize?scheduling_mode=joint',json=raw).json())
    for invalid in [result.model_copy(update={'operating_plan':None}),
                    result.model_copy(update={'baseline_electricity_cost_usd':999}),
                    result.model_copy(update={'baseline_demand_kw':[999.0]*24})]:
        answer,evidence=describe_cost_change(scenario,'joint',invalid)
        assert evidence is None
        assert 'contributions are not established' in answer
    assert describe_cost_change(scenario,'ev_only',result)[1] is None


def test_missing_and_infeasible_results_do_not_claim_reduction(provider):
    raw=commercial();scenario=Scenario.model_validate(raw)
    assert 'unavailable' in describe_cost_change(scenario,'joint',None)[0]
    raw['building_max_demand_kw']=0.1
    result=OptimizationResult.model_validate(client.post('/api/optimize?scheduling_mode=joint',json=raw).json())
    answer,evidence=describe_cost_change(Scenario.model_validate(raw),'joint',result)
    assert 'no optimized energy-cost reduction is established' in answer
    assert evidence is None


def test_flat_tariff_no_claim_of_savings(provider):
    raw=commercial();raw['electricity_prices_usd_per_kwh']=[0.12]*24
    result=OptimizationResult.model_validate(client.post('/api/optimize?scheduling_mode=joint',json=raw).json())
    answer,evidence=describe_cost_change(Scenario.model_validate(raw),'joint',result)
    assert 'effectively unchanged' in answer
    assert evidence.count('difference USD 0.0000')==3


def test_general_business_advice_stays_contextual(provider):
    text='Charging outside working hours may help if your tariff and readiness windows permit it.'
    provider[1](answer=text,fact_keys=[])
    response=client.post('/api/ai/conversation',json={'request':'How can I reduce warehouse electricity costs?', 'scenario':SAMPLE})
    assert response.json()['message']==text


def test_unsupported_numbers_still_rejected_for_result_question(provider):
    provider[1](answer='The equipment saved 50 percent.',fact_keys=['cost'])
    response=client.post('/api/ai/conversation',json={'request':'Explain my optimization costs.','scenario':SAMPLE})
    assert response.status_code==502
