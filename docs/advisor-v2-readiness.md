# Advisor conversational usefulness and production readiness

Audit date: October 30, 2026 (Eastern). Deadline: November 4, 9 PM Eastern.

Main audited: `e390fca`, fetched from origin before implementation. Isolated branch:
`feature/advisor-contextual-guidance`; worktree `/tmp/gridpilot-advisor`.
Original working tree, including pending wire-header diagnostics, smoke tests,
CSS and local worktrees, is preserved. No solver implementation was changed.
No merge, deployment, environment change, paid request or live inference was performed.

## Repository and deployment findings

GitHub confirms #32 (deterministic insights), #33 (conversation), #36 (E1 device
plans), #37 (analytics) and #38 (honest line graphs) merged into audited main.
The only open PR returned by the audit was #39, structured infeasibility evidence.
Its branch is actively updated; this change consumes existing violation strings
and E1 quality/device contracts, not #39's pending fields. Existing advisor and
provider branches represent prior merged work; no open competing advisor PR was
found. Recent UI polish is present in main and retained.

Read-only hosted checks returned health 200 and OpenAPI 200, with conversation
routing present and new execution-ID fields absent. Health does not expose a
backend SHA. See `artifacts/advisor-v2/hosted-readonly.json`. Endpoint availability
is not inference acceptance. Earlier local production-audit artifacts recorded
matching frontend assets and backend contracts at an earlier revision; those
records do not establish the currently deployed implementation revision.

## Why answers were generic

The old Selection schema prohibited model prose. Meta selected coarse fact keys
and a clarification enum; Python replaced every answer with fixed text such as
“From your submitted engineering scenario:” or a general missing-data request.
Conceptual energy questions were explicitly routed to limitations. Relevant
business history reached Meta, but the response contract had no way to express
contextual advice. This was a deliberate grounding restriction, not evidence of
poor model capability. Provider failures return errors, not a hidden generic
fallback or mock conversation. Production mock mode remains prohibited.

The old process-local cache keyed only scenario plus mode and overwrote repeat
executions. The legacy /explain endpoint recomputed a new EV-only solve. Neither
was sufficient to establish exact execution provenance.

## Architecture and conversation workflow

Meta now returns typed qualitative `answer`, at most two `follow_up_questions`,
selected evidence keys, extracted profile with source quotations and existing
bounded proposal changes. It receives current profile, bounded user/assistant
history, actual submitted scenario, mode and server-owned facts. Model prose is
rendered as text, never HTML or executable instructions.

New profile values must be exact excerpts of a quoted user message; assistant
history cannot authorize extraction. Existing values survive model omissions.
Empty, N/A and unknown normalize to missing. The UI retains user edits and labels
extracted values as unconfirmed. Background, missing fields, engineering inputs
and verified result evidence remain separate. No employee-to-load or bill-to-tariff
calculation is introduced. A user can clear a field through the profile editor;
a model null does not erase existing memory. Natural-language extraction is
intentionally conservative and may reject normalization/rephrasing.

Prose cannot contain numeric characters, common spelled quantities, currency or
percentage symbols, or selected promise/feasibility phrases. Violations fail closed
with a truthful invalid-response error; no substitute answer is presented as Meta.
All displayed engineering quantities come from server-rendered scenario/result
facts. The model selects whole evidence blocks rather than authoring numerical
claims. This lexical safeguard is defense in depth, **not a semantic proof**:
novel quantity wording, unsupported qualitative causality and false negatives are
remaining evaluation risks. Actual Muse Spark adherence and usefulness must be
measured before claiming this is live-ready. There is no automatic retry that
could incur extra inference charges.

The prompt prioritizes interval demand and demand-charge information for warehouse
cost questions, followed progressively by charging requirements and readiness.
It distinguishes an ambitious business target from demonstrated savings, existing
demo inputs from business equipment, supported scheduling abstractions from actual
control, and same-day windows from unsupported midnight-crossing schedules.
Question relevance and avoiding repeated questions rely on model behavior; fixtures
validate transport and retention, not independently generated question quality.

Every API optimization now returns an opaque result ID. The bounded, immutable
server cache retains separate executions, including repeated identical inputs.
Conversation and legacy /explain require matching ID, exact inputs and mode to use
result facts. No handle, missing handle, restart, eviction or another worker yields
missing-result guidance (/explain: HTTP 409). Neither explanation path solves again.
Old API clients must retain and submit `result_id`; old results cannot be explained
until the user explicitly creates a new run. Backend/frontend should be released
together after review. The existing UI remains usable against older backends but
will lack retained-result evidence without handles.

Evidence includes modeled baseline/optimized daily charges and difference, peaks,
submitted prices and EV constraints, actual infeasibility reasons, E1 proof/tiebreak
and verification status, warnings, configured-device schedules, and deterministic
hourly charge rankings/headroom. Ranking requires an hourly-cost consistency check;
aggregate peaks are never individual-device attribution. No proposed schedules,
monthly bill forecasts or savings percentages are invented.

Only existing site-cap, all-EV same-day deadline and highest two-rate tariff changes
are supported. Proposal validation remains shared with the existing schema. Sending
a message never changes the draft or runs a solver. Explicit Apply updates the draft;
Compare prepares the existing alternative, whose explicit comparison runs the solver.
The frontend adapter must still round-trip the validated scenario exactly.

## Before and after transcripts

Before, **historical genuine local Meta selection with deterministic server text**:
`artifacts/energy-advisor/real-meta-conversation.json`. Business onboarding returned:
“From your submitted engineering scenario:” followed by background/limitations facts.
That historical Codespaces evidence is neither new inference nor Render acceptance.

After, **injected prose through actual FastAPI with real server/solver evidence**:
`artifacts/advisor-v2/conversation-transcripts.json`. These are regression fixtures,
not examples of newly generated Meta output.

User: “I operate a warehouse with 30 employees working from 7 AM to 7 PM. My
electricity bill is about $6,000 per month. We have four electric forklifts and
charge delivery trucks. I want to cut our electricity expenses by 50%.”

Advisor: “Charging flexibility may offer a useful starting point. Your bill reduction
goal needs measured consumption and a tariff breakdown before we can assess it.”

Follow-ups: “Do you have interval electricity consumption data? It helps distinguish
steady demand from charging peaks.” and “Does your bill include demand charges?
That determines whether peak power affects your total bill.”

User: “Interval consumption is unknown. Forklifts can charge after work. Would
overnight charging help?”

Advisor: “Cheaper tariff periods and charging flexibility could create an opportunity.
The current same-day model cannot represent a window crossing midnight. Your
equipment must be represented by supported scheduling inputs before it can be tested.”
It then asks about energy requirements and vehicle readiness instead of asking
again for the warehouse's employees, hours or bill.

Result question: “Why did optimization reduce my daily cost?” returns injected
qualitative explanation plus real baseline/optimized amounts, same-execution device
schedules and deterministic hourly cost ranking. These belong to the submitted
fictional engineering scenario, not a measured warehouse load.

Infeasibility question returns actual solver violations, proof status and warnings,
with no invented root cause. A site-cap proposal remains unexecuted until the
acceptance harness explicitly submits its reviewed alternative to the optimizer.
Full response payloads and outcomes are in the transcript artifact.

## Validation

- Backend: **300 passed**; one existing Starlette TestClient dependency warning.
- Frontend: **118 passed**, two opt-in integration cases skipped. Updated advisor
  regression separately passes all three tests, including question continuity and ID.
- TypeScript, production Vite build and lint pass. Lint retains two existing
  Fast Refresh export warnings in CostBreakdown.tsx.
- Chromium: real local HTTP optimization and unavailable provider; injected advisor
  responses for multi-turn context, result ID, keyboard submission, explicit
  Compare/Apply, desktop and mobile with no overflow or uncaught browser errors.
- axe targeted to advisor: **zero WCAG A/AA violations**. This is not a whole-site
  accessibility certification.
- Curated A–F: warehouse/memory, result Q&A, infeasibility, supported proposal,
  progressive context, unavailable provider. Provider fixtures cover bounded output,
  invented numeric text, unauthorized profile extraction, missing result handles,
  repeated identical solves, immutable cache and no implicit execution.
- Relevance/context/actionability examples are curated fixtures. Live model quality,
  real extraction compliance and timeout behavior with the expanded schema remain
  unmeasured. No quality score based on injected prose is claimed.

Reproduce: backend pytest; frontend npm test/lint/build; then
`MODEL_API_MODE=mock python -m scripts.verify_advisor_conversations`.
For Chromium, start mock backend on 8194 and frontend on 5194 with matching API URL
and CORS. Run `node scripts/verify_advisor_v2.cjs` with Playwright and axe available
through the optional PLAYWRIGHT_MODULE and AXE_PLAYWRIGHT_MODULE paths. No new
application dependency was added. Keep startup diagnostics disabled for offline
checks because the existing enabled startup diagnostic includes live inference.

## Meta production diagnosis and exact evidence request

Original endpoint/model remain unchanged: https://api.meta.ai/v1 and muse-spark-1.3.
Meta's [model documentation](https://dev.meta.ai/docs/models) still lists that model
with Chat Completions and structured output. No provider switch is justified.

Historical facts: local Codespaces inference succeeded; Render reported an empty
catalog and model_not_found; matching stored-key fingerprints weaken different-key
speculation. Stored key identity does not establish outgoing Authorization identity.
Pending edits in the original tree already test SDK custom-header overrides and
add outgoing credential fingerprints, version/build and proxy-presence diagnostics.
Those edits are not part of this PR and have not been deployed or overwritten.
No speculative production correction or separate duplicate diagnostics PR is made.

SDK custom headers can override Authorization; the existing SDK/direct-HTTP probes
also differ in configured base handling and header defaults. Model IDs are sanitized
in SDK listings, so zero sanitized IDs alone does not prove an empty raw catalog.
Inspect existing pending diagnostic evidence before changing credentials. Empty
catalog/404 does not prove geographic blocking, IP blocking or entitlement mismatch.

Please retrieve **existing sanitized evidence only**, without changing settings,
restarting, enabling diagnostics or calling inference:

1. Render service gridpilot-api-1tpf → Events: currently serving successful deploy
   SHA, deploy ID and timestamp. Settings: repository/branch, root directory,
   sanitized build/start commands, runtime, region, instance/worker counts.
2. Logs: existing `Meta diagnostic configuration`, status, models, models_http,
   inference and Meta API failure records from that deploy. Include timestamps,
   status/code, safe request IDs, raw/filtered counts, completeness/target-presence,
   phase and timeout origin. If no record exists, report absent.
3. Environment: **presence only** of OPENAI_CUSTOM_HEADERS, OPENAI_ORG_ID,
   OPENAI_PROJECT_ID, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY,
   MODEL_API_BASE_URL, MODEL_API_MODEL and diagnostic flags. Never reveal their
   values, keys, full headers or environment dumps. Provide existing endpoint/model
   agreement booleans and outgoing-auth comparison flags if already logged.
4. Service → Connect → Outbound: copy outbound IP ranges. This location is confirmed
   by [Render documentation](https://render.com/docs/outbound-ip-addresses).

Correct only a demonstrated header/endpoint/runtime discrepancy after explicit
approval. If wire auth and endpoint match but both catalogs are truly empty only
on Render, prepare a Meta support packet with request IDs, times, region/ranges
and contrasting local records; do not infer the provider's cause. No support message
was sent. Baseten access/compatibility/credits are unconfirmed; no automatic switch.

The safest demonstrated demo fallback is the existing Codespaces/local **whole
backend** with original Meta, subject to authorization and fresh live acceptance.
It is historical success, not proven production hosting reliability. Moving only
advisor inference would split its process-local optimization evidence; a separate
advisor host without result ownership is not a safe shortcut.

## Remaining deadline risks and recommended next step

Live behavior with the new schema has not been evaluated; no additional inference
was authorized. Render access remains unresolved. Cache misses across workers are
truthful but can interrupt a demonstration. Memory is session-only and bounded;
clear conversation/profile correction remains user controlled. The provider's
50-second timeout leaves limited headroom under the browser's 60-second budget.
No database, persistence redesign, new equipment action, solver change or UI redesign
is included.

Review this conversational PR independently of the existing diagnostic work. Next,
retrieve the sanitized Render evidence above and authorize a small, explicitly
bounded genuine Meta conversation evaluation on the reviewed revision. Use the
warehouse, verified-result and supported-proposal turns; count successful upstream
inference separately from local HTTP/browser mocks. Only after that acceptance
should a coordinated deployment be approved for the November 4 demonstration.
