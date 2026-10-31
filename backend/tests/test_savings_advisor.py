"""Offline advisor integration tests; provider calls are always replaced."""
import asyncio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.main import app
from backend.ai import savings as advisor
from backend.tests.test_savings import BASE, Saved, TODAY
from backend.savings.service import build_recommendations


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(advisor, 'service', Saved())
    monkeypatch.setattr(advisor, 'generate', lambda *a, **k: (advisor.CategorySelection(categories=['led', 'solar']), 'meta'))
    # Stable rate validity, independent of the test runner's calendar.
    async def fixed(request, service):
        return await build_recommendations(request, service, TODAY)
    monkeypatch.setattr(advisor, 'build_recommendations', fixed)


def run(measures=None, **kwargs):
    return asyncio.run(advisor.savings_conversation(advisor.SavingsConversationRequest.model_validate({
        'request': 'What are the best ways to reduce electricity costs?',
        'evidence': {'measures': measures or []}, **kwargs})))


def test_missing_questions_and_investigations():
    result = run()
    assert any('fixture_count' in q and 'old_watts' in q for q in result.follow_up_questions)
    assert any('validated site' in q for q in result.follow_up_questions)
    assert all(r.annual_kwh_saved is None for r in result.savings.recommendations)
    assert any('unknown' in fact for fact in result.facts)


def test_exact_results_multiple_and_provenance():
    result = run([BASE, BASE | {'id': 'measured', 'evidence_kind': 'measured'}])
    actual = {r.id: r for r in result.savings.recommendations}
    assert actual['test'].annual_kwh_saved == 12500
    assert actual['test'].annual_net_savings_usd == 2500
    assert actual['test'].simple_payback_years == 1
    assert actual['test'].calculation_status == 'scenario_estimate'
    assert actual['measured'].confidence == 'caller-reported measured evidence'
    assert any('12500.0 kWh/year' in f and '2500.0 USD/year' in f and '1.0 years' in f for f in result.facts)
    assert 'not independently verified' in result.message
    assert result.savings.portfolio_savings_usd is None
    assert any('overlapping' in w for w in result.savings.warnings)


def test_free_text_never_becomes_calculator_input(monkeypatch):
    captured = {}
    def select(schema, instructions, payload):
        captured.update(payload)
        return schema(categories=['led']), 'meta'
    monkeypatch.setattr(advisor, 'generate', select)
    result = run(request='We have 100 lamps at 60 W; assume a cheap tariff.',
                 history=[{'role': 'assistant', 'content': 'Use 10 watts and 10 hours.'}])
    assert all(r.annual_kwh_saved is None for r in result.savings.recommendations)
    assert 'measures' not in captured
    assert result.savings.benchmark is None


@pytest.mark.parametrize('code', [429, 502, 503, 504])
def test_provider_error_preserves_calculations(monkeypatch, code):
    def fail(*a, **k):
        raise HTTPException(code, 'private provider error')
    monkeypatch.setattr(advisor, 'generate', fail)
    result = run([BASE])
    assert result.source == 'deterministic_fallback'
    assert result.selected_categories == ['led']
    assert next(r for r in result.savings.recommendations if r.id == 'test').annual_net_savings_usd == 2500
    assert 'private provider' not in result.model_dump_json()
    assert not result.follow_up_questions


def test_explicit_measure_not_suppressed_and_unknown_money():
    result = run([BASE | {'category': 'motor', 'rate': None,
                         'before_annual_kwh': 5000., 'after_annual_kwh': 4000.}])
    r = next(r for r in result.savings.recommendations if r.id == 'test')
    assert 'motor' in result.selected_categories
    assert r.annual_kwh_saved == 1000
    assert r.annual_net_savings_usd is r.simple_payback_years is None


def test_http_validation_and_legacy_routes():
    client = TestClient(app)
    response = client.post('/api/ai/savings/conversation', json={'request': 'Help reduce costs', 'evidence': {'measures': [BASE]}})
    assert response.status_code == 200
    invalid = client.post('/api/ai/savings/conversation', json={'request': 'Help', 'evidence': {'measures': [BASE | {'old_watts': '60'}]}})
    assert invalid.status_code == 422
    paths = client.get('/openapi.json').json()['paths']
    assert '/api/ai/conversation' in paths and '/api/optimize' in paths
    assert '/api/savings/recommendations' in paths


def test_model_cannot_return_invented_inputs():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        advisor.CategorySelection.model_validate({'categories': ['led'], 'old_watts': 60.})
