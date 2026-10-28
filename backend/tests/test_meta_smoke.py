"""Exercise the diagnostic against a local SDK transport; no network or real keys."""
import json
from unittest.mock import MagicMock

import httpx
from openai import OpenAI
import pytest

from backend.ai.models import Proposal
from backend.ai.service import response_format
from scripts import smoke_meta


@pytest.mark.parametrize('status,category', [(401, 'authentication'), (402, 'billing'),
    (403, 'permissions'), (429, 'rate_limit_or_quota'),
    (400, 'request_validation_schema_or_parameter')])
def test_smoke_stops_after_basic_failure(monkeypatch, capsys, status, category):
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        assert request.headers['authorization'] == 'Bearer test-only'
        return httpx.Response(status, headers={'x-request-id': 'req-smoke'}, json={
            'error': {'code': 'diagnostic_error', 'message': 'private upstream body'}})
    with OpenAI(api_key='test-only', max_retries=0,
                http_client=httpx.Client(transport=httpx.MockTransport(handle))) as sdk:
        monkeypatch.setenv('MODEL_API_KEY', 'test-only')
        monkeypatch.setattr(smoke_meta, 'OpenAI', MagicMock(return_value=sdk))
        assert smoke_meta.main() == 1
    assert len(calls) == 1
    assert 'response_format' not in calls[0]
    result = json.loads(capsys.readouterr().out)
    assert result['category'] == category
    assert result['upstream_status'] == status
    assert result['request_id'] == 'req-smoke'
    assert 'private' not in json.dumps(result)


def test_smoke_runs_production_schema_only_after_basic_success(monkeypatch, capsys):
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        content = 'ready' if len(calls) == 1 else json.dumps({
            'status': 'proposed', 'message': 'Set limit.', 'changes': {'building_max_demand_kw': 15.0}})
        return httpx.Response(200, headers={'x-request-id': 'req-smoke'}, json={
            'id': 'chatcmpl-test', 'object': 'chat.completion', 'created': 1,
            'model': 'muse-spark-1.3', 'choices': [{'index': 0, 'finish_reason': 'stop',
                'message': {'role': 'assistant', 'content': content}}]})
    with OpenAI(api_key='test-only', http_client=httpx.Client(transport=httpx.MockTransport(handle))) as sdk:
        monkeypatch.setenv('MODEL_API_KEY', 'test-only')
        monkeypatch.setattr(smoke_meta, 'OpenAI', MagicMock(return_value=sdk))
        assert smoke_meta.main() == 0
    assert len(calls) == 2
    assert 'response_format' not in calls[0]
    assert calls[1]['response_format'] == response_format(Proposal)
    assert calls[1]['max_completion_tokens'] == 1500
    output = capsys.readouterr().out
    assert 'Set limit.' not in output
    assert 'test-only' not in output
