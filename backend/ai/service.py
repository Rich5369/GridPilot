"""Server-only Meta adapter. No credential fallback to mock; no model code execution."""
import os
from typing import TypeVar
from pydantic import BaseModel, ValidationError
from fastapi import HTTPException
from backend.ai.models import Proposal, ExplanationSelection

T = TypeVar('T', bound=BaseModel)

def fail(status, code, message):
    return HTTPException(status_code=status, detail={'code': code, 'message': message})

def mode():
    value = os.getenv('MODEL_API_MODE', 'live')
    if value not in ('live', 'mock'):
        raise fail(503, 'ai_configuration', 'AI configuration is invalid.')
    if value == 'mock' and os.getenv('RENDER', '').lower() == 'true':
        raise fail(503, 'ai_configuration', 'Mock AI mode is disabled on Render. Configure live Meta credentials. Optimization remains available.')
    if value == 'live' and not os.getenv('MODEL_API_KEY', '').strip():
        raise fail(503, 'ai_unavailable', 'Meta AI is unavailable: backend credentials are not configured. Optimization remains available.')
    return value

def generate(schema: type[T], instructions: str, payload: dict) -> tuple[T, str]:
    source = mode()
    if source == 'mock':
        if schema is ExplanationSelection:
            return schema(points=['outcome', 'cost', 'peak', 'constraints', 'method']), 'mock'
        # Deliberately limited deterministic fixture, never passed off as Meta.
        text = payload['request'].lower().strip().rstrip('.')
        if text == 'keep peak power demand below 15 kw':
            return schema(status='proposed', message='Mock fixture: propose a 15 kW building limit.', changes={'building_max_demand_kw': 15.0}), 'mock'
        return schema(status='clarification', message='Mock mode supports only the 15 kW example. Live interpretation requires credentials.', changes={}), 'mock'
    # Lazy import keeps health and optimizer independent of provider setup.
    from openai import OpenAI, APITimeoutError, RateLimitError, APIError
    import json
    try:
        with OpenAI(api_key=os.environ['MODEL_API_KEY'], base_url=os.getenv('MODEL_API_BASE_URL', 'https://api.meta.ai/v1'), timeout=25.0, max_retries=0) as client:
            response = client.chat.completions.create(
                model=os.getenv('MODEL_API_MODEL', 'muse-spark-1.3'),
                messages=[{'role': 'system', 'content': instructions}, {'role': 'user', 'content': json.dumps(payload)}],
                response_format={'type': 'json_schema', 'json_schema': {'name': schema.__name__, 'strict': False, 'schema': schema.model_json_schema()}},
                max_completion_tokens=1500,
            )
        choice = response.choices[0]
        if choice.finish_reason != 'stop' or choice.message.refusal:
            raise ValueError('Incomplete or refused')
        return schema.model_validate_json(choice.message.content or '', strict=True), 'meta'
    except APITimeoutError:
        raise fail(504, 'ai_timeout', 'Meta AI timed out. Try again later.') from None
    except RateLimitError:
        raise fail(429, 'ai_rate_limited', 'Meta AI rate limit reached. Try again later.') from None
    except APIError:
        raise fail(502, 'ai_provider_error', 'Meta AI request failed. Check backend credentials and model access.') from None
    except (ValidationError, ValueError, IndexError, AttributeError):
        raise fail(502, 'ai_invalid_response', 'Meta AI returned an invalid response. No changes were applied.') from None
