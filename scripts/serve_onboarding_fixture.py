"""LOCAL TEST SERVER ONLY: injected SDK completions, real HTTP and optimizer.
Never deploy this harness. No external inference is possible: the SDK is patched.
Run from repository root with test dependencies installed.
"""
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
WAREHOUSE = ('I operate a warehouse with 30 employees working from 7 AM to 7 PM. '
             'My electricity bill is about $6,000 per month. We have four electric forklifts '
             'and charge delivery trucks. I want to cut our electricity expenses by 50%.')


def fixture(**kwargs):
    payload=json.loads(kwargs['messages'][1]['content'])
    request=payload['request']
    selection={'category':'answer','fact_keys':['cost'], 'profile':payload['profile'],
               'changes':{}, 'answer':'Charging flexibility is worth exploring after collecting consumption and tariff details.',
               'follow_up_questions':['Does your bill include demand charges? That determines what the energy-only model can explain.']}
    if request == WAREHOUSE:
        profile={'business_type':'warehouse','employee_count':30,'operating_hours':'7 AM to 7 PM',
                 'electricity_cost_and_period':'$6,000 per month','equipment':'four electric forklifts',
                 'goals':'cut our electricity expenses by 50%'}
        selection.update(category='clarification_required',profile=profile,
                         profile_evidence={key:WAREHOUSE for key in profile})
    elif request == 'Why did optimization reduce my daily cost?':
        selection.update(answer='Flexible equipment caused the savings.',fact_keys=['cost','devices'])
    elif request == 'Keep the entire building below 15 kW.':
        selection.update(category='scenario_proposal',answer='Review this site-cap proposal before applying or comparing.',changes={'building_max_demand_kw':15.0})
    truncated=request=='fixture truncated'
    return SimpleNamespace(_request_id='req-local-fixture',choices=[SimpleNamespace(
        finish_reason='length' if truncated else 'stop',
        message=SimpleNamespace(content=None if truncated else json.dumps(selection),refusal=None))],
        usage=SimpleNamespace(completion_tokens=5000 if truncated else 900,
            completion_tokens_details=SimpleNamespace(reasoning_tokens=5000 if truncated else 300)))


class InjectedSDK:
    def __init__(self, **_options):
        self.chat=SimpleNamespace(completions=SimpleNamespace(create=fixture))
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        pass


if __name__=='__main__':
    import uvicorn
    if os.getenv('RENDER','').lower()=='true':
        raise SystemExit('Local fixture harness must never run on Render')
    os.environ.update(MODEL_API_MODE='live',MODEL_API_KEY='local-injected-fixture-only',MODEL_API_DIAGNOSTIC_ON_STARTUP='0',CORS_ORIGINS='http://127.0.0.1:5210')
    print('INJECTED SDK FIXTURE ONLY — NOT LIVE META',flush=True)
    with patch('openai.OpenAI',InjectedSDK):
        from backend.main import app
        uvicorn.run(app,host='127.0.0.1',port=8210)
