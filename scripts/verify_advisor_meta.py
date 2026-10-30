"""Opt-in external inference: sends ONLY repository demo and fictional office text.
Run from repository root with existing local MODEL_API_* environment; no configuration changes.
"""
import json
from pathlib import Path
from backend.ai.advisor import converse, ConversationRequest
from backend.api.routes import optimize
from backend.models.contracts import Scenario


def main():
    scenario = Scenario.model_validate_json(Path('sample_data/scenario.demo.json').read_text())
    optimize(scenario)
    requests = [
        'I operate an office with 10 employees working 9 AM to 5 PM. My electricity bill is USD 2000 monthly. We have two EVs that charge overnight and want to reduce costs without disrupting operations.',
        'What are my modeled daily costs?',
        'Can we keep total power below 15 kW?',
        '15 kW for the entire building.',
    ]
    history, profile, evidence = [], {}, []
    for request in requests:
        try:
            response = converse(ConversationRequest(request=request, scenario=scenario, history=history[-12:], profile=profile))
            evidence.append({'request': request, 'response': response.model_dump()})
            print(json.dumps({'source': response.source, 'category': response.category, 'message': response.message}))
            profile = response.profile.model_dump()
            history.extend([{'role':'user','content':request}, {'role':'assistant','content':(response.message+' '+' '.join(response.facts))[:3000]}])
        except Exception as exc:
            evidence.append({'request':request,'status':getattr(exc,'status_code',None),'detail':getattr(exc,'detail',{'message':'Verification failed'})})
            print(json.dumps(evidence[-1]))
            break
    Path('artifacts/energy-advisor').mkdir(parents=True,exist_ok=True)
    Path('artifacts/energy-advisor/real-meta-conversation.json').write_text(json.dumps(evidence,indent=2))
    return 0 if len(evidence)==4 and all(item.get('response',{}).get('source')=='meta' for item in evidence) else 1

if __name__ == '__main__':
    raise SystemExit(main())
