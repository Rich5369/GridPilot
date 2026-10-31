"""Real SDK serialization and savings HTTP path, with an offline provider transport."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.ai import savings, service
from backend.main import app
from backend.savings.service import build_recommendations
from backend.tests.test_completion_budget import WAREHOUSE
from backend.tests.test_savings import BASE, Saved, TODAY


@pytest.fixture
def provider(monkeypatch):
    calls = []
    reply = {'content': {'categories': ['led', 'scheduling', 'refrigeration', 'motor']},
             'finish_reason': 'stop', 'status': 200, 'tokens': 600, 'reasoning': 200}

    def transport(request):
        calls.append(json.loads(request.content))
        if reply['status'] != 200:
            return httpx.Response(reply['status'], json={'error': {'message': 'fixture failure'}})
        content = reply['content']
        return httpx.Response(200, headers={'x-request-id': 'fixture-savings-request'}, json={
            'id': 'fixture-completion', 'created': 0, 'object': 'chat.completion',
            'model': 'muse-spark-1.3',
            'choices': [{'index': 0, 'finish_reason': reply['finish_reason'],
                         'message': {'role': 'assistant', 'content':
                                     json.dumps(content) if content is not None else None}}],
            'usage': {'prompt_tokens': 1000, 'completion_tokens': reply['tokens'],
                      'total_tokens': 1000 + reply['tokens'],
                      'completion_tokens_details': {'reasoning_tokens': reply['reasoning']}}})

    async def fixed(request, retail):
        return await build_recommendations(request, retail, TODAY)

    monkeypatch.setattr(savings, 'service', Saved())
    monkeypatch.setattr(savings, 'build_recommendations', fixed)
    monkeypatch.setenv('MODEL_API_MODE', 'live')
    monkeypatch.setenv('MODEL_API_KEY', 'offline-fixture-only')
    monkeypatch.setattr(service, 'provider_model', lambda: 'muse-spark-1.3')
    with httpx.Client(transport=httpx.MockTransport(transport)) as http:
        monkeypatch.setattr(service, 'provider_client_options', lambda: dict(
            api_key='offline-fixture-only', base_url='https://fixture.invalid/v1',
            http_client=http, max_retries=0))
        yield calls, reply


def ask():
    return TestClient(app).post('/api/ai/savings/conversation', json={
        'request': WAREHOUSE,
        'evidence': {'profile': {'business_type': 'warehouse'}, 'measures': [BASE]},
        'category_applicability': {'refrigeration': False}})


def assert_finances(result):
    led = next(r for r in result['savings']['recommendations'] if r['id'] == BASE['id'])
    assert led['annual_kwh_saved'] == 12500
    assert led['annual_energy_charge_savings_usd'] == led['annual_net_savings_usd'] == 2500
    assert led['upfront_cost_usd'] == 2500
    assert led['simple_payback_years'] == 1
    assert 'refrigeration' not in result['selected_categories']
    assert result['savings']['portfolio_savings_usd'] is None


def test_category_selection_sdk_settings_and_grounded_meta_path(provider):
    response = ask()
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'meta'  # Real adapter path; injected response, not live acceptance.
    assert_finances(result)
    motor = next(r for r in result['savings']['recommendations'] if r['category'] == 'motor')
    assert motor['applicability'] == 'possible'
    assert motor['annual_kwh_saved'] is motor['annual_net_savings_usd'] is None
    assert any('first confirm equipment applicability' in q for q in result['follow_up_questions'])
    assert len(provider[0]) == 1
    call = provider[0][0]
    assert call['reasoning_effort'] == 'low'
    assert call['max_completion_tokens'] == 1500
    assert call['model'] == 'muse-spark-1.3'
    schema = call['response_format']['json_schema']
    assert schema['name'] == 'CategorySelection'
    assert schema['schema']['additionalProperties'] is False


@pytest.mark.parametrize('content', [None, {'categories': ['led']}])
def test_exhaustion_rejected_even_with_valid_json(provider, caplog, content):
    provider[1].update(content=content, finish_reason='length', tokens=1500, reasoning=1498)
    response = ask()
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'deterministic_fallback'
    assert_finances(result)
    assert len(provider[0]) == 1
    record = next(r.args for r in caplog.records if r.msg == 'Meta completion rejected %s')
    assert record['category'] == 'truncated'
    assert record['schema'] == 'CategorySelection'
    assert record['completion_token_limit'] == record['completion_tokens'] == 1500
    assert record['reasoning_tokens'] == 1498
    assert record['reasoning_effort'] == 'low'
    assert record['content_present'] == (content is not None)
    assert record['provider_request_id'] == 'fixture-savings-request'
    assert record['response_status'] == 502
    assert WAREHOUSE not in caplog.text


@pytest.mark.parametrize('content', [
    {'categories': ['led'], 'annual_net_savings_usd': 999999},
    {'categories': ['invented_category']},
    {'categories': 'led'},
    None,
])
def test_invalid_provider_output_never_counts_as_meta(provider, content):
    provider[1]['content'] = content
    response = ask()
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'deterministic_fallback'
    assert_finances(result)
    assert len(provider[0]) == 1


@pytest.mark.parametrize('status', [401, 429, 500])
def test_upstream_failure_never_counts_as_meta(provider, status):
    provider[1]['status'] = status
    response = ask()
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'deterministic_fallback'
    assert_finances(result)
    assert len(provider[0]) == 1


def test_original_acceptance_warehouse_with_injected_meta(provider):
    from pathlib import Path
    payload = json.loads((Path(__file__).with_name('fixtures') /
                          'savings_warehouse_acceptance.json').read_text())
    provider[1]['content'] = {'categories': ['led', 'scheduling', 'refrigeration', 'compressed_air', 'motor']}
    response = TestClient(app).post('/api/ai/savings/conversation', json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'meta'
    assert not {'scheduling', 'refrigeration', 'compressed_air'} & set(result['selected_categories'])
    measures = {r['id']: r for r in result['savings']['recommendations']}
    assert measures['pilot-lighting']['annual_kwh_saved'] == 2000
    assert measures['main-lighting']['annual_kwh_saved'] is None
    for r in measures.values():
        assert r['annual_energy_charge_savings_usd'] is None
        assert r['annual_net_savings_usd'] is None
        assert r['simple_payback_years'] is None
    assert result['follow_up_questions']
    assert len(provider[0]) == 1
