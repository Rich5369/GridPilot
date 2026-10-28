"""Network-free diagnostic regression tests."""
import asyncio
import json
import logging

import httpx
import pytest

from backend.ai import startup_diagnostic as diagnostic
from backend.main import app


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.delenv('MODEL_API_DIAGNOSTIC_ON_STARTUP', raising=False)
    monkeypatch.setenv('MODEL_API_KEY', 'test-secret-key')
    monkeypatch.setenv('MODEL_API_BASE_URL', 'https://meta.example/v1')
    monkeypatch.setenv('MODEL_API_MODEL', 'muse-spark-1.3')


def install(monkeypatch, handler):
    original = httpx.AsyncClient
    def factory(**kwargs):
        assert kwargs['timeout'] == 25.0
        return original(**kwargs, transport=httpx.MockTransport(handler))
    monkeypatch.setattr(diagnostic, 'diagnostic_transport', factory)


@pytest.mark.parametrize('flag', [None, '0', 'true', 'yes'])
def test_disabled(monkeypatch, flag):
    if flag is not None:
        monkeypatch.setenv('MODEL_API_DIAGNOSTIC_ON_STARTUP', flag)
    async def forbidden(*args):
        raise AssertionError('network')
    monkeypatch.setattr(diagnostic, 'probe', forbidden)
    asyncio.run(diagnostic.list_models_on_startup())


def test_three_independent_requests(monkeypatch, caplog):
    calls = []
    def handler(request):
        calls.append(request)
        logging.getLogger('openai._base_client').critical('test-secret-key private-body')
        if request.url.path.endswith('status'):
            assert 'authorization' not in request.headers
            return httpx.Response(503)
        assert request.headers['authorization'] == 'Bearer test-secret-key'
        if request.method == 'POST':
            assert json.loads(request.content)['model'] == 'muse-spark-1.3'
        return httpx.Response(404, headers={'x-request-id': 'req-safe'}, json={
            'error': {'code': 'model_not_found', 'message': 'private-body'}})
    install(monkeypatch, handler)
    monkeypatch.setenv('MODEL_API_DIAGNOSTIC_ON_STARTUP', '1')
    asyncio.run(diagnostic.list_models_on_startup())
    assert [r.url.path for r in calls] == ['/v1/status', '/v1/models', '/v1/chat/completions']
    results = [r.args for r in caplog.records if r.msg == 'Meta diagnostic %s']
    assert len(results) == 3
    assert results[1]['provider_code'] == 'model_not_found'
    assert results[1]['request_id'] == 'req-safe'
    assert all(r['elapsed_seconds'] >= 0 for r in results)
    assert 'test-secret-key' not in caplog.text
    assert 'private-body' not in caplog.text
    assert 'authorization' not in caplog.text.lower()
    assert 'Reply with the word ready.' not in caplog.text


@pytest.mark.parametrize('operation,origin', [('status', 'http_transport'), ('models', 'openai_sdk')])
def test_transport_timeout(monkeypatch, operation, origin):
    async def handler(request):
        await request.extensions['trace']('connection.start_tls.started', {'secret': 'ignored'})
        raise httpx.ConnectTimeout('private-body')
    install(monkeypatch, handler)
    result = asyncio.run(diagnostic.probe(operation))
    assert result['timeout_origin'] == origin
    assert result['phase'] == 'tls'
    assert result['upstream_status'] is None
    assert 'ConnectTimeout' in result['cause_types']


def test_outer_deadline(monkeypatch):
    async def handler(request):
        await asyncio.Event().wait()
    install(monkeypatch, handler)
    monkeypatch.setattr(diagnostic, 'DEADLINE_SECONDS', .01)
    result = asyncio.run(diagnostic.probe('models'))
    assert result['timeout_origin'] == 'asyncio_deadline'
    assert result['exception_type'] == 'TimeoutError'


def test_startup_does_not_wait_and_shutdown_cancels(monkeypatch):
    started, cancelled = [], []
    async def slow():
        started.append(True)
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(True)
    monkeypatch.setattr(diagnostic, 'list_models_on_startup', slow)
    async def run():
        async with app.router.lifespan_context(app):
            await asyncio.sleep(0)
            assert started
    asyncio.run(asyncio.wait_for(run(), timeout=1))
    assert cancelled


def test_success(monkeypatch):
    def handler(request):
        return httpx.Response(200, headers={'x-request-id': 'req-ok'}, json={'data': []})
    install(monkeypatch, handler)
    for operation in ('status', 'models', 'inference'):
        result = asyncio.run(diagnostic.probe(operation))
        assert result['ok']
        assert result['upstream_status'] == 200
        assert result['request_id'] == 'req-ok'


def test_missing_credentials_does_not_send_authenticated_request(monkeypatch):
    monkeypatch.delenv('MODEL_API_KEY')
    result = asyncio.run(diagnostic.probe('models'))
    assert result['exception_type'] == 'KeyError'
    assert result['phase'] == 'configuration'
