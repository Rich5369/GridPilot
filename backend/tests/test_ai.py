import json
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
import httpx
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
SAMPLE = json.loads((Path(__file__).resolve().parents[2] / 'sample_data/scenario.demo.json').read_text())

@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.delenv('RENDER', raising=False)
    monkeypatch.setenv('MODEL_API_MODE', 'live')
    monkeypatch.delenv('MODEL_API_KEY', raising=False)

@pytest.fixture
def provider(monkeypatch):
    import openai
    monkeypatch.setenv('MODEL_API_KEY', 'unit-test-placeholder')
    create = MagicMock()
    sdk = MagicMock()
    sdk.__enter__.return_value.chat.completions.create = create
    monkeypatch.setattr(openai, 'OpenAI', MagicMock(return_value=sdk))
    def respond(data):
        create.return_value = SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop', message=SimpleNamespace(content=json.dumps(data), refusal=None))])
    respond({'status': 'proposed', 'message': 'Set demand limit.', 'changes': {'building_max_demand_kw': 15.0}})
    return create, respond

def interpret(scenario=None):
    return client.post('/api/ai/interpret', json={'request': 'Keep peak power demand below 15 kW.', 'scenario': scenario or SAMPLE})

def test_missing_key_keeps_optimizer_available():
    assert interpret().status_code == 503
    assert client.post('/api/ai/explain', json={'scenario': SAMPLE}).status_code == 503
    assert client.get('/api/health').status_code == 200
    assert client.post('/api/optimize', json=SAMPLE).status_code == 200

def test_valid_proposal_preserves_requirements(provider):
    original = deepcopy(SAMPLE)
    response = interpret()
    assert response.status_code == 200
    data = response.json()
    assert data['source'] == 'meta'
    expected = deepcopy(SAMPLE)
    expected['building_max_demand_kw'] = 15
    assert data['proposed_scenario'] == expected
    assert SAMPLE == original
    call = provider[0].call_args.kwargs
    assert call['model'] == 'muse-spark-1.3'
    assert call['response_format']['type'] == 'json_schema'
    assert client.post('/api/optimize', json=expected).status_code == 200

@pytest.mark.parametrize('status', ['clarification', 'unsupported'])
def test_non_actionable(provider, status):
    provider[1]({'status': status, 'message': 'Please clarify.', 'changes': {}})
    assert interpret().json()['proposed_scenario'] is None

@pytest.mark.parametrize('changes', [{'building_max_demand_kw': -1}, {'energy_required_kwh': 0}, {'all_ev_deadline_hour': 1}, {'all_ev_deadline_hour': '17'}])
def test_invalid_generated_values(provider, changes):
    provider[1]({'status': 'proposed', 'message': 'Change.', 'changes': changes})
    assert interpret().status_code in (422, 502)

@pytest.mark.parametrize('changes', [{'all_ev_deadline_hour': 17}, {'peak_price_increase_percent': 25.0}])
def test_extraction(provider, changes):
    provider[1]({'status': 'proposed', 'message': 'Change.', 'changes': changes})
    scenario = deepcopy(SAMPLE)
    scenario['electricity_prices_usd_per_kwh'] = [0.1] * 12 + [0.3] * 12
    response = interpret(scenario)
    assert response.status_code == 200
    data = response.json()['proposed_scenario']
    if 'all_ev_deadline_hour' in changes:
        assert all(ev['deadline_hour'] == 17 for ev in data['ev_requirements'])
    else:
        peak = max(scenario['electricity_prices_usd_per_kwh'])
        assert max(data['electricity_prices_usd_per_kwh']) == pytest.approx(peak * 1.25)

@pytest.mark.parametrize('infeasible', [False, True])
def test_explanations_use_real_solver(provider, infeasible):
    provider[1]({'points': ['cost', 'peak', 'method']})
    scenario = deepcopy(SAMPLE)
    if infeasible:
        scenario['building_max_demand_kw'] = 0.1
    result = client.post('/api/optimize', json=scenario).json()
    response = client.post('/api/ai/explain', json={'scenario': scenario})
    assert response.status_code == 200
    text = ' '.join(response.json()['explanation'])
    assert result['feasibility_status'] in text
    assert f"{result['baseline_electricity_cost_usd']:.4f}" in text
    assert 'monthly' in response.json()['limitations']
    if infeasible:
        assert all(reason in text for reason in result['constraint_violations'])
        assert 'Optimized:' not in text

@pytest.mark.parametrize('kind,status', [('timeout',504), ('rate',429), ('provider',502)])
def test_provider_errors(provider, kind, status):
    import openai
    req = httpx.Request('POST', 'https://api.meta.ai/v1/chat/completions')
    if kind == 'timeout':
        exc = openai.APITimeoutError(request=req)
    else:
        response = httpx.Response(429 if kind == 'rate' else 500, request=req)
        exc = (openai.RateLimitError if kind == 'rate' else openai.InternalServerError)('secret upstream body', response=response, body=None)
    provider[0].side_effect = exc
    response = interpret()
    assert response.status_code == status
    assert 'secret' not in response.text

@pytest.mark.parametrize('content', ['not json', '{}'])
def test_malformed(provider, content):
    provider[0].return_value.choices[0].message.content = content
    assert interpret().status_code == 502

def test_mock_explicit(monkeypatch):
    monkeypatch.setenv('MODEL_API_MODE', 'mock')
    assert interpret().json()['source'] == 'mock'
    assert client.post('/api/ai/explain', json={'scenario': SAMPLE}).json()['source'] == 'mock'


def test_default_mode_without_credentials(monkeypatch):
    monkeypatch.delenv('MODEL_API_MODE', raising=False)
    response = interpret()
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'ai_unavailable'
    assert 'source' not in response.json()


def test_render_rejects_mock_mode(monkeypatch):
    monkeypatch.setenv('MODEL_API_MODE', 'mock')
    monkeypatch.setenv('RENDER', 'true')
    for endpoint, body in [('/api/ai/interpret', {'request': 'Keep peak power demand below 15 kW.', 'scenario': SAMPLE}), ('/api/ai/explain', {'scenario': SAMPLE})]:
        response = client.post(endpoint, json=body)
        assert response.status_code == 503
        assert response.json()['detail']['code'] == 'ai_configuration'
        assert 'source' not in response.json()
    assert client.post('/api/optimize', json=SAMPLE).status_code == 200


@pytest.mark.parametrize('status,exception_name,code', [
    (400, 'BadRequestError', 'invalid_json_schema'),
    (401, 'AuthenticationError', 'invalid_api_key'),
    (402, 'APIStatusError', 'billing_not_configured'),
    (403, 'PermissionDeniedError', 'permission_denied'),
    (429, 'RateLimitError', 'rate_limit_exceeded'),
    (500, 'InternalServerError', 'backend_unavailable'),
])
def test_provider_diagnostics_are_sanitized(provider, caplog, status, exception_name, code):
    import openai
    request = httpx.Request('POST', 'https://api.meta.ai/v1/chat/completions',
                            headers={'Authorization': 'Bearer unit-test-placeholder'})
    response = httpx.Response(status, request=request, headers={'x-request-id': 'req-test-123'})
    body = {'code': code, 'type': 'invalid_request_error', 'param': 'response_format',
            'message': 'sensitive prompt and response body unit-test-placeholder'}
    provider[0].side_effect = getattr(openai, exception_name)(body['message'], response=response, body=body)
    result = interpret()
    assert result.status_code == (429 if status == 429 else 502)
    assert result.json()['detail']['code'] == ('ai_rate_limited' if status == 429 else 'ai_provider_error')
    record = next(record for record in caplog.records if record.name == 'backend.ai.service')
    metadata = record.args
    assert metadata['upstream_status'] == status
    assert metadata['exception_type'] == exception_name
    assert metadata['provider_code'] == code
    assert metadata['request_id'] == 'req-test-123'
    assert metadata['provider_param'] == 'response_format'
    assert record.exc_info is None
    for secret in ('unit-test-placeholder', 'sensitive prompt', 'Authorization', 'Keep peak power demand'):
        assert secret not in caplog.text
        assert secret not in result.text


def test_provider_metadata_rejects_unsafe_fields(monkeypatch):
    from backend.ai.service import provider_error_metadata
    monkeypatch.setenv('MODEL_API_KEY', 'private-key')
    exc = SimpleNamespace(status_code=400, code='private-key', request_id='req\nforged',
                          body={'error': {'type': 'LLM_secret', 'param': {'body': 'secret'}}})
    data = provider_error_metadata(exc)
    assert data['provider_code'] is None
    assert data['request_id'] is None
    assert data['provider_type'] is None
    assert data['provider_param'] is None


@pytest.mark.parametrize('exception_name,status,code', [
    ('APITimeoutError', 504, 'ai_timeout'),
    ('APIConnectionError', 502, 'ai_provider_error'),
])
def test_transport_diagnostics_without_http_response(provider, caplog, exception_name, status, code):
    import openai
    request = httpx.Request('POST', 'https://api.meta.ai/v1/chat/completions',
                            headers={'Authorization': 'Bearer unit-test-placeholder'})
    provider[0].side_effect = getattr(openai, exception_name)(request=request)
    result = interpret()
    assert result.status_code == status
    assert result.json()['detail']['code'] == code
    record = next(record for record in caplog.records if record.name == 'backend.ai.service')
    assert record.args['exception_type'] == exception_name
    assert record.args['upstream_status'] is None
    assert record.args['request_id'] is None
    assert record.exc_info is None
    assert 'unit-test-placeholder' not in caplog.text
    assert 'Authorization' not in caplog.text
