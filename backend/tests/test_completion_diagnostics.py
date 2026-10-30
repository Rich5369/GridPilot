"""Injected SDK completions only; no live Meta requests or raw-output logging."""
import json
from types import SimpleNamespace
import pytest
from backend.tests.test_advisor import provider, client, SAMPLE, ask
from backend.ai.advisor import BusinessProfile
from backend.tests.test_advisor_conversations import WAREHOUSE


def rejected(provider, caplog, *, data=None, content=None, finish='stop', refusal=None):
    if data is not None:
        provider[1](**data)
    response = provider[0].return_value
    choice = response.choices[0]
    if content is not None:
        choice.message.content = content
    choice.finish_reason = finish
    choice.message.refusal = refusal
    response._request_id = 'req-fixture-onboarding'
    result = ask()
    assert result.status_code == 502
    records = [r.args for r in caplog.records if r.msg == 'Meta completion rejected %s']
    assert len(records) == 1
    record = records[0]
    assert result.json()['detail']['request_id'] == record['correlation_id']
    assert result.headers['x-request-id'] == record['correlation_id']
    assert record['response_status'] == 502
    assert record['upstream_status_class'] == '2xx'
    assert record['provider_request_id'] == 'req-fixture-onboarding'
    assert provider[0].call_count == 1  # Diagnostics must never retry inference.
    return record


@pytest.mark.parametrize('finish,category', [('length','truncated'),('content_filter','incomplete_completion'),('PRIVATE-FINISH-CANARY','incomplete_completion')])
def test_finish_reasons(provider, caplog, finish, category):
    record = rejected(provider, caplog, content='PRIVATE-MODEL-OUTPUT', finish=finish)
    assert record['category'] == category
    assert record['completion_token_limit'] == 5000
    assert record['content_present'] is True
    assert record['refusal_present'] is False
    assert record['finish_reason'] == (finish if finish != 'PRIVATE-FINISH-CANARY' else 'other')
    assert 'PRIVATE' not in caplog.text


def test_refusal(provider, caplog):
    assert rejected(provider, caplog, refusal='PRIVATE-REFUSAL')['category'] == 'refusal'
    assert 'PRIVATE-REFUSAL' not in caplog.text


@pytest.mark.parametrize('content,category', [('', 'empty_content'), ('PRIVATE-NOT-JSON', 'json_parsing'), ('[]','schema_validation')])
def test_parse_errors(provider, caplog, content, category):
    assert rejected(provider, caplog, content=content)['category'] == category
    assert 'PRIVATE' not in caplog.text


@pytest.mark.parametrize('data,path,expected,received,error_type', [
    ({'profile':{'employee_count':'PRIVATE-COUNT'}}, '$.profile.employee_count','integer|null','string','int_type'),
    ({'answer':{'PRIVATE-KEY':'PRIVATE-VALUE'}}, '$.answer','string','object','string_type'),
    ({'category':'PRIVATE-ENUM'}, '$.category','enum<string>','string','literal_error'),
    ({'profile_evidence':{'PRIVATE-BUSINESS-NAME':[]}}, '$.profile_evidence.*','string','array','string_type'),
    ({'PRIVATE-EXTRA':'PRIVATE-VALUE'}, '$.*','forbidden_field','string','extra_forbidden'),
    ({'profile':{'equipment':'PRIVATE-'*100}}, '$.profile.equipment','string|null','string','string_too_long'),
])
def test_schema_error_types_without_values(provider, caplog, data, path, expected, received, error_type):
    record = rejected(provider, caplog, data=data)
    assert record['category'] == 'schema_validation'
    assert record['validation_errors'] == [{'path':path,'expected_type':expected,'received_type':received,'error_type':error_type}]
    assert 'PRIVATE' not in caplog.text
    assert 'injected-test-only' not in caplog.text


def test_required_fields_are_not_fabricated(provider, caplog):
    record = rejected(provider, caplog, content='{}')
    assert record['category'] == 'schema_validation'
    assert {r['path'] for r in record['validation_errors']} == {'$.answer','$.category','$.profile','$.changes'}
    assert all(e['received_type']=='missing' for e in record['validation_errors'])


def test_diagnostic_error_budget(provider, caplog):
    data={'profile_evidence':{f'PRIVATE-{i}':[] for i in range(8)}}
    data.update({f'PRIVATE-EXTRA-{i}':'PRIVATE-VALUE' for i in range(20)})
    record = rejected(provider, caplog, data=data)
    assert len(record['validation_errors']) == 12
    assert record['validation_errors_truncated']
    assert 'PRIVATE' not in caplog.text


@pytest.mark.parametrize('choices', [[], [SimpleNamespace(message=None,finish_reason='stop')]])
def test_malformed_choice(provider, caplog, choices):
    provider[0].return_value.choices = choices
    response = ask()
    assert response.status_code == 502
    record=next(r.args for r in caplog.records if r.msg=='Meta completion rejected %s')
    assert record['category']=='malformed_response'


def test_detailed_warehouse_onboarding_success_fixture(provider, caplog):
    # Synthetic valid completion for the failed user request; NOT the missing raw response.
    profile = BusinessProfile(business_type='warehouse',employee_count=30,
        operating_hours='7 AM to 7 PM',electricity_cost_and_period='$6,000 per month',
        equipment='four electric forklifts',goals='cut our electricity expenses by 50%').model_dump()
    provider[1](category='clarification_required',answer='Charging flexibility is worth exploring after collecting consumption and tariff details.',
        profile=profile,profile_evidence={k:WAREHOUSE for k,v in profile.items() if v is not None},
        follow_up_questions=['Can you obtain interval consumption data? It distinguishes steady demand from charging peaks.',
                             'Does the bill include demand charges? They affect what the energy-only model can explain.'])
    response=client.post('/api/ai/conversation',json={'request':WAREHOUSE,'scenario':SAMPLE})
    assert response.status_code==200
    assert response.json()['profile']==profile
    assert response.json()['profile']['consumption_and_units'] is None
    assert response.json()['proposed_scenario'] is None
    assert not [r for r in caplog.records if r.msg=='Meta completion rejected %s']
    kwargs=provider[0].call_args.kwargs
    assert kwargs['model']=='muse-spark-1.3'
    assert kwargs['max_completion_tokens']==5000
    assert kwargs['timeout']==50
    assert kwargs['response_format']['json_schema']['strict'] is False


@pytest.mark.parametrize('missing', ['', 'N/A', 'unknown', None])
def test_unknown_consumption_and_retained_context(provider, missing):
    profile=BusinessProfile(business_type='warehouse',employee_count=30).model_dump()
    provider[1](profile={'consumption_and_units':missing},answer='We still need measured consumption before discussing a tailored plan.')
    response=ask(profile=profile,history=[{'role':'user','content':'We operate a warehouse.'}])
    assert response.status_code==200
    assert response.json()['profile']['business_type']=='warehouse'
    assert response.json()['profile']['employee_count']==30
    assert response.json()['profile']['consumption_and_units'] is None


def test_422_and_409_are_expected_without_generation(provider):
    assert client.post('/api/ai/conversation',json={}).status_code==422
    assert client.post('/api/ai/explain',json={'scenario':SAMPLE}).status_code==409
    assert client.post('/api/ai/explain',json={'scenario':SAMPLE,'result_id':'missing'}).status_code==409
    assert provider[0].call_count==0


@pytest.mark.parametrize('error', [ValueError('PRIVATE-SDK-CONTENT'), AttributeError('PRIVATE-SDK-FIELD')])
def test_sdk_response_processing_remains_sanitized(provider, caplog, error):
    provider[0].side_effect=error
    response=ask()
    assert response.status_code==502
    record=next(r.args for r in caplog.records if r.msg=='Meta completion rejected %s')
    assert record['category']=='response_processing'
    assert record['upstream_status_class'] is None
    assert 'PRIVATE' not in caplog.text


def test_truncated_token_usage_is_metadata_not_output(provider, caplog):
    provider[0].return_value.usage=SimpleNamespace(completion_tokens=5000)
    record=rejected(provider,caplog,finish='length',content='PRIVATE-TRUNCATED-CONTENT')
    assert record['completion_tokens']==record['completion_token_limit']==5000
    assert 'PRIVATE' not in caplog.text
