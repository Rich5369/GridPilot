"""Independent, manually checked financial examples; no network/AI requests."""
import asyncio
from datetime import date
from decimal import Decimal
import json
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.main import app
from backend.eia.retail import RetailService, RetailPrices, DATA_DIR
from backend.savings.models import SavingsRequest, Measure
from backend.savings.service import build_recommendations, recommend_measure
from backend.savings.catalog import CATALOG

TODAY = date(2026,10,30)
RATE = dict(usd_per_kwh=.20, source='synthetic tariff fixture', valid_from='2026-01-01',
    valid_through='2026-12-31', customer_applicability_confirmed=True, flat_avoidable_energy_rate_confirmed=True)
BASE = dict(id='test', category='led', load_id='lights', evidence_kind='synthetic',
    evidence_reference='test fixture only', fixture_count=100, old_watts=60., new_watts=10.,
    hours_per_day=10., days_per_year=250, equivalent_service_confirmed=True,
    installation_cost_usd=2500., annual_incremental_cost_usd=0., rate=RATE)

class Saved:
    async def get(self):
        return RetailPrices.model_validate_json((DATA_DIR/'commercial_snapshot.json').read_text())


def calc(**changes):
    return recommend_measure(Measure.model_validate(BASE | changes), TODAY)


def test_led_hand_checked():
    # 100 * (60 - 10)/1000 * 10 * 250 = 12,500 kWh
    # 12,500 * .20 = $2,500; 2,500 / 2,500 = 1 year; ROI 100%.
    r = calc()
    assert r.annual_kwh_saved == 12500
    assert r.annual_energy_charge_savings_usd == 2500
    assert r.annual_net_savings_usd == 2500
    assert r.simple_payback_years == 1
    assert r.annual_simple_roi_percent == 100
    assert r.calculation_status == 'scenario_estimate'
    assert r.provenance['kind'] == 'synthetic'

@pytest.mark.parametrize('category,fields,expected', [
    ('shutdown',dict(connected_load_kw=2.,existing_hours_per_day=12.,avoidable_hours_per_day=4.,
        days_per_year=250,safe_to_switch_off=True,essential_service=False),2000),
    ('lighting_controls',dict(connected_load_kw=5.,existing_hours_per_day=10.,avoidable_hours_per_day=2.,
        days_per_year=250,safe_to_switch_off=True,essential_service=False),2500),
    ('office',dict(device_count=20,active_watts=100.,low_power_watts=5.,existing_hours_per_day=12.,
        avoidable_hours_per_day=8.,days_per_year=250,safe_to_switch_off=True,essential_service=False),3800),
    ('motor',dict(before_annual_kwh=5000.,after_annual_kwh=4000.,equivalent_service_confirmed=True),1000),
    ('refrigeration',dict(before_annual_kwh=1500.,after_annual_kwh=900.,equivalent_service_confirmed=True),600),
])
def test_other_equations(category,fields,expected):
    m = Measure.model_validate({k:BASE[k] for k in ('id','load_id','evidence_kind','evidence_reference','rate',
        'installation_cost_usd','annual_incremental_cost_usd')} | dict(category=category) | fields)
    r = recommend_measure(m,TODAY)
    assert r.annual_kwh_saved == expected
    assert r.annual_net_savings_usd == expected*.2

@pytest.mark.parametrize('field,value', [('old_watts',float('nan')),('new_watts',float('inf')),
    ('fixture_count',True),('hours_per_day',25.),('days_per_year',367),('new_watts',61.),
    ('installation_cost_usd',-1.),('old_watts','60'),('old_watts',0.),('new_watts',0.)])
def test_strict_invalid(field,value):
    with pytest.raises(ValidationError):
        Measure.model_validate(BASE | {field:value})

@pytest.mark.parametrize('field', ['fixture_count','old_watts','new_watts','hours_per_day','days_per_year','equivalent_service_confirmed'])
def test_missing_evidence(field):
    r=calc(**{field:None})
    assert r.calculation_status=='needs_data'
    assert r.annual_kwh_saved is None
    assert any(field in x for x in r.missing_information)

@pytest.mark.parametrize('field,value', [('customer_applicability_confirmed',False),
    ('flat_avoidable_energy_rate_confirmed',False),('valid_through','2026-01-31'),('valid_from','2026-12-01')])
def test_unusable_tariff_leaves_energy(field,value):
    r=calc(rate=RATE | {field:value})
    assert r.annual_kwh_saved==12500
    assert r.annual_net_savings_usd is None
    assert r.simple_payback_years is None


def test_missing_cost_rate_and_equivalent_service():
    assert calc(rate=None).annual_energy_charge_savings_usd is None
    assert calc(installation_cost_usd=None).simple_payback_years is None
    assert calc(annual_incremental_cost_usd=None).annual_net_savings_usd is None
    assert calc(equivalent_service_confirmed=False).annual_kwh_saved is None

@pytest.mark.parametrize('category',['shutdown','lighting_controls','office'])
@pytest.mark.parametrize('safe,essential',[(None,False),(False,False),(True,True),(True,None)])
def test_safety(category,safe,essential):
    m=Measure(id='safe',category=category,load_id='a',evidence_kind='user_entered',evidence_reference='caller',
        connected_load_kw=2., existing_hours_per_day=12.,avoidable_hours_per_day=4.,days_per_year=250,
        device_count=10,active_watts=100.,low_power_watts=5.,safe_to_switch_off=safe,essential_service=essential)
    assert recommend_measure(m,TODAY).annual_kwh_saved is None


def test_nonpositive_benefits():
    assert calc(new_watts=60.).annual_net_savings_usd == 0
    assert calc(new_watts=60.).simple_payback_years is None
    assert calc(annual_incremental_cost_usd=3000.).annual_net_savings_usd == -500
    assert calc(annual_incremental_cost_usd=3000.).simple_payback_years is None
    assert calc(installation_cost_usd=0.).simple_payback_years == 0
    assert calc(installation_cost_usd=0.).annual_simple_roi_percent is None
    r=calc(category='refrigeration',before_annual_kwh=100.,after_annual_kwh=200.)
    assert r.annual_net_savings_usd == -20
    assert r.priority_group=='investigation'


def test_round_money_once():
    r=calc(fixture_count=1,old_watts=1001.,new_watts=1.,hours_per_day=1.,days_per_year=1,
        rate=RATE|dict(usd_per_kwh=.005),installation_cost_usd=1.)
    assert r.annual_energy_charge_savings_usd==.01
    assert r.simple_payback_years==200


def test_catalog_complete_and_no_fabricated_hvac_solar_demand():
    r=asyncio.run(build_recommendations(SavingsRequest(),Saved(),TODAY))
    assert len(CATALOG)==len(r.recommendations)==16
    for item in r.recommendations:
        assert item.calculation_status=='needs_data'
        assert item.annual_kwh_saved is None
        assert item.annual_net_savings_usd is None
        assert item.missing_information
    assert {r.category for r in r.recommendations}==set(CATALOG)


def test_benchmark_conversion_and_no_tariff_substitution():
    request=SavingsRequest.model_validate(dict(location=dict(state='California'), measures=[BASE|dict(rate=None)]))
    result=asyncio.run(build_recommendations(request,Saved(),TODAY))
    prices=asyncio.run(Saved().get())
    cents=next(s.cents_per_kwh for s in prices.states if s.state=='California')
    assert result.benchmark['average_retail_price']==cents/100
    assert result.benchmark['sector']=='COM'
    assert result.benchmark['period']==prices.period
    assert result.benchmark['retrieved_at']==prices.source_checked_at.isoformat()
    assert next(r for r in result.recommendations if r.id=='test').annual_energy_charge_savings_usd is None


def test_eia_fallback_and_total_failure(tmp_path):
    class Offline(RetailService):
        async def fetch(self):
            raise TimeoutError()
    prices=asyncio.run(Offline(clock=lambda:__import__('datetime').datetime(2026,10,30,tzinfo=__import__('datetime').timezone.utc)).get())
    assert prices.status=='saved'
    missing=Offline(snapshot_path=tmp_path/'missing.json')
    request=SavingsRequest.model_validate(dict(location=dict(state='California'),measures=[BASE]))
    r=asyncio.run(build_recommendations(request,missing,TODAY))
    assert r.benchmark is None
    assert next(i for i in r.recommendations if i.id=='test').annual_kwh_saved==12500
    assert any('unavailable' in w for w in r.warnings)


def test_no_double_counting_or_fabricated_portfolio_and_ranking():
    request=SavingsRequest.model_validate(dict(measures=[BASE,BASE|dict(id='second',evidence_kind='measured'),
        BASE|dict(id='third',old_watts=20.)]))
    r=asyncio.run(build_recommendations(request,Saved(),TODAY))
    assert r.portfolio_savings_usd is None
    assert any('overlapping baseline' in w for w in r.warnings)
    assert [x.id for x in r.recommendations[:3]]==['second','test','third']
    assert r.recommendations[0].calculation_status=='quantified'

@pytest.mark.parametrize('location',[dict(state='XX'),dict(state='CA'),dict(zip_code='9021'),dict(latitude=34.)])
def test_invalid_location(location):
    with pytest.raises(ValidationError):
        SavingsRequest.model_validate(dict(location=location))


def test_unknown_location_and_explicit_not_applicable():
    request=SavingsRequest.model_validate(dict(location=dict(zip_code='90210'),measures=[BASE|dict(applicable=False)]))
    r=asyncio.run(build_recommendations(request,Saved(),TODAY))
    assert r.benchmark is None
    item=next(x for x in r.recommendations if x.id=='test')
    assert item.calculation_status=='not_applicable'
    assert item.annual_kwh_saved is None


def test_api_contract(monkeypatch):
    monkeypatch.setattr('backend.savings.routes.service',Saved())
    client=TestClient(app)
    assert client.get('/api/savings/catalog').status_code==200
    response=client.post('/api/savings/recommendations',json=dict(measures=[BASE]))
    assert response.status_code==200
    assert response.json()['version']=='1'
    assert len(response.json()['recommendations'])==16
    assert response.json()['portfolio_savings_usd'] is None
    assert client.post('/api/savings/recommendations',json=dict(unexpected=True)).status_code==422
    assert client.post('/api/savings/recommendations',json=dict(measures=[BASE,BASE])).status_code==422
    raw=json.dumps(dict(measures=[BASE])).replace('60.0','NaN')
    assert client.post('/api/savings/recommendations',content=raw,headers={'content-type':'application/json'}).status_code==422
    schema=client.get('/openapi.json').json()
    assert '/api/optimize' in schema['paths']
    assert '/api/savings/recommendations' in schema['paths']


def test_invalid_hours_and_dates():
    with pytest.raises(ValidationError):
        calc(existing_hours_per_day=2.,avoidable_hours_per_day=3.)
    with pytest.raises(ValidationError):
        calc(rate=RATE|dict(valid_through='2025-01-01'))


def test_zero_net_is_not_investment_priority():
    assert calc(new_watts=60.).priority_group == 'investigation'
    assert calc(annual_incremental_cost_usd=3000.).priority_group == 'investigation'


def test_equal_alternatives_stable_order():
    request=SavingsRequest.model_validate(dict(measures=[BASE|dict(id='b'),BASE|dict(id='a')]))
    result=asyncio.run(build_recommendations(request,Saved(),TODAY))
    assert [r.id for r in result.recommendations[:2]] == ['a','b']
    assert result.recommendations[0].annual_net_savings_usd==result.recommendations[1].annual_net_savings_usd


def test_unavailable_advanced_sources_are_not_dependencies(monkeypatch):
    import httpx
    def forbidden(*args,**kwargs):
        raise AssertionError('No solar, URDB, climate or AI transport allowed')
    monkeypatch.setattr(httpx.AsyncClient,'get',forbidden)
    request=SavingsRequest.model_validate(dict(measures=[BASE]))
    r=asyncio.run(build_recommendations(request,Saved(),TODAY))
    for category in ('solar','hvac_setpoints','hvac_schedule','demand','tariff_comparison'):
        item=next(i for i in r.recommendations if i.category==category)
        assert item.calculation_status=='needs_data'
        assert item.annual_net_savings_usd is None


def test_measured_data_keeps_unknown_annual_consumption_unknown():
    m=Measure(id='fridge',category='refrigeration',load_id='r',evidence_kind='measured',
        evidence_reference='inventory only',equivalent_service_confirmed=True)
    r=recommend_measure(m,TODAY)
    assert r.annual_kwh_saved is None
    assert set(r.missing_information)=={'before_annual_kwh','after_annual_kwh'}
