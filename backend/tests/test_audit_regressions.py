"""Reproduced audit defects: no live provider or electricity network requests."""
import asyncio
import pytest
from fastapi import HTTPException
from backend.ai.advisor import ConversationRequest, Selection, grounded_profile
from backend.tests.test_advisor import SAMPLE, provider
from backend.eia.retail import RetailService, parse_report
from backend.tests.test_eia_retail import NOW, report


@pytest.mark.parametrize('quote,value', [('300 employees',30),('30 employees',0),('130 employees',30),('30.5 employees',30),('1,030 employees',30),('-30 employees',30),('٣٠٠ employees',30)])
def test_employee_count_is_not_a_numeric_substring(quote,value):
    body=ConversationRequest(request=f'We have {quote}.',scenario=SAMPLE)
    selection=Selection(category='answer',profile={'employee_count':value},profile_evidence={'employee_count':quote},answer='Please review the business context.',changes={})
    with pytest.raises(HTTPException) as exc: grounded_profile(body,selection)
    assert exc.value.status_code==502 and exc.value.detail['code']=='ai_invalid_response'


@pytest.mark.parametrize('quote,value', [('30 employees',30),('0 employees',0),('We employ 30.',30),('staff: 30',30)])
def test_exact_employee_count_excerpt_still_accepted(quote,value):
    body=ConversationRequest(request=quote,scenario=SAMPLE)
    selection=Selection(category='answer',profile={'employee_count':value},profile_evidence={'employee_count':quote},answer='Please review the business context.',changes={})
    assert grounded_profile(body,selection).employee_count==value


@pytest.mark.parametrize('broken', ['missing', 'malformed'])
def test_valid_live_retail_release_does_not_require_readable_fallback(tmp_path,monkeypatch,broken):
    snapshot=tmp_path/'snapshot.json'
    if broken=='malformed': snapshot.write_text('{corrupt-json')
    svc=RetailService(clock=lambda:NOW,snapshot_path=snapshot)
    async def fresh(): return parse_report(report(),NOW)
    monkeypatch.setattr(svc,'fetch',fresh)
    r=asyncio.run(svc.get())
    assert r.status=='available' and r.period=='2026-08'
    assert r.source_checked_at==NOW
    assert next(s for s in r.states if s.state=='California').cents_per_kwh==12.5
    # Source retrieval never rewrites a deployment asset or fabricates a backup.
    assert snapshot.exists()==(broken=='malformed')


@pytest.mark.parametrize('token', ['NaN', 'Infinity', '-Infinity', '1e309', '-1e309'])
@pytest.mark.parametrize('endpoint', ['/api/optimize', '/api/ai/conversation'])
def test_nonfinite_json_payload_returns_serializable_422(token,endpoint):
    import json
    from fastapi.testclient import TestClient
    from backend.main import app
    payload=dict(SAMPLE, building_max_demand_kw='REPLACE_NONFINITE')
    if endpoint.endswith('conversation'): payload={'request':'Help','scenario':payload}
    raw=json.dumps(payload).replace('"REPLACE_NONFINITE"',token)
    response=TestClient(app,raise_server_exceptions=False).post(endpoint,content=raw,headers={'Content-Type':'application/json'})
    assert response.status_code==422
    errors=response.json()['detail']
    assert any(error['type']=='finite_number' and error['loc'][-1]=='building_max_demand_kw' for error in errors)
    assert all(isinstance(error['input'],str) for error in errors)
    json.dumps(response.json(),allow_nan=False)


def test_nonfinite_nested_array_error_does_not_break_validation_response():
    import json
    from fastapi.testclient import TestClient
    from backend.main import app
    payload=dict(SAMPLE,fixed_demand_kw=['REPLACE_NONFINITE'])
    raw=json.dumps(payload).replace('"REPLACE_NONFINITE"','1e309')
    response=TestClient(app,raise_server_exceptions=False).post('/api/optimize',content=raw,headers={'Content-Type':'application/json'})
    assert response.status_code==422
    json.dumps(response.json(),allow_nan=False)


def test_employee_substring_is_rejected_through_real_api_with_injected_completion(provider):
    from backend.tests.test_advisor import client
    provider[1](profile={'employee_count':30},profile_evidence={'employee_count':'300 employees'})
    response=client.post('/api/ai/conversation',json={'request':'We have 300 employees.','scenario':SAMPLE})
    assert response.status_code==502
    assert response.json()['detail']['code']=='ai_invalid_response'
