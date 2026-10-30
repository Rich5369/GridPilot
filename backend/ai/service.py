"""Server-only Meta adapter. No credential fallback to mock; no model code execution."""
import os
import logging
import re
from typing import TypeVar
from pydantic import BaseModel
from fastapi import HTTPException
from backend.ai.models import Proposal, ExplanationSelection

T = TypeVar('T', bound=BaseModel)
logger = logging.getLogger(__name__)

def provider_client_options():
    """Shared credentials and endpoint for generation and access diagnostics."""
    return dict(api_key=os.environ['MODEL_API_KEY'],
                base_url=os.getenv('MODEL_API_BASE_URL', 'https://api.meta.ai/v1'),
                timeout=25.0, max_retries=0)

def provider_model():
    return os.getenv('MODEL_API_MODEL', 'muse-spark-1.3')


def safe_token(value):
    """Only bounded identifiers, never arbitrary provider text or credentials."""
    key = os.getenv('MODEL_API_KEY', '')
    if (not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value)
            or (key and key in value) or value.startswith(('LLM_', 'sk-'))):
        return None
    return value

def provider_error_metadata(exc):
    """Do not serialize the exception, response, headers, or error message."""
    status = getattr(exc, 'status_code', None)
    body = getattr(exc, 'body', None)
    error = body.get('error', body) if isinstance(body, dict) else {}
    error = error if isinstance(error, dict) else {}
    return {
        'upstream_status': status if type(status) is int else None,
        'exception_type': safe_token(type(exc).__name__),
        'provider_code': safe_token(getattr(exc, 'code', None) or error.get('code')),
        'provider_type': safe_token(error.get('type')),
        'provider_param': safe_token(error.get('param')),
        'request_id': safe_token(getattr(exc, 'request_id', None)),
    }

def log_provider_error(exc):
    # No exc_info: SDK exception strings can contain sensitive response bodies.
    logger.warning('Meta API failure %s', provider_error_metadata(exc))

def response_format(schema):
    return {'type': 'json_schema', 'json_schema': {
        'name': schema.__name__, 'strict': False, 'schema': schema.model_json_schema()}}


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

def generate(schema: type[T], instructions: str, payload: dict, *, completion_tokens: int = 1500, request_timeout: float = 25.0, reasoning_effort: str | None = None) -> tuple[T, str]:
    source = mode()
    if source == 'mock':
        if schema.__name__ == 'Selection':
            raise fail(503, 'ai_unavailable', 'Conversational Meta inference is unavailable in mock mode. Manual optimization remains available.')
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
    from backend.ai.completion_diagnostics import CompletionDiagnostics
    diagnostic = CompletionDiagnostics(schema, completion_tokens, reasoning_effort=reasoning_effort)
    try:
        with OpenAI(**provider_client_options()) as client:
            response = client.chat.completions.create(
                model=provider_model(),
                messages=[{'role': 'system', 'content': instructions}, {'role': 'user', 'content': json.dumps(payload)}],
                response_format=response_format(schema),
                max_completion_tokens=completion_tokens,
                timeout=request_timeout,
                **({'reasoning_effort': reasoning_effort} if reasoning_effort is not None else {}),
            )
        diagnostic.observe(response, safe_token)
        return diagnostic.parse(response), 'meta'
    except APITimeoutError as exc:
        log_provider_error(exc)
        raise fail(504, 'ai_timeout', 'Meta AI timed out. Try again later.') from None
    except RateLimitError as exc:
        log_provider_error(exc)
        raise fail(429, 'ai_rate_limited', 'Meta AI rate limit reached. Try again later.') from None
    except APIError as exc:
        log_provider_error(exc)
        raise fail(502, 'ai_provider_error', 'Meta AI request failed upstream. Model access or provider routing may be unavailable. Optimization remains available.') from None
    except (ValueError, IndexError, AttributeError, TypeError):
        diagnostic.invalid('response_processing')
