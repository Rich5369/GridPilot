"""Fictional financial boundary cases; no provider or external-data calls."""
from decimal import Decimal
import math
import sys

from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.savings import routes
from backend.savings.models import Measure
from backend.savings.service import build_recommendations, recommend_measure
from backend.tests.test_operating_cost_savings import ACCEPTANCE
from backend.tests.test_savings import TODAY
from backend.tests.test_savings_plausibility import CASES

FLOAT_BOUNDARY_COST = float(Decimal(270000) / Decimal(str(sys.float_info.max)))


@pytest.mark.parametrize('cost', [1e-310, math.ulp(0.)])
def test_tiny_cost_api_returns_null_roi_with_warning(monkeypatch, cost):
    async def fixed_date(request, service):
        return await build_recommendations(request, service, TODAY)
    monkeypatch.setattr(routes, 'build_recommendations', fixed_date)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post('/api/savings/recommendations', json={
        'measures': [ACCEPTANCE | {'installation_cost_usd': cost}]})
    assert response.status_code == 200, response.text
    body = response.json()
    item = next(r for r in body['recommendations'] if r['id'] == ACCEPTANCE['id'])
    assert item['annual_simple_roi_percent'] is None
    assert any('annual_simple_roi_percent' in w and 'finite' in w for w in item['warnings'])
    assert any('annual_simple_roi_percent' in w for w in body['warnings'])
    assert (item['annual_kwh_saved'], item['annual_energy_charge_savings_usd'],
            item['annual_operating_cost_savings_usd'], item['annual_net_savings_usd']) == (12500, 2500, 300, 2700)
    assert item['simple_payback_years'] == float(Decimal(str(cost)) / Decimal(2700))
    assert 'Infinity' not in response.text and 'NaN' not in response.text


def test_decimal_ratio_is_finite_but_float_conversion_overflows():
    # This establishes the conversion boundary independently of the calculator.
    ratio = Decimal(2700) / Decimal('1e-310') * 100
    assert ratio == Decimal('2.7e315') and ratio.is_finite()
    assert math.isinf(float(ratio))


def test_adjacent_costs_straddle_float_roi_range():
    below = math.nextafter(FLOAT_BOUNDARY_COST, 0.)
    above = math.nextafter(FLOAT_BOUNDARY_COST, math.inf)
    assert math.isinf(float(Decimal(270000) / Decimal(str(below))))
    assert math.isfinite(float(Decimal(270000) / Decimal(str(above))))


@pytest.mark.parametrize('cost', [None, 0., 2700., 1e12, 1e-310, math.ulp(0.),
                                  2e-303, 1e-303,
                                  math.nextafter(FLOAT_BOUNDARY_COST, 0.),
                                  math.nextafter(FLOAT_BOUNDARY_COST, math.inf)])
@pytest.mark.parametrize('expense,net', [(100., Decimal(2700)),
                                       (2800., Decimal(0)), (2900., Decimal(-100))])
def test_roi_range_preserves_other_financial_results(cost, expense, net):
    m = Measure.model_validate(ACCEPTANCE | dict(installation_cost_usd=cost,
                                               annual_incremental_cost_usd=expense))
    result = recommend_measure(m, TODAY)
    expected_roi = None if cost is None or cost == 0 else float(net / Decimal(str(cost)) * 100)
    overflow = expected_roi is not None and not math.isfinite(expected_roi)
    assert result.annual_simple_roi_percent == (None if overflow else expected_roi)
    assert any('annual_simple_roi_percent' in w for w in result.warnings) == overflow
    assert result.annual_kwh_saved == 12500
    assert result.annual_energy_charge_savings_usd == 2500
    assert result.annual_operating_cost_savings_usd == 300
    assert result.annual_net_savings_usd == float(net)
    expected_payback = float(Decimal(str(cost)) / net) if cost is not None and net > 0 else None
    assert result.simple_payback_years == expected_payback


def test_missing_expense_does_not_turn_unknown_roi_into_overflow_warning():
    result = recommend_measure(Measure.model_validate(ACCEPTANCE | dict(
        installation_cost_usd=1e-310, annual_incremental_cost_usd=None)), TODAY)
    assert result.annual_net_savings_usd is result.simple_payback_years is result.annual_simple_roi_percent is None
    assert not any('annual_simple_roi_percent' in w for w in result.warnings)


@pytest.mark.parametrize('category,fields,kwh', CASES)
def test_all_six_equations_and_non_roi_fields_unchanged(category, fields, kwh):
    cost = Decimal('1e-310')
    gross = Decimal(kwh) * Decimal('.20')
    net = gross + 300 - 100
    m = Measure.model_validate(ACCEPTANCE | fields | dict(category=category,
        installation_cost_usd=float(cost), operating_baseline_confirmed=True,
        comparison_conditions_confirmed=True))
    result = recommend_measure(m, TODAY)
    assert (result.annual_kwh_saved, result.annual_energy_charge_savings_usd,
            result.annual_operating_cost_savings_usd, result.annual_net_savings_usd,
            result.simple_payback_years) == (kwh, float(gross), 300, float(net), float(cost/net))
    assert result.annual_simple_roi_percent is None
    assert any('annual_simple_roi_percent' in w for w in result.warnings)


@pytest.mark.parametrize('benefit', [None, 0.])
def test_omitted_and_zero_recurring_benefit_remain_distinct(benefit):
    result = recommend_measure(Measure.model_validate(ACCEPTANCE | dict(
        installation_cost_usd=1e-310, annual_operating_cost_savings_usd=benefit)), TODAY)
    assert result.annual_operating_cost_savings_usd == benefit
    assert result.annual_net_savings_usd == 2400
    assert result.annual_simple_roi_percent is None
