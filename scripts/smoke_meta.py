"""Authenticated Meta diagnostics; run with backend/.venv/bin/python scripts/smoke_meta.py.

Loads backend/.env without overriding environment variables. Never prints bodies,
prompts, headers, exception messages, or keys. Stops at the first failed stage.
"""
import json
import logging
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from openai import APIError, OpenAI
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.ai.models import Proposal
from backend.ai.service import provider_error_metadata, response_format, safe_token


def category(metadata):
    status = metadata['upstream_status']
    if status == 401:
        return 'authentication'
    if status == 402:
        return 'billing'
    if status == 403:
        return 'permissions'
    if status == 429:
        return 'rate_limit_or_quota'
    if status == 404:
        return 'model_or_endpoint_not_found'
    if status in (400, 422):
        return 'request_validation_schema_or_parameter'
    if status is not None and status >= 500:
        return 'upstream_server'
    return 'connection_or_timeout'


def run_stage(client, stage, **kwargs):
    try:
        raw = client.chat.completions.with_raw_response.create(**kwargs)
    except APIError as exc:
        metadata = provider_error_metadata(exc)
        print(json.dumps({'stage': stage, 'ok': False, 'category': category(metadata), **metadata}))
        return False
    print(json.dumps({'stage': stage, 'authenticated_http_success': True,
                      'upstream_status': raw.status_code,
                      'request_id': safe_token(raw.headers.get('x-request-id'))}))
    try:
        completion = raw.parse()
        choice = completion.choices[0]
        if choice.finish_reason != 'stop' or choice.message.refusal or not choice.message.content:
            raise ValueError('Incomplete response')
        if stage == 'proposal':
            Proposal.model_validate_json(choice.message.content, strict=True)
    except (ValidationError, ValueError, IndexError, AttributeError):
        print(json.dumps({'stage': stage, 'ok': False, 'category': 'invalid_or_incomplete_response'}))
        return False
    print(json.dumps({'stage': stage, 'ok': True}))
    return True


def _run():
    load_dotenv(ROOT / 'backend/.env')
    if not os.getenv('MODEL_API_KEY', '').strip():
        print(json.dumps({'ok': False, 'category': 'local_credentials_missing',
                          'upstream_status': None, 'authenticated_request_sent': False}))
        return 2
    with OpenAI(api_key=os.environ['MODEL_API_KEY'],
                base_url=os.getenv('MODEL_API_BASE_URL', 'https://api.meta.ai/v1'),
                timeout=25.0, max_retries=0) as client:
        # No structured output or optional generation parameters in the first call.
        if not run_stage(client, 'basic', model='muse-spark-1.3',
                         messages=[{'role': 'user', 'content': 'Reply with the single word: ready'}]):
            return 1
        # Match production's schema, instruction role, token budget, and model config.
        if not run_stage(client, 'proposal', model=os.getenv('MODEL_API_MODEL', 'muse-spark-1.3'),
                         messages=[{'role': 'system', 'content': 'Return a Proposal JSON object for the request.'},
                                   {'role': 'user', 'content': 'Keep peak power demand below 15 kW.'}],
                         response_format=response_format(Proposal), max_completion_tokens=1500):
            return 1
    return 0


def main():
    # SDK debug logging includes request bodies. Suppress it only during this run.
    previous = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        return _run()
    finally:
        logging.disable(previous)


if __name__ == '__main__':
    sys.exit(main())
