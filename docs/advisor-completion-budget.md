# Energy Advisor completion-budget correction

## Confirmed production failure and limits of the evidence

Current main was fetched and inspected at `809a75f0a81e00368a2bd8240be34fcdd285cc5b`,
PR #41's merge. The user supplied the matching sanitized Render record for the
single authorized Cedar Harbor onboarding acceptance request:

```yaml
correlation_id: 21672a8d9a2a4434a9baca8bb3868a64
provider_request_id: 746ab345-2c67-4ab6-8e0d-f41bfefde93f
category: truncated
schema: Selection
finish_reason: length
content_present: false
refusal_present: false
completion_token_limit: 5000
completion_tokens: 5000
upstream_status_class: 2xx
response_status: 502
validation_errors: []
```

This confirms exhaustion of the completion budget for that request. The provider
returned a successful HTTP class, then the application rejected an unfinished
completion with HTTP 502. The exact upstream HTTP status is unavailable. There
were no Pydantic field errors: parsing/validation never ran after the length stop.
The profile was not successfully extracted, and no application changes were made.

The production record has no reasoning-token breakdown. No visible content plus
an exhausted budget is consistent with reasoning consuming the available tokens,
but does not establish that all 5000 were reasoning tokens or reveal the model's
internal behavior. The earlier pre-diagnostic onboarding failure has no matching
completion metadata; the new record establishes the reproduced case's mechanism,
not a recovered diagnostic for the earlier request.

## Exact path and provider documentation

`POST /api/ai/conversation` validates `ConversationRequest`, then calls
`advisor.converse`. It supplies bounded history, the existing business profile,
submitted engineering inputs and server-owned verified facts to
`service.generate(Selection, ...)`. This stage selects qualitative guidance,
profile excerpts, fact keys and proposed changes; it does not calculate solver
outcomes. `service.generate` uses genuine Chat Completions via the OpenAI-compatible
SDK and the existing configured Meta endpoint/model (default `muse-spark-1.3`).
It sends `response_format.type=json_schema`, the Pydantic schema, and the existing
`strict: false` provider option. Application parsing remains strict Pydantic JSON
validation, followed by profile evidence, numerical prose and proposal checks.

The conversation call explicitly sets `max_completion_tokens=5000` and a 50-second
timeout. SDK retries are zero. Other generation stages default to 1500 tokens and
25 seconds. Before this correction, `reasoning_effort` was omitted.

Primary Meta documentation, checked October 30, 2026:

- [Reasoning](https://dev.meta.ai/docs/reasoning): internal reasoning and visible
  output share the completion budget; omitted effort uses a model-determined
  level. Low effort is recommended for direct answers. Muse Spark supports low;
  disabling reasoning with `none` is unsupported. The numeric reasoning count is
  exposed as `usage.completion_tokens_details.reasoning_tokens` when supplied.
- [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions): supports
  top-level `reasoning_effort` and `max_completion_tokens` (`max_tokens` is a
  deprecated alias). `max_output_tokens` belongs to Responses and is rejected on
  Chat Completions. `verbosity` and stop sequences are unsupported for this path.
  The documented maximum generation limit is model-dependent; a context-window
  size is not a verified separate output ceiling.
- [Reasoning cookbook](https://dev.meta.ai/docs/cookbook/reasoning-thinking-tokens):
  shows the SDK reasoning-usage field and explains that higher effort spends more
  completion tokens. It does not establish the historical request's omitted-effort
  setting or token split. Its upper-effort discussion differs from the general
  guide; this fix uses only `low`, supported by both.
- [Structured output](https://dev.meta.ai/docs/structured-output): documents
  `json_schema` for extraction and classification. Constrained output does not make
  a completion that ended at its token limit a complete usable application result.

Prompt, history, payload and schema are input/context, not direct charges against
`max_completion_tokens`. Their complexity can affect reasoning and generated
length; that contribution was not measured in production. The initial request had
empty history. The existing Selection schema is only 2857 bytes under standard
JSON serialization, uses references for shared definitions, and has no verbose
field descriptions. It is not duplicated in the prompt. There is no evidence to
remove history, drop profile fields or weaken the schema. Repeating a full user
message in each profile evidence entry could inflate output; the new instruction
asks for the shortest sufficient exact excerpts without changing evidence checks.

## Chosen correction

1. Set `reasoning_effort='low'` explicitly for Selection only. It keeps reasoning
   enabled while reducing avoidable depth in a bounded extraction/selection task.
   The shared adapter forwards an optional effort; other stages omit it as before.
2. Request compact JSON, a short answer, concise questions and minimal exact
   evidence excerpts. Keep every supplied profile field, all required schema
   fields and the existing numerical, extraction, memory and proposal rules.
3. Keep the completion budget at **5000**, timeout at **50 seconds**, current
   endpoint/model, structured-output options and strict application validation.
   There is not yet evidence that a higher cap is required at low effort. Do not
   guess a larger budget from a context-window limit.
4. On another length stop, retain HTTP 502 / `ai_invalid_response` and correlation
   ID/header. Return: “Meta AI could not finish this reply. No changes were applied.
   Try a shorter question or continue with manual optimization.” No partial JSON,
   profile, fabricated success, retry or fallback is returned.
5. Add bounded numeric `reasoning_tokens` and allowlisted `reasoning_effort` to the
   existing sanitized rejection record. Missing or invalid usage stays null; a
   reasoning count must be an integer between zero and reported completion tokens.
   Raw reasoning, prompt, output and exception data are never logged.

This is a documentation-supported correction candidate, not a claim that live
reliability has already been demonstrated. Low effort is a guidance control, not a
hard reservation of visible-output tokens. A request can still exhaust its budget.
Unsupported deployment-specific settings must fail visibly, not trigger a hidden
second request or different provider.

## Verification

All new provider responses are injected. No live Meta request was made.

- Backend: **404 tests passed**; existing TestClient dependency warning.
- Frontend: **119 tests passed**, two opt-in integration tests skipped.
- Lint passed with the two existing CostBreakdown Fast Refresh warnings.
- TypeScript (`tsc -b`) and production build passed.
- Local HTTP/Chromium passed using the SDK-injected fixture and real optimizer.
  Desktop/mobile checks, exact result forwarding, causal grounding, explicit
  Compare/Apply and recovery after truncation passed.
- Public OpenAPI exactly matches pre-change main's production contract. Selection
  schema and all validation constraints are unchanged.

New regressions cover length stops with null, empty and partial content; completion
usage exactly at the limit; sanitized reasoning usage and invalid metadata; valid
completions below and at the cap; unchanged non-Selection call settings; complex
multi-turn Cedar Harbor extraction; unknown consumption; preserved profile/history;
manual recovery with no automatic retry; frontend error display and draft retention.
A real installed SDK with HTTPX MockTransport verifies wire serialization and JSON
schema settings without a network request. Existing strict-field, malformed JSON,
refusal, numerical grounding, result provenance and proposal tests remain passing.

Artifacts: `artifacts/completion-budget/{backend-tests.txt,frontend-tests.txt,lint.txt,
build.txt,browser-check.txt,browser.json,contracts.json}`. Reproduce with the repository
Python environment (`python -m pytest backend/tests -q`), then `npm test`,
`npm run lint`, and `npm run build` under frontend. Run
`scripts/serve_onboarding_fixture.py`, Vite on 127.0.0.1:5210 with
`VITE_API_BASE_URL=http://127.0.0.1:8210`, then
`PLAYWRIGHT_MODULE=<installed playwright> node scripts/verify_onboarding_browser.cjs`.
The fixture refuses Render and replaces the SDK; it is never a deployable fallback.

## Minimal production retest and demonstration gate

This work authorizes no deployment or live inference. The previous request budget
is exhausted. Review/merge and deployment need their normal explicit approval.

After an approved deployment, verify the current Live Render commit includes this
fix, then obtain **fresh explicit approval for one** detailed Cedar Harbor request.
Use the same prepared warehouse text and scenario with empty history/profile and
no stale result ID. Disable retries/redirects; send no optimizer or follow-up call.
Capture UTC time, application status/body and correlation metadata if present.

Acceptance requires HTTP 200, genuine `source=meta`, correct grounded supplied
business details, unknown consumption left missing, appropriate tailored questions,
no guaranteed 50% saving, and no unreviewed scenario change or solver calculation.
One successful request accepts that onboarding case; it does not prove multi-turn
production reliability or a success rate. Multi-turn coverage here is injected.

On failure, obtain the matching sanitized `Meta completion rejected` record. If
truncated again, examine reported reasoning usage at low effort before considering
any minimal bounded increase and its latency/cost implications. If the category
changes, address that actual evidence. Do not relax validation or send a second
request automatically. Until a successful approved live retest, detailed Energy
Advisor onboarding remains **not production-accepted for November 4**.
