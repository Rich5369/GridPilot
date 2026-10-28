# Meta diagnostics on Render

The previous discovery used a 5-second SDK timeout and a 6-second overall
`asyncio.wait_for`, and blocked FastAPI startup. Its bare `TimeoutError` points
to the asyncio deadline, rather than the SDK's `APITimeoutError`. Historical
logs cannot establish which network phase exhausted that deadline. The observed
404/model_not_found establishes an HTTP response from an upstream, but does not
by itself distinguish model access, model ID, or endpoint configuration.

Live inference and diagnostics now share `provider_client_options()` and
`provider_model()`: MODEL_API_KEY, MODEL_API_BASE_URL (default
https://api.meta.ai/v1), and MODEL_API_MODEL (default muse-spark-1.3).
Environment variables take precedence over backend/.env. No alternate key source
or automatic mock fallback is used. Actual Render values and credential identity
cannot be verified from this checkout; inspect Render's environment privately.
The configuration log reports endpoint/target agreement and key presence without
printing a key, key fingerprint, or arbitrary URL that might contain credentials.

After reviewing and approving deployment, set
`MODEL_API_DIAGNOSTIC_ON_STARTUP=1` in Render. Remove the obsolete
MODEL_API_LIST_MODELS_ON_STARTUP flag (it no longer enables anything). This runs
one pass per application lifespan/worker, in a background task, with shutdown
cancellation. It does not run periodically or expose a diagnostic endpoint.
Multiple workers/restarts each run once; disable the flag after collecting logs.
No deployment was performed by this change.

Each operation uses a fresh connection, a 25-second HTTP timeout for each
transport phase, a 30-second asyncio total deadline, zero SDK retries, and no
redirect following. Three sequential operations take at most approximately 90
seconds in the background. A failure does not prevent subsequent operations:

1. Unauthenticated GET to the configured base URL plus /status.
2. Authenticated GET /models, up to five pages and 200 sanitized model IDs
   within the same 30-second operation deadline.
3. Minimal authenticated POST /chat/completions with the configured model and a
   fixed nonsensitive test message. This matches the live integration's Chat
   Completions protocol. It intentionally omits structured-output options to
   isolate basic inference access. With default production configuration it tests
   muse-spark-1.3; model_matches_target=false means the configured model differs.

The status request uses the same base URL as production, rather than silently
probing a different host when configuration differs. HTTPX honors environment
proxy configuration, as does the production SDK. Network phases may therefore
refer to a proxy. Inference may incur the provider's ordinary request charge.

Read `Meta diagnostic` records separately by operation. `ok` means HTTP success,
not validation of generated content. Only sanitized model IDs are logged from
the model-list response; other response content, prompts, headers, exception
messages, trace payloads, and credentials are excluded.
SDK/transport logs are suppressed within the diagnostic task only.

- status fails before HTTP: investigate Render egress/connectivity before model access.
- status succeeds, models returns 401: credential rejection; 403: permission rejection.
- The models result includes `model_ids`, `models_complete`, and
  `target_model_present` for the exact ID `muse-spark-1.3`. True means listed;
  false means absent from a complete list. Null means unknown because listing
  was incomplete (page/ID cap, failure, or timeout). IDs use the existing bounded
  identifier sanitizer, including rejection of the configured key and known
  credential prefixes. No owner fields or arbitrary model metadata are logged.
- models succeeds, inference returns 404/model_not_found: investigate model access,
  configured ID, and endpoint routing; listing success alone does not prove inference access.
- inference returns 400/422: provider request validation; minimal success followed
  by a live interpret failure points toward production schema/parameter handling.
  The existing scripts/smoke_meta.py separately tests the production Proposal schema.
- 429 indicates quota/rate limiting; 5xx indicates an upstream HTTP failure.
- timeout_origin=asyncio_deadline identifies the total wrapper; openai_sdk identifies
  APITimeoutError; http_transport identifies an unwrapped HTTPX timeout. cause_types
  preserves bounded exception class names, without messages.
- phase=dns is emitted only if socket.gaierror survives the exception chain.
  dns_or_tcp means HTTPX's connect step combines DNS and TCP: it cannot safely
  distinguish them when the underlying cause is hidden. tls, request_write,
  response_headers, and response_body identify the last observed transport phase.
  request_dispatch means no transport trace was available; never infer DNS from it.
- provider_http_error plus an HTTP status means a response was obtained;
  a request ID supports provider escalation. Absence of an ID proves nothing
  about whether the provider received the request.

Transport phase detection uses HTTPX's documented trace extension:
https://www.python-httpx.org/advanced/extensions/ . Events can vary by transport
version; missing events remain unknown rather than guessed.

Compare this pass on Render with the same pass locally using the local credential
source. Never paste environment dumps or keys into logs. Local success cannot
establish Render connectivity or prove the two credential values are identical.

## Workspace verification (2026-10-28)

With network access enabled, the three separate probes against the default Meta
endpoint and muse-spark-1.3 returned HTTP 200: status 0.162s, models 0.985s,
inference 1.519s. Credentials came from the workspace's existing server-side
configuration. Restricted-sandbox runs exhibited DNS and asyncio-deadline failures;
these are workspace restrictions and are not evidence about Render.


## Minimal Render follow-up

The reported Render results (status 200, models 200, inference 404/model_not_found)
do not include model IDs, so target presence cannot be determined retrospectively.
After an approved deployment, enable one diagnostic pass and inspect the models
record plus configuration agreement flags. If target_model_present=false with
models_complete=true, request access for Render's credential or correct the model
configuration using the exact accessible ID intended for the application. If true
but inference still returns 404, take both request IDs and the endpoint/model
agreement flags to Meta support; do not assume listing grants inference access.
Disable the flag after collecting results.

The local smoke script and live adapter both use the OpenAI SDK Chat Completions
protocol, the same MODEL_API_BASE_URL default https://api.meta.ai/v1, and the
MODEL_API_KEY source. The smoke script's basic stage pins muse-spark-1.3; live
inference and the startup probe use MODEL_API_MODEL with that default. The recorded
successful local diagnostic confirmed the default endpoint and exact target model.
Actual Render overrides and credential identity remain unverified by this checkout.
