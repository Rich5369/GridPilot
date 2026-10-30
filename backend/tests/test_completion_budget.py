"""Injected SDK responses exercise HTTP, strict parsing and grounded multi-turn memory.
No live provider inference. Usage values are synthetic, not measured model quality.
"""
import json
from types import SimpleNamespace
import pytest
from backend.tests.test_advisor import provider, client, SAMPLE, ask
from backend.ai.advisor import BusinessProfile
from backend.ai.models import Proposal
from backend.ai.service import generate

WAREHOUSE = ('I operate Cedar Harbor Distribution, a fictional warehouse with 30 employees '
             'working from 7 AM to 7 PM. My electricity bill is about $6,000 per month. '
             'We have four electric forklifts and charge delivery trucks. I want to reduce '
             'electricity expenses by 50%. Hourly electricity consumption is unknown. '
             'How should we start without disrupting operations?')


def usage(provider, total, reasoning):
    provider[0].return_value.usage = SimpleNamespace(completion_tokens=total,
        completion_tokens_details=SimpleNamespace(reasoning_tokens=reasoning))


@pytest.mark.parametrize('content', [None, '', '{"profile":'])
def test_exhausted_budget_never_parses_or_retries(provider, caplog, content):
    response = provider[0].return_value
    response.choices[0].finish_reason = 'length'
    response.choices[0].message.content = content
    response._request_id = '746ab345-2c67-4ab6-8e0d-f41bfefde93f'
    usage(provider, 5000, 5000)
    result = client.post('/api/ai/conversation', json={'request': WAREHOUSE, 'scenario': SAMPLE})
    assert result.status_code == 502
    detail = result.json()['detail']
    assert detail['code'] == 'ai_invalid_response'
    assert 'could not finish' in detail['message']
    assert 'shorter question' in detail['message']
    assert 'No changes were applied' in detail['message']
    assert 'profile' not in result.json()
    records = [r.args for r in caplog.records if r.msg == 'Meta completion rejected %s']
    assert len(records) == 1
    record = records[0]
    assert record['category'] == 'truncated'
    assert record['completion_tokens'] == record['completion_token_limit'] == 5000
    assert record['reasoning_tokens'] == 5000
    assert record['reasoning_effort'] == 'low'
    assert record['content_present'] == bool(content)
    assert record['refusal_present'] is False
    assert record['validation_errors'] == []
    assert record['upstream_status_class'] == '2xx'
    assert record['provider_request_id'] == response._request_id
    assert detail['request_id'] == result.headers['x-request-id'] == record['correlation_id']
    assert provider[0].call_count == 1
    assert WAREHOUSE not in caplog.text


@pytest.mark.parametrize('reasoning', [None, -1, 5001, True, 'PRIVATE-USAGE', {'PRIVATE': 'secret'}])
def test_reasoning_metadata_is_optional_bounded_and_content_free(provider, caplog, reasoning):
    usage(provider, 5000, reasoning)
    provider[0].return_value.choices[0].finish_reason = 'length'
    assert ask().status_code == 502
    record = next(r.args for r in caplog.records if r.msg == 'Meta completion rejected %s')
    assert record['reasoning_tokens'] is None
    assert 'PRIVATE' not in caplog.text


@pytest.mark.parametrize('total', [900, 5000])
def test_finished_valid_selection_accepted_even_at_limit(provider, total):
    usage(provider, total, 200)
    result = ask()
    assert result.status_code == 200
    assert result.json()['source'] == 'meta'
    call = provider[0].call_args.kwargs
    assert call['reasoning_effort'] == 'low'
    assert call['max_completion_tokens'] == 5000
    assert call['timeout'] == 50
    assert call['response_format']['type'] == 'json_schema'
    assert provider[0].call_count == 1


def test_other_generation_stages_keep_existing_settings(provider):
    provider[0].return_value.choices[0].message.content = json.dumps({
        'status':'clarification', 'message':'Which site limit?', 'changes':{}})
    result, source = generate(Proposal, 'Select a supported proposal.', {'request':'Help'})
    assert source == 'meta'
    assert result.status == 'clarification'
    call = provider[0].call_args.kwargs
    assert 'reasoning_effort' not in call
    assert call['max_completion_tokens'] == 1500


def test_detailed_multiturn_warehouse_memory_and_manual_recovery(provider):
    profile = BusinessProfile(business_type='warehouse', employee_count=30,
        operating_hours='7 AM to 7 PM', electricity_cost_and_period='$6,000 per month',
        equipment='four electric forklifts and charge delivery trucks',
        goals='reduce electricity expenses by 50%').model_dump()
    evidence = {key: str(value) for key, value in profile.items() if value is not None}
    provider[1](profile=profile, profile_evidence=evidence, category='clarification_required',
        answer='Charging flexibility could help, but measured usage and tariff details are needed.',
        follow_up_questions=['Does your bill include demand charges? They determine which costs the model can explain.'])
    usage(provider, 1200, 400)
    first = client.post('/api/ai/conversation', json={'request':WAREHOUSE,'scenario':SAMPLE})
    assert first.status_code == 200
    assert first.json()['profile'] == profile
    assert first.json()['profile']['consumption_and_units'] is None
    history = [{'role':'user','content':WAREHOUSE}, {'role':'assistant','content':first.json()['message']}]
    second_text = 'Consumption is still unknown. Forklifts can charge after work but must be ready for the next workday.'
    provider[1](profile={'restrictions':'must be ready for the next workday'},
        profile_evidence={'restrictions':'must be ready for the next workday'},
        answer='Readiness requirements matter when exploring charging flexibility.')
    usage(provider, 1000, 300)
    second = client.post('/api/ai/conversation', json={
        'request':second_text,'profile':profile,'history':history,'scenario':SAMPLE})
    assert second.status_code == 200
    retained = second.json()['profile']
    assert retained == {**profile,'restrictions':'must be ready for the next workday'}
    history += [{'role':'user','content':second_text},{'role':'assistant','content':second.json()['message']}]
    provider[0].return_value.choices[0].finish_reason = 'length'
    provider[0].return_value.choices[0].message.content = None
    usage(provider,5000,5000)
    failed = ask(profile=retained,history=history)
    assert failed.status_code == 502
    assert provider[0].call_count == 3
    # Explicit next user action, not an automatic inference retry.
    provider[1](profile={},answer='Please obtain interval consumption data before assessing savings.')
    usage(provider,800,200)
    recovered = ask(profile=retained,history=history)
    assert recovered.status_code == 200
    assert recovered.json()['profile'] == retained
    assert recovered.json()['profile']['consumption_and_units'] is None
    assert recovered.json()['proposed_scenario'] is None
    assert provider[0].call_count == 4
    payload = json.loads(provider[0].call_args.kwargs['messages'][1]['content'])
    assert payload['history'] == history
    assert payload['profile'] == retained
    assert payload['scenario'] == SAMPLE


def test_real_sdk_serializes_supported_settings_without_network(monkeypatch):
    import httpx
    from backend.ai import service
    from backend.ai.advisor import ConversationRequest, converse
    calls = []
    def transport(request):
        sent = json.loads(request.content)
        calls.append(sent)
        assert sent['model'] == 'muse-spark-1.3'
        assert sent['reasoning_effort'] == 'low'
        assert sent['max_completion_tokens'] == 5000
        assert 'max_output_tokens' not in sent
        assert sent['response_format']['json_schema']['schema']['additionalProperties'] is False
        content = {'category':'answer', 'profile':{}, 'changes':{},
                   'answer':'Measured consumption will help assess charging opportunities.'}
        return httpx.Response(200, json={
            'id':'injected-completion', 'created':0, 'object':'chat.completion',
            'model':'muse-spark-1.3', 'choices':[{'index':0, 'finish_reason':'stop',
                'message':{'role':'assistant','content':json.dumps(content)}}],
            'usage':{'prompt_tokens':1000,'completion_tokens':900,'total_tokens':1900,
                     'completion_tokens_details':{'reasoning_tokens':300}}})
    monkeypatch.setenv('MODEL_API_MODE','live')
    monkeypatch.setenv('MODEL_API_KEY','injected-http-transport-only')
    with httpx.Client(transport=httpx.MockTransport(transport)) as http:
        monkeypatch.setattr(service,'provider_client_options',lambda:dict(
            api_key='injected-http-transport-only',base_url='https://meta-fixture.invalid/v1',
            http_client=http,max_retries=0))
        monkeypatch.setattr(service,'provider_model',lambda:'muse-spark-1.3')
        result = converse(ConversationRequest(request=WAREHOUSE,scenario=SAMPLE))
    assert result.source == 'meta'  # adapter mode; still an injected transport, not live inference
    assert result.profile.consumption_and_units is None
    assert len(calls) == 1
