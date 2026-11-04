"""Local-only browser QA: injected SDK completions, genuine HTTP routes/solver.

Never deploy this runner. No provider traffic is possible through this client.
"""
import json
import os
from pathlib import Path
import re
import sys
from types import SimpleNamespace as NS

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.update(MODEL_API_MODE='live', MODEL_API_KEY='local-qa-dummy',
                  MODEL_API_BASE_URL='http://127.0.0.1:9',
                  MODEL_API_DIAGNOSTIC_ON_STARTUP='0',
                  CORS_ORIGINS='http://127.0.0.1:5411')

calls = []
state = {'fail_next_explanation': False}


def reply(data):
    return NS(choices=[NS(finish_reason='stop', message=NS(
        content=json.dumps(data), refusal=None))])


def completion(**kwargs):
    schema = kwargs.get('response_format', {}).get('json_schema', {}).get('name')
    if kwargs.get('tools'):
        calls.append({'stage': 'tool_request', 'source': 'injected SDK response'})
        return NS(choices=[NS(finish_reason='tool_calls', message=NS(
            content=None, refusal=None, tool_calls=[NS(
                id='local-qa-comparison', type='function', function=NS(
                    name='compare_reviewed_scenarios', arguments='{}'))]))])
    if schema == 'ComparisonExplanation':
        evidence = json.loads(kwargs['messages'][-1]['content'])
        calls.append({'stage': 'explanation', 'source': 'injected SDK response', 'evidence': evidence})
        if state['fail_next_explanation']:
            state['fail_next_explanation'] = False
            return reply({'message': 'You will save USD 999.', 'follow_up_question': None})
        if evidence['alternative']['feasibility_status'] == 'infeasible':
            text = 'The proposed limit conflicts with the configured requirements. Review the constraint evidence before trying a different limit; this alternative has no usable operating schedule.'
        elif evidence['tariff_changed']:
            text = 'This comparison changes the electricity price assumption. The cost difference describes exposure to a different tariff, rather than savings from changing operations.'
        else:
            text = 'The tighter power limit changes when charging can run. Compare the daily cost and peak demand below, then review the equipment schedules before applying the change.'
        return reply({'message': text, 'follow_up_question': None})
    if schema == 'Selection':
        payload = json.loads(kwargs['messages'][1]['content'])
        text = payload['request']
        cap = re.search(r'(\d+(?:\.\d+)?)\s*kW', text, re.I)
        tariff = re.search(r'(\d+(?:\.\d+)?)\s*percent', text, re.I)
        changes = ({'building_max_demand_kw': float(cap.group(1))} if cap else
                   {'peak_price_increase_percent': float(tariff.group(1))} if tariff else {})
        calls.append({'stage': 'conversation', 'changes': changes,
                      'comparison': payload.get('comparison'), 'source': 'injected SDK response'})
        return reply({
            'category': 'scenario_proposal' if changes else 'answer',
            'fact_keys': ['insights'] if payload.get('comparison') else ['constraints'],
            'clarification': 'none', 'profile': payload['profile'], 'profile_evidence': {},
            'answer': ('I can compare that change while keeping the configured equipment and energy requirements unchanged.'
                       if changes else 'The tighter limit leaves less room to charge during cheaper periods. Review the returned schedules before changing operations.'),
            'summary_bullets': [], 'follow_up_questions': [], 'changes': changes,
        })
    raise AssertionError('Unexpected model schema in local-only QA')


class FakeClient:
    def __init__(self, **kwargs):
        assert kwargs['api_key'] == 'local-qa-dummy'
        assert kwargs['base_url'] == 'http://127.0.0.1:9'
        self.chat = NS(completions=NS(create=completion))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


import openai
openai.OpenAI = FakeClient
from backend.main import app


@app.get('/__qa__/provider-calls')
def provider_calls():
    return {'provider_network_calls': 0, 'injected_sdk_calls': calls}


@app.post('/__qa__/fail-next-explanation')
def fail_next():
    state['fail_next_explanation'] = True
    return {'armed': True}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8411)
