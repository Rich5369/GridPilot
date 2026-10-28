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


@pytest.mark.parametrize('present', [True, False])
def test_accessible_model_ids_are_sanitized(monkeypatch, caplog, present):
    ids = ['other-model', 'test-secret-key', 'sk-private-token', 'LLM_private',
           'Bearer token', 'user prompt contents', 'x' * 129]
    if present:
        ids.append('muse-spark-1.3')
    def handler(request):
        assert request.url.path == '/v1/models'
        assert request.headers['authorization'] == 'Bearer test-secret-key'
        return httpx.Response(200, json={'data': [
            {'id': identifier, 'object': 'model', 'created': 1, 'owned_by': 'sensitive-response'}
            for identifier in ids]})
    install(monkeypatch, handler)
    monkeypatch.setenv('MODEL_API_DIAGNOSTIC_ON_STARTUP', '1')
    # Use the enabled entry point so SDK/transport suppression is exercised too.
    async def run():
        original = diagnostic.probe
        async def models_only(operation):
            if operation == 'models':
                return await original(operation)
        monkeypatch.setattr(diagnostic, 'probe', models_only)
        await diagnostic.list_models_on_startup()
    asyncio.run(run())
    record = next(r.args for r in caplog.records if r.msg == 'Meta diagnostic %s')
    assert record['model_ids'] == (['muse-spark-1.3', 'other-model'] if present else ['other-model'])
    assert record['models_complete'] is True
    assert record['target_model_present'] is present
    for value in ids[1:]:
        if value != 'muse-spark-1.3':
            assert value not in caplog.text
    assert 'sensitive-response' not in caplog.text


def test_bounded_model_listing_does_not_claim_absence(monkeypatch):
    from types import SimpleNamespace
    class Page:
        data = [SimpleNamespace(id='other-model')]
        def has_next_page(self):
            return True
        async def get_next_page(self):
            return self
    raw = SimpleNamespace(parse=lambda: Page())
    result = {}
    asyncio.run(diagnostic.summarize_models(raw, result))
    assert result == dict(model_ids=['other-model'], models_complete=False, target_model_present=None)


def test_model_id_cap(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(diagnostic, 'MAX_MODEL_IDS', 2)
    class Page:
        data = [SimpleNamespace(id=value) for value in ['one', 'two', 'muse-spark-1.3']]
        def has_next_page(self):
            return False
    result = {}
    asyncio.run(diagnostic.summarize_models(SimpleNamespace(parse=lambda: Page()), result))
    assert result['model_ids'] == ['one', 'two']
    assert result['models_complete'] is False
    assert result['target_model_present'] is None


def test_target_on_later_page():
    from types import SimpleNamespace
    class Page:
        def __init__(self, identifier, next_page=None):
            self.data = [SimpleNamespace(id=identifier)]
            self.next_page = next_page
        def has_next_page(self):
            return self.next_page is not None
        async def get_next_page(self):
            return self.next_page
    first = Page('other-model', Page('muse-spark-1.3'))
    result = {}
    asyncio.run(diagnostic.summarize_models(SimpleNamespace(parse=lambda: first), result))
    assert result['model_ids'] == ['muse-spark-1.3', 'other-model']
    assert result['target_model_present'] is True
    assert result['models_complete'] is True
