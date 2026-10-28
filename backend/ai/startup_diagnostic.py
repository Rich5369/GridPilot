"""Temporary opt-in model discovery; no routes, prompts, or response-body logging."""
import asyncio
import logging
import os

from backend.ai.service import provider_client_options, provider_error_metadata, safe_token

logger = logging.getLogger(__name__)
TARGET_MODEL = 'muse-spark-1.3'


async def list_models_on_startup():
    if os.getenv('MODEL_API_LIST_MODELS_ON_STARTUP') != '1':
        return

    # As in smoke_meta, suppress SDK/transport debug output, including bodies and
    # headers. Restore the prior level before emitting our allowlisted result.
    previous = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        from openai import AsyncOpenAI

        async def discover():
            options = provider_client_options()
            options['timeout'] = 5.0
            async with AsyncOpenAI(**options) as client:
                # Iterate all pages, with an overall deadline as well as HTTP timeout.
                return [model.id async for model in client.models.list()]

        ids = await asyncio.wait_for(discover(), timeout=6.0)
        result = {'model_ids': sorted({value for value in ids if safe_token(value)}),
                  'muse-spark-1.3_available': TARGET_MODEL in ids}
        failed = False
    except Exception as exc:
        # Includes missing credentials, SDK/configuration errors and timeouts.
        # Never stringify exceptions or include tracebacks.
        result = provider_error_metadata(exc)
        failed = True
    finally:
        logging.disable(previous)

    if failed:
        logger.warning('Meta startup model discovery failed %s', result)
    else:
        logger.warning('Meta startup model discovery %s', result)
