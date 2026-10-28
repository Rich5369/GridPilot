"""Opt-in, one pass per lifespan; safe metadata only, no startup network wait."""
import asyncio
from contextvars import ContextVar
import logging
import os
import socket
import time

import httpx
from openai import AsyncOpenAI, APITimeoutError

from backend.ai.service import provider_client_options, provider_error_metadata, safe_token, provider_model

logger = logging.getLogger(__name__)
REQUEST_SECONDS = 25.0
DEADLINE_SECONDS = 30.0
TARGET_MODEL = 'muse-spark-1.3'
MAX_MODEL_PAGES = 5
MAX_MODEL_IDS = 200
_active = ContextVar('meta_diagnostic', default=False)


class DiagnosticLogFilter(logging.Filter):
    def filter(self, record):
        return not (_active.get() and record.name.startswith(('openai', 'httpx', 'httpcore')))


def exception_chain(exc):
    result = []
    while exc is not None and len(result) < 8 and exc not in result:
        result.append(exc)
        exc = exc.__cause__ or exc.__context__
    return result


def diagnostic_transport(**kwargs):
    return httpx.AsyncClient(**kwargs)


async def summarize_models(raw, result):
    """Only bounded, sanitized IDs; absence is conclusive only for a complete list."""
    result.update(model_ids=[], models_complete=False, target_model_present=None)
    page = raw.parse()
    ids = set()
    for page_index in range(MAX_MODEL_PAGES):
        for model in page.data:
            identifier = safe_token(model.id)
            if identifier:
                ids.add(identifier)
            if len(ids) >= MAX_MODEL_IDS:
                break
        result['model_ids'] = sorted(ids)
        if TARGET_MODEL in ids:
            result['target_model_present'] = True
        if len(ids) >= MAX_MODEL_IDS:
            return
        if not page.has_next_page():
            result['models_complete'] = True
            result['target_model_present'] = TARGET_MODEL in ids
            return
        if page_index + 1 == MAX_MODEL_PAGES:
            return
        page = await page.get_next_page()


async def probe(operation):
    started = time.monotonic()
    phase = 'configuration'
    result = dict(operation=operation, ok=False, upstream_status=None,
                  exception_type=None, provider_code=None, request_id=None,
                  timeout_origin=None, cause_types=[])

    async def trace(event, info):
        nonlocal phase
        # Never inspect trace payloads: they may contain headers and bodies.
        step = event.split('.')[-2]
        phases = {'connect_tcp': 'dns_or_tcp', 'start_tls': 'tls',
                  'send_request_headers': 'request_write', 'send_request_body': 'request_write',
                  'receive_response_headers': 'response_headers',
                  'receive_response_body': 'response_body'}
        if step in phases:
            phase = phases[step]

    async def attach_trace(request):
        request.extensions['trace'] = trace

    deadline = asyncio.timeout(DEADLINE_SECONDS)
    try:
        async with deadline:
            options = provider_client_options() if operation != 'status' else {
                'base_url': os.getenv('MODEL_API_BASE_URL', 'https://api.meta.ai/v1')}
            base = options['base_url'].rstrip('/') + '/'
            phase = 'transport_setup'
            # Fresh connection per probe; HTTPX defaults preserve production proxy behavior.
            async with diagnostic_transport(timeout=REQUEST_SECONDS,
                                         event_hooks={'request': [attach_trace]}) as transport:
                phase = 'request_dispatch'
                if operation == 'status':
                    response = await transport.get(base + 'status')
                    result.update(upstream_status=response.status_code,
                                  request_id=safe_token(response.headers.get('x-request-id')))
                    response.raise_for_status()
                else:
                    options.update(timeout=REQUEST_SECONDS, max_retries=0, http_client=transport)
                    async with AsyncOpenAI(**options) as client:
                        if operation == 'models':
                            raw = await client.models.with_raw_response.list()
                        else:
                            raw = await client.chat.completions.with_raw_response.create(
                                model=provider_model(),
                                messages=[{'role': 'user', 'content': 'Reply with the word ready.'}])
                        result.update(upstream_status=raw.status_code,
                                      request_id=safe_token(raw.headers.get('x-request-id')))
                        if operation == 'models':
                            await summarize_models(raw, result)
                        # Never log generated content or arbitrary model metadata.
                result['ok'] = True
                phase = 'http_success'
    except Exception as exc:
        metadata = provider_error_metadata(exc)
        if metadata['upstream_status'] is None:
            metadata['upstream_status'] = result['upstream_status']
        if metadata['request_id'] is None:
            metadata['request_id'] = result['request_id']
        result.update(metadata)
        chain = exception_chain(exc)
        result['cause_types'] = [safe_token(type(item).__name__) for item in chain]
        if deadline.expired():
            result['timeout_origin'] = 'asyncio_deadline'
        elif isinstance(exc, APITimeoutError):
            result['timeout_origin'] = 'openai_sdk'
        elif isinstance(exc, httpx.TimeoutException):
            result['timeout_origin'] = 'http_transport'
        if any(isinstance(item, socket.gaierror) for item in chain):
            phase = 'dns'
        elif result['upstream_status'] is not None:
            phase = 'provider_http_error'
    result.update(phase=phase, elapsed_seconds=round(time.monotonic() - started, 3))
    logger.warning('Meta diagnostic %s', result)
    return result


async def list_models_on_startup():
    if os.getenv('MODEL_API_DIAGNOSTIC_ON_STARTUP') != '1':
        return
    # Context-local suppression does not silence unrelated application requests.
    filter_ = DiagnosticLogFilter()
    targets = [logging.getLogger()]
    targets += [item for item in list(logging.root.manager.loggerDict.values())
                if isinstance(item, logging.Logger)]
    handlers = {handler for item in targets for handler in item.handlers}
    for item in [*targets, *handlers]:
        item.addFilter(filter_)
    token = _active.set(True)
    try:
        logger.warning('Meta diagnostic configuration %s', {
            'base_url_matches_meta': os.getenv('MODEL_API_BASE_URL', 'https://api.meta.ai/v1').rstrip('/') == 'https://api.meta.ai/v1',
            'model': safe_token(provider_model()),
            'model_matches_target': provider_model() == 'muse-spark-1.3',
            'credential_source': 'MODEL_API_KEY',
            'credential_present': bool(os.getenv('MODEL_API_KEY', '').strip()),
            'mode': safe_token(os.getenv('MODEL_API_MODE', 'live')),
            'request_timeout_seconds': REQUEST_SECONDS, 'deadline_seconds': DEADLINE_SECONDS,
            'max_retries': 0})
        for operation in ('status', 'models', 'inference'):
            await probe(operation)
    finally:
        _active.reset(token)
        for item in [*targets, *handlers]:
            item.removeFilter(filter_)
