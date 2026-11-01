"""Fictional recurring-benefit examples; all HTTP/provider work stays offline."""
import asyncio
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.ai import savings as advisor
from backend.main import app
from backend.savings.models import Measure, SavingsRequest
from backend.savings.service import build_recommendations, recommend_measure
from backend.tests.test_savings import BASE, RATE, Saved, TODAY


BENEFIT = dict(annual_operating_cost_savings_usd=300.,
    operating_cost_savings_reference='Fictional customer estimate: annual lamp/service costs fall from $400 to $100; excludes energy and incentives')
ACCEPTANCE = BASE | BENEFIT | dict(annual_incremental_cost_usd=100., installation_cost_usd=2700.)


def calculate(**changes):
    return recommend_measure(Measure.model_validate(ACCEPTANCE | changes), TODAY)


def test_independent_acceptance_and_attribution():
    r = calculate()
    # 100 * (60-10)/1000 * 10 * 250 = 12,500 kWh; * $0.20 = $2,500.
    # $2,500 + ($400-$100) - $100 = $2,700; $2,700/$2,700 = 1 year.
    assert r.annual_kwh_saved == 12500
    assert r.annual_energy_charge_savings_usd == 2500
    assert r.annual_operating_cost_savings_usd == 300
    assert r.annual_net_savings_usd == 2700
    assert r.simple_payback_years == 1
    assert r.annual_simple_roi_percent == 100
    assert r.inputs_used['annual_incremental_cost_usd'] == 100
    assert r.inputs_used['annual_operating_cost_savings_usd'] == 300
    assert r.provenance['operating_cost_savings_reference'] == BENEFIT['operating_cost_savings_reference']
    assert r.inputs_used['operating_cost_savings_reference'] == BENEFIT['operating_cost_savings_reference']
    assert r.calculation_status == 'scenario_estimate'
    assert any('not independently verified' in s and 'one-time incentives' in s for s in r.assumptions)


@pytest.mark.parametrize('optional', [{}, {'annual_operating_cost_savings_usd': None},
    {'annual_operating_cost_savings_usd': 0.}])
def test_legacy_unknown_and_zero_keep_previous_finances(optional):
    r = recommend_measure(Measure.model_validate(BASE | optional), TODAY)
    assert (r.annual_kwh_saved, r.annual_energy_charge_savings_usd,
            r.annual_net_savings_usd, r.simple_payback_years,
            r.annual_simple_roi_percent) == (12500, 2500, 2500, 1, 100)
    assert r.annual_operating_cost_savings_usd == optional.get('annual_operating_cost_savings_usd')
    if optional.get('annual_operating_cost_savings_usd') is None:
        assert any('not included' in s and 'unknown' in s for s in r.assumptions)


@pytest.mark.parametrize('value', [-1., float('nan'), float('inf'), -float('inf'), True, '300', 1e12 + 1])
def test_invalid_benefit_rejected(value):
    with pytest.raises(ValidationError):
        Measure.model_validate(ACCEPTANCE | {'annual_operating_cost_savings_usd': value})


@pytest.mark.parametrize('reference', [None, '', ' \t\n', 'x' * 501])
def test_positive_benefit_requires_specific_nonblank_reference(reference):
    with pytest.raises(ValidationError):
        Measure.model_validate(ACCEPTANCE | {'operating_cost_savings_reference': reference})


@pytest.mark.parametrize('changes', [dict(annual_incremental_cost_usd=None), dict(rate=None),
    dict(rate=RATE | {'valid_through': '2026-01-01'}),
    dict(rate=RATE | {'flat_avoidable_energy_rate_confirmed': False})])
def test_benefit_does_not_fill_unknown_financial_inputs(changes):
    r = calculate(**changes)
    assert r.annual_kwh_saved == 12500
    assert r.annual_operating_cost_savings_usd == 300
    assert r.annual_net_savings_usd is r.simple_payback_years is r.annual_simple_roi_percent is None
    assert r.missing_information


def test_missing_upfront_preserves_net_but_not_payback():
    r = calculate(installation_cost_usd=None)
    assert r.annual_net_savings_usd == 2700
    assert r.simple_payback_years is r.annual_simple_roi_percent is None


@pytest.mark.parametrize('expense,net,roi', [(2800., 0., 0.), (2900., -100., -100 / 2700 * 100)])
def test_nonpositive_net_remains_visible(expense, net, roi):
    r = calculate(annual_incremental_cost_usd=expense)
    assert r.annual_net_savings_usd == net
    assert r.simple_payback_years is None
    assert r.annual_simple_roi_percent == pytest.approx(roi)
    assert r.priority_group == 'investigation'


def test_zero_upfront_keeps_existing_semantics():
    r = calculate(installation_cost_usd=0.)
    assert r.simple_payback_years == 0
    assert r.annual_simple_roi_percent is None


def test_round_only_after_adding_components():
    r = calculate(fixture_count=1, old_watts=1001., new_watts=1., hours_per_day=1., days_per_year=1,
        rate=RATE | dict(usd_per_kwh=.005), annual_operating_cost_savings_usd=.005,
        annual_incremental_cost_usd=0., installation_cost_usd=1.)
    assert r.annual_energy_charge_savings_usd == .01
    assert r.annual_operating_cost_savings_usd == .01
    assert r.annual_net_savings_usd == .01  # raw .005 + .005, not rounded .01 + .01
    assert r.simple_payback_years == 100
    assert r.annual_simple_roi_percent == 1


@pytest.mark.parametrize('category,fields,kwh', [
    ('led', {}, 12500),
    ('lighting_controls', dict(connected_load_kw=5., existing_hours_per_day=10.,
        avoidable_hours_per_day=2., days_per_year=250, safe_to_switch_off=True, essential_service=False), 2500),
    ('shutdown', dict(connected_load_kw=2., existing_hours_per_day=12.,
        avoidable_hours_per_day=4., days_per_year=250, safe_to_switch_off=True, essential_service=False), 2000),
    ('office', dict(device_count=20, active_watts=100., low_power_watts=5., existing_hours_per_day=12.,
        avoidable_hours_per_day=8., days_per_year=250, safe_to_switch_off=True, essential_service=False), 3800),
    ('motor', dict(before_annual_kwh=5000., after_annual_kwh=4000.), 1000),
    ('refrigeration', dict(before_annual_kwh=1500., after_annual_kwh=900.), 600),
])
def test_all_six_energy_equations_unchanged(category, fields, kwh):
    r = calculate(category=category, **fields)
    assert r.annual_kwh_saved == kwh
    assert r.annual_energy_charge_savings_usd == kwh * .2
    assert r.annual_net_savings_usd == kwh * .2 + 300 - 100


@pytest.mark.parametrize('changes', [dict(applicable=False), dict(old_watts=None),
    dict(category='solar')])
def test_recurring_benefit_cannot_bypass_energy_or_applicability_gates(changes):
    r = calculate(**changes)
    assert r.annual_kwh_saved is r.annual_net_savings_usd is r.annual_operating_cost_savings_usd is None


def test_eia_never_supplies_rate_and_overlap_never_supplies_total():
    request = SavingsRequest.model_validate(dict(location={'state': 'California'}, measures=[
        ACCEPTANCE | dict(rate=None), ACCEPTANCE | dict(id='same-load', rate=None)]))
    response = asyncio.run(build_recommendations(request, Saved(), TODAY))
    assert response.benchmark['average_retail_price'] is not None
    for r in response.recommendations:
        assert r.annual_energy_charge_savings_usd is r.annual_net_savings_usd is None
    assert response.portfolio_savings_usd is None
    assert any('overlapping baseline' in w for w in response.warnings)


@pytest.fixture
def offline_api(monkeypatch):
    async def fixed(request, service):
        return await build_recommendations(request, service, TODAY)
    def unavailable(*args, **kwargs):
        raise HTTPException(503, 'offline provider fixture')
    monkeypatch.setattr('backend.savings.routes.service', Saved())
    monkeypatch.setattr('backend.savings.routes.build_recommendations', fixed)
    monkeypatch.setattr(advisor, 'service', Saved())
    monkeypatch.setattr(advisor, 'build_recommendations', fixed)
    monkeypatch.setattr(advisor, 'generate', unavailable)
    return TestClient(app)


@pytest.mark.parametrize('provider_available', [False, True])
def test_routes_catalog_openapi_and_fallback(offline_api, monkeypatch, provider_available):
    if provider_available:
        monkeypatch.setattr(advisor, 'generate', lambda *args, **kwargs: (
            advisor.CategorySelection(categories=['led']), 'meta'))
    catalog = offline_api.get('/api/savings/catalog').json()
    assert catalog['version'] == '1' and len(catalog['categories']) == 16
    assert 'annual_operating_cost_savings_usd' in catalog['categories'][0]['optional_inputs']
    for measure in (BASE, ACCEPTANCE):
        direct = offline_api.post('/api/savings/recommendations', json={'measures': [measure]})
        conversation = offline_api.post('/api/ai/savings/conversation', json={
            'request': 'Review this fictional estimate', 'evidence': {'measures': [measure]}})
        assert direct.status_code == conversation.status_code == 200
        body = conversation.json()
        assert body['source'] == ('meta' if provider_available else 'deterministic_fallback')
        assert body['savings'] == direct.json()
        r = next(r for r in body['savings']['recommendations'] if r['id'] == 'test')
        assert r['annual_net_savings_usd'] == (2700 if measure is ACCEPTANCE else 2500)
        fact = body['facts'][0]
        if measure is ACCEPTANCE:
            assert '300.0 USD/year (caller supplied, not independently verified' in fact
            assert BENEFIT['operating_cost_savings_reference'] in fact
            assert 'annual incremental operating expenses 100.0 USD/year' in fact
        else:
            assert 'operating-cost savings not included in estimate' in fact
    schema = offline_api.get('/openapi.json').json()
    assert schema['components']['schemas']['Measure']['properties']['annual_operating_cost_savings_usd']
    assert schema['components']['schemas']['Recommendation']['properties']['annual_operating_cost_savings_usd']


@pytest.mark.parametrize('value', [-1., float('nan'), float('inf')])
def test_http_invalid_benefit_returns_422(offline_api, value):
    evidence = {'measures': [ACCEPTANCE | dict(annual_operating_cost_savings_usd=value)]}
    for path, body in [('/api/savings/recommendations', evidence),
        ('/api/ai/savings/conversation', {'request': 'Help', 'evidence': evidence})]:
        response = offline_api.post(path, content=json.dumps(body), headers={'content-type': 'application/json'})
        assert response.status_code == 422


def test_ai_cannot_supply_a_recurring_benefit():
    with pytest.raises(ValidationError):
        advisor.CategorySelection.model_validate({'categories': ['led'], **BENEFIT})
