"""Fictional business cases; no customer measurements or paid AI calls."""
import asyncio
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.main import app
from backend.savings.models import Measure, SavingsRequest
from backend.savings.service import recommend_measure, build_recommendations
from backend.tests.test_savings import BASE, TODAY, Saved

CASES = [
    ('led', dict(fixture_count=100, old_watts=60., new_watts=10., hours_per_day=10., days_per_year=250,
                 equivalent_service_confirmed=True), 12500),
    ('lighting_controls', dict(connected_load_kw=5., existing_hours_per_day=10., avoidable_hours_per_day=2.,
                              days_per_year=250, safe_to_switch_off=True, essential_service=False), 2500),
    ('shutdown', dict(connected_load_kw=2., existing_hours_per_day=12., avoidable_hours_per_day=4.,
                     days_per_year=250, safe_to_switch_off=True, essential_service=False), 2000),
    ('office', dict(device_count=20, active_watts=100., low_power_watts=5., existing_hours_per_day=12.,
                   avoidable_hours_per_day=8., days_per_year=250, safe_to_switch_off=True, essential_service=False), 3800),
    ('motor', dict(before_annual_kwh=5000., after_annual_kwh=4000., equivalent_service_confirmed=True), 1000),
    ('refrigeration', dict(before_annual_kwh=1500., after_annual_kwh=900., equivalent_service_confirmed=True), 600),
]


def measure(category, fields, **extra):
    common = {k: BASE[k] for k in ('id', 'load_id', 'evidence_kind', 'evidence_reference', 'rate',
                                   'installation_cost_usd', 'annual_incremental_cost_usd')}
    return Measure.model_validate(common | dict(category=category) | fields | extra)


@pytest.mark.parametrize('category,fields,kwh', CASES)
def test_confirmations_preserve_all_energy_financials_and_attribution(category, fields, kwh):
    extra = dict(annual_operating_cost_savings_usd=300.,
                 operating_cost_savings_reference='Fictional maintenance: 400 before minus 100 after')
    m = measure(category, fields, **extra)
    before = recommend_measure(m, TODAY)
    after = recommend_measure(m.model_copy(update=dict(operating_baseline_confirmed=True,
                                                       comparison_conditions_confirmed=True)), TODAY)
    assert before.annual_kwh_saved == after.annual_kwh_saved == kwh
    assert before.annual_energy_charge_savings_usd == after.annual_energy_charge_savings_usd == kwh * .2
    assert before.annual_operating_cost_savings_usd == after.annual_operating_cost_savings_usd == 300
    assert before.annual_net_savings_usd == after.annual_net_savings_usd == kwh * .2 + 300
    assert before.simple_payback_years == after.simple_payback_years == 2500 / (kwh * .2 + 300)
    assert before.annual_simple_roi_percent == after.annual_simple_roi_percent
    assert after.annual_simple_roi_percent == pytest.approx((kwh * .2 + 300) / 2500 * 100)
    assert before.priority_group == after.priority_group
    assert before.provenance == after.provenance
    assert not after.warnings
    assert after.inputs_used['operating_baseline_confirmed'] is True


def test_normal_office_and_large_warehouse_no_extreme_warning():
    office = recommend_measure(measure(*CASES[3][:2], operating_baseline_confirmed=True), TODAY)
    warehouse = recommend_measure(Measure.model_validate(BASE | dict(fixture_count=20000, old_watts=400., new_watts=150.)), TODAY)
    assert office.warnings == warehouse.warnings == []
    assert warehouse.annual_kwh_saved == 12500000


@pytest.mark.parametrize('category,field', [('led', 'old_watts'), ('led', 'new_watts'),
                                          ('office', 'active_watts'), ('office', 'low_power_watts'),
                                          ('shutdown', 'connected_load_kw'), ('lighting_controls', 'connected_load_kw')])
@pytest.mark.parametrize('value,trigger', [(999., False), (1000., True), (5000., True)])
def test_unit_review_boundary_and_scope(category, field, value, trigger):
    fields = next(f for c, f, k in CASES if c == category).copy()
    fields[field] = value
    if field in ('new_watts', 'low_power_watts'):
        fields['old_watts' if field == 'new_watts' else 'active_watts'] = value
    r = recommend_measure(measure(category, fields), TODAY)
    assert any(w.startswith(f'Plausibility: {field} ') for w in r.warnings) == trigger
    assert r.inputs_used[field] == value


def test_unit_confusion_does_not_correct_5000_kw_or_reject_industry():
    m = measure(*CASES[2][:2], connected_load_kw=5000., operating_baseline_confirmed=True)
    r = recommend_measure(m, TODAY)
    assert r.annual_kwh_saved == 5000000
    assert r.annual_net_savings_usd == 1000000
    assert r.simple_payback_years == .0025
    assert any('kilowatts, not watts' in w for w in r.warnings)
    assert all('Evidence limitation' not in w for w in r.warnings)


@pytest.mark.parametrize('confirmed', [None, False, True])
def test_existing_occupancy_controls_need_incremental_baseline(confirmed):
    m = measure(*CASES[1][:2], evidence_kind='measured', evidence_reference='Fictional inventory with existing controls',
                operating_baseline_confirmed=confirmed)
    r = recommend_measure(m, TODAY)
    assert bool(r.warnings) == (confirmed is not True)
    if r.warnings:
        assert 'existing occupancy controls' in r.warnings[0]
    assert r.annual_kwh_saved == 2500
    assert r.calculation_status == 'quantified'  # Legacy label is not independent verification.


@pytest.mark.parametrize('category,fields,kwh', CASES[4:])
def test_equivalent_service_alone_does_not_establish_comparison_evidence(category, fields, kwh):
    r = recommend_measure(measure(category, fields, evidence_kind='measured'), TODAY)
    assert r.annual_kwh_saved == kwh
    assert len(r.warnings) == 1
    assert 'comparable annual periods, runtime, capacity' in r.warnings[0]
    assert 'specification projections versus site measurements' in r.warnings[0]
    assert ('temperature requirements and ambient conditions' if category == 'refrigeration'
            else 'production output and operating load') in r.warnings[0]


def test_missing_unknowns_exclusions_and_unrelated_categories():
    m = measure(*CASES[2][:2], connected_load_kw=None, rate=None)
    r = recommend_measure(m, TODAY)
    assert r.annual_kwh_saved is r.annual_net_savings_usd is r.simple_payback_years is None
    assert 'connected_load_kw' in r.missing_information
    assert not recommend_measure(m.model_copy(update=dict(applicable=False)), TODAY).warnings
    empty = asyncio.run(build_recommendations(SavingsRequest(), Saved(), TODAY))
    assert all(not r.warnings for r in empty.recommendations)


def test_confirmations_never_bypass_existing_gates():
    r = recommend_measure(measure(*CASES[2][:2], safe_to_switch_off=False, operating_baseline_confirmed=True), TODAY)
    assert r.annual_kwh_saved is None
    r = recommend_measure(measure(*CASES[4][:2], equivalent_service_confirmed=False, comparison_conditions_confirmed=True), TODAY)
    assert r.annual_kwh_saved is None
    with pytest.raises(ValidationError):
        measure(*CASES[2][:2], avoidable_hours_per_day=13., operating_baseline_confirmed=True)
    with pytest.raises(ValidationError):
        measure(*CASES[2][:2], operating_baseline_confirmed='yes')


def test_warnings_do_not_change_recommendation_order():
    measures = [measure(*CASES[2][:2], id='a'), measure(*CASES[3][:2], id='b')]
    def build(items):
        return asyncio.run(build_recommendations(SavingsRequest(measures=items), Saved(), TODAY))
    before = build(measures)
    after = build([m.model_copy(update=dict(operating_baseline_confirmed=True)) for m in measures])
    assert [r.id for r in before.recommendations] == [r.id for r in after.recommendations]
    assert any('a: Evidence limitation' in w for w in before.warnings)


def test_api_legacy_additive_warnings_and_determinism(monkeypatch):
    monkeypatch.setattr('backend.savings.routes.service', Saved())
    client = TestClient(app)
    normal = client.post('/api/savings/recommendations', json=dict(measures=[BASE]))
    assert normal.status_code == 200
    assert normal.json()['recommendations'][0]['warnings'] == []
    payload = dict(measures=[BASE | dict(old_watts=5000.)])
    response = client.post('/api/savings/recommendations', json=payload)
    assert response.status_code == 200
    assert response.json() == client.post('/api/savings/recommendations', json=payload).json()
    r = response.json()['recommendations'][0]
    assert r['annual_kwh_saved'] == 1247500
    assert r['inputs_used']['old_watts'] == 5000
    assert any('test: Plausibility' in w for w in response.json()['warnings'])


def test_mocked_advisor_preserves_warning_and_financial_result(monkeypatch):
    from backend.ai import savings as advisor
    monkeypatch.setattr(advisor, 'generate', lambda *a, **k: (advisor.CategorySelection(categories=['led']), 'meta'))
    async def fixed(request, service):
        return await build_recommendations(request, Saved(), TODAY)
    monkeypatch.setattr(advisor, 'build_recommendations', fixed)
    result = asyncio.run(advisor.savings_conversation(advisor.SavingsConversationRequest.model_validate(dict(
        request='Fictional equipment review', evidence=dict(measures=[BASE | dict(old_watts=5000.)])))))
    r = next(r for r in result.savings.recommendations if r.id == 'test')
    assert r.warnings and any('test: Plausibility' in w for w in result.savings.warnings)
    assert r.annual_kwh_saved == 1247500
    assert any('1247500.0 kWh/year' in f for f in result.facts)
