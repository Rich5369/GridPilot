"""Startup discovery uses a local transport, never live credentials or network."""
import logging
from unittest.mock import MagicMock

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.delenv('MODEL_API_LIST_MODELS_ON_STARTUP', raising=False)
    monkeypatch.setenv('MODEL_API_KEY', 'test-secret-key')
    monkeypatch.setenv('MODEL_API_BASE_URL', 'https://meta.example/v1')


@pytest.mark.parametrize('flag', [None, '0', 'true'])
def test_disabled(monkeypatch, caplog, flag):
    if flag is not None:
        monkeypatch.setenv('MODEL_API_LIST_MODELS_ON_STARTUP', flag)
    factory = MagicMock(side_effect=AssertionError('must not construct a client'))
    monkeypatch.setattr(openai, 'AsyncOpenAI', factory)
    with TestClient(app) as client:
        assert client.get('/api/health').status_code == 200
    factory.assert_not_called()
    assert 'Meta startup' not in caplog.text


def install_transport(monkeypatch, handler):
    original = openai.AsyncOpenAI
    def factory(**options):
        assert options == dict(api_key='test-secret-key',
                              base_url='https://meta.example/v1', timeout=5.0, max_retries=0)
        return original(**options, http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(openai, 'AsyncOpenAI', factory)
    monkeypatch.setenv('MODEL_API_LIST_MODELS_ON_STARTUP', '1')


@pytest.mark.parametrize('available', [True, False])
def test_enabled(monkeypatch, caplog, available):
    calls = []
    def handle(request):
        calls.append(request)
        assert request.method == 'GET'
        assert str(request.url) == 'https://meta.example/v1/models'
        assert request.headers['authorization'] == 'Bearer test-secret-key'
        # SDK debug logs must not expose credentials, even if explicitly enabled.
        logging.getLogger('openai._base_client').critical('test-secret-key Authorization private-body')
        ids = ['other-model', 'unsafe model', 'test-secret-key']
        if available:
            ids.append('muse-spark-1.3')
        return httpx.Response(200, json={'object': 'list', 'data': [
            {'id': value, 'object': 'model', 'created': 1, 'owned_by': 'private-body'} for value in ids]})
    install_transport(monkeypatch, handle)
    previous = logging.root.manager.disable
    with TestClient(app) as client:
        assert client.get('/api/health').status_code == 200
    assert len(calls) == 1
    assert logging.root.manager.disable == previous
    record = next(r for r in caplog.records if 'Meta startup' in r.message)
    assert record.args['muse-spark-1.3_available'] is available
    assert record.args['model_ids'] == (['muse-spark-1.3', 'other-model'] if available else ['other-model'])
    for secret in ['test-secret-key', 'Authorization', 'private-body', 'unsafe model']:
        assert secret not in caplog.text


@pytest.mark.parametrize('failure', ['http', 'connection', 'configuration', 'timeout'])
def test_failure_keeps_startup_healthy(monkeypatch, caplog, failure):
    def handle(request):
        if failure == 'connection':
            raise httpx.ConnectError('private-body test-secret-key', request=request)
        return httpx.Response(404, headers={'x-request-id': 'req-safe'}, json={
            'error': {'code': 'model_not_found', 'message': 'private-body test-secret-key',
                      'type': 'test-secret-key', 'param': 'Authorization private-body'}})
    install_transport(monkeypatch, handle)
    if failure == 'configuration':
        monkeypatch.delenv('MODEL_API_KEY')
    if failure == 'timeout':
        import asyncio
        async def timeout(awaitable, timeout):
            awaitable.close()
            raise asyncio.TimeoutError('private-body test-secret-key')
        monkeypatch.setattr('backend.ai.startup_diagnostic.asyncio.wait_for', timeout)
    previous = logging.root.manager.disable
    with TestClient(app) as client:
        assert client.get('/api/health').status_code == 200
    assert logging.root.manager.disable == previous
    record = next(r for r in caplog.records if 'Meta startup' in r.message)
    assert record.exc_info is None
    if failure == 'http':
        assert record.args['upstream_status'] == 404
        assert record.args['provider_code'] == 'model_not_found'
        assert record.args['request_id'] == 'req-safe'
    for secret in ['test-secret-key', 'Authorization', 'private-body']:
        assert secret not in caplog.text
