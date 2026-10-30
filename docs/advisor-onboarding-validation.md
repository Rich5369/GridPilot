# Advisor completion diagnostics and grounded cost explanations

## Historical failure: what is known

The October 30, 2026 production audit recorded a detailed fictional warehouse
onboarding request failing at approximately 6:27:27–6:27:48 PM Eastern with HTTP
502 / ai_invalid_response. Fresh proposal, retained-result explanation and a
multi-turn warehouse follow-up subsequently succeeded with source=meta. The
historical Render model-access issue is not the problem being fixed here.

The saved audit and the user's existing Render logs contain only HTTP access
outcomes. They contain no failed completion, finish reason, token usage, validation
field error or upstream request ID. Main caught completion/parse/schema exceptions
and discarded the distinction. **The historical onboarding root cause is still
undetermined. This PR fixes that diagnostic blind spot; it does not claim that
onboarding's production failure has been repaired or reproduced.**

The generic error could represent a length/incomplete finish, refusal, malformed
completion envelope, empty/invalid JSON, a required field/type/enum/length mismatch,
or another SDK response-processing error. Incoming request validation normally
returns 422 rather than this 502. The recorded request fits the incoming request
contract, but its output cannot be assessed from an HTTP access log. A warehouse
profile with unknown consumption is valid, as the synthetic success regression
shows. That regression is not the missing real completion.

There is no evidence supporting a token-budget increase, lenient type coercion,
JSON repair, schema relaxation, another provider/key, retries or a hosting change.
None is introduced. The conversation budget stays 5000 completion tokens / 50 s;
SDK retries remain zero. Endpoint, model selection, authorization, SDK call shape
and structured-output settings are unchanged.

## Changes

| File | Purpose |
|---|---|
| backend/ai/completion_diagnostics.py | Classify rejected completions; project schema error paths/types into content-free metadata; generate correlation IDs |
| backend/ai/service.py | Use the strict diagnostic parser; preserve provider error handling and SDK response-processing 502 behavior |
| backend/ai/cost_attribution.py | Reconcile device costs with submitted prices and same-execution demand/cost; render conservative result-cost summaries |
| backend/ai/advisor.py | Supply device accounting evidence and use protected summaries for direct result-cost/result explanations; preserve contextual advice elsewhere |
| backend/tests/test_completion_diagnostics.py | Synthetic onboarding, truncation, malformed JSON/envelopes, required/type/enum/length errors, privacy, token metadata and expected HTTP statuses |
| backend/tests/test_cost_attribution.py | Actual solver accounting, unchanged equipment, adversarial attribution prose, missing/unreconciled/infeasible/flat-tariff evidence and numerical safety |
| scripts/serve_onboarding_fixture.py | Localhost-only application with SDK completions injected; refuses to run on Render |
| scripts/verify_onboarding_browser.cjs | Actual local HTTP/Chromium checks, real optimizer, injected SDK completions, explicit Compare/Apply |
| docs/advisor-onboarding-validation.md | Findings, compatibility, evidence and production acceptance instructions |

Committed verification artifacts under artifacts/onboarding-validation:
audit-evidence.json, backend-tests.txt, browser-check.txt, browser.json,
contracts.json, diagnostic-example.json and frontend-checks.txt.

## Diagnostic contract and privacy

A rejected completion records only:

- Static failure category and server-declared schema name.
- Allowlisted finish reason, content-present/refusal-present booleans, configured
  token budget and bounded numeric completion-token usage when supplied by the SDK.
- A fresh server-generated correlation ID and sanitized SDK upstream request ID
  when available.
- Client response status 502 and upstream success class 2xx if the SDK returned a
  completion. The typed SDK return does not expose the exact HTTP status, so the
  diagnostic does not invent one. Existing provider-exception logs retain exact
  upstream error statuses where available.
- Up to twelve validation entries: declared schema field path, static error code,
  expected type and received type. Additional errors are flagged as truncated.

Never serialized: prompts, request/history/profile values, raw completion text,
validation messages/inputs/context, exceptions or tracebacks, headers, credentials,
and arbitrary extra-field or map-key names. Dynamic keys become `*`; array indices
become `[]`. Unknown finish reasons become `other`. Type labels contain no values.

Failure categories: truncated, incomplete_completion, refusal, empty_content,
json_parsing, schema_validation, malformed_response and response_processing.

The existing public error code/message and status stay unchanged. Invalid completion
errors additionally return detail.request_id and X-Request-ID, matching the logged
correlation ID. The existing frontend reads detail.message and remains compatible.
No diagnostic endpoint or startup probe is added. No model retry or fallback runs.
Examples in diagnostic-example.json are **synthetic**, not a diagnosis of the
historical production completion.

## Causal explanation safeguard

The audit's successful prose loosely attributed lower cost to charging and flexible
use, although deterministic same-solve accounting showed the flexible equipment
cost remained USD 0.7200. The observed aggregate improvement came from EV schedule
cost differences. This is an actual qualitative-grounding weakness, distinct from
the unknown onboarding failure.

For direct result-cost explanations (including “Explain this optimization result”
and “What made the optimized schedule cheaper?”), the API now supplies conservative
server-authored aggregate wording. It does not let model prose claim that a named
device or load class caused the saving. Meta still supplies contextual conversation,
profile extraction, evidence selection and follow-up questions; other business advice
stays contextual. Model text is still checked for unsupported numerical assertions
before the protected summary is selected.

Device costs are sum(hourly returned device power × submitted hourly price).
Device accounting is displayed only if the exact retained plan has passed
verification, matches scheduling mode, and reconciles both hourly aggregate demand
and reported energy costs. Unchanged device costs explicitly show zero difference;
missing, stale, infeasible or inconsistent evidence does not establish device
contributions. These are accounting differences, not a counterfactual proof of
unique real-world causation. No solver is run by explanation handling.

This is a focused safeguard for explicit result explanations. General qualitative
advice still depends on the existing prompt and numerical-output guard; this PR does
not claim a universal semantic proof over unrestricted natural language.

## 422 and 409 access-log review

The prior audit deliberately sent an empty conversation request and received 422.
It deliberately sent four legacy explanation requests with missing/nonexistent
result IDs, wrong mode or changed submitted inputs and received 409. Those recorded
cases are expected validation/provenance behavior, not observed regressions.

The user supplied untimestamped access-log outcomes match those statuses, but the
logs alone cannot prove that every 422/409 entry came from these tests. An actual
user report with timestamps and payload shape should be investigated separately.

Regression tests confirm that empty conversation requests return 422 and missing
legacy explanation handles return 409 **without invoking the model**. The active
frontend uses /conversation and forwards result_id; /explain is a legacy endpoint
whose positive path remains covered by existing injected-provider tests.

## Verification

- Backend: **389 tests passed**, with one existing TestClient dependency warning.
- Frontend: **118 tests passed**, two opt-in integration tests skipped.
- Lint, TypeScript and production build passed; two existing CostBreakdown Fast
  Refresh export warnings remain.
- Generated public OpenAPI is identical to audited production. No conversation,
  scenario, result, proposal or legacy explanation request/response schema changed.
  Error correlation metadata is additive.
- Chromium passed detailed onboarding through strict extraction/grounding using a
  valid synthetic completion, multi-turn profile/history retention, exact result
  ID forwarding, rejection of a synthetic truncated completion, matching correlation
  ID/header, recovery after failure, unchanged-device cost evidence and replacement
  of adversarial causal prose.
- Explicit Compare triggers real local optimizer comparisons; Apply changes the
  draft only after review. Desktop/mobile overflow and uncaught-error checks pass.
- Privacy regressions use canaries in raw content, refusals, invalid field values,
  dynamic keys, unknown finish reasons and SDK exceptions. None appear in logs or
  public error responses. No automatic inference retry is introduced.

All provider behavior in these new regressions is injected. No additional live
Meta request was made; the prior four-request authorization remains exhausted.
No production deployment, Render restart, credential/configuration change, solver
change or unrelated UI edit is included. Original working-tree changes were kept
in place; implementation uses an isolated worktree based on main 477e502.

Reproduce backend tests with the repository Python environment. For local HTTP:
run scripts/serve_onboarding_fixture.py, then frontend Vite on 127.0.0.1:5210 with
VITE_API_BASE_URL=http://127.0.0.1:8210. Run scripts/verify_onboarding_browser.cjs
with Playwright available via PLAYWRIGHT_MODULE if necessary. The fixture harness
patches the SDK and is not an application/provider fallback or deployable backend.
No new dependency was added.

## Remaining P0 acceptance step

The historical cause cannot be recovered from logs that never recorded it. Review
this PR before any production change. A deployment requires approval. After an
approved deployment, a **separately approved single** detailed warehouse onboarding
request can produce either a success or actionable sanitized failure metadata.
Do not enable startup diagnostics or repeat catalog/key troubleshooting.

If it fails, retain the correlation ID and matching `Meta completion rejected`
record. A length finish and token metadata support investigating truncation; an
explicit schema path/type supports fixing that mismatch; json_parsing or envelope
categories support their corresponding parser/provider investigation. Choose the
functional correction only after that evidence, and retain strict validation and
negative regressions. Unknown consumption must remain missing, never calculated
from employees or a monthly bill.

**This PR is review-ready diagnostic remediation plus a verified causal-grounding
fix. It does not close the P0 production onboarding acceptance gap.**
