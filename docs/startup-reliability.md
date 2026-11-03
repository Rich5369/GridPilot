# Startup reliability investigation — November 2, 2026

**Release decision: CONDITIONAL GO.** Current deterministic production checks pass.
One avoidable application startup cost is fixed in this branch, but it does not
eliminate platform spin-up. Genuine current Meta acceptance remains unverified.
This change has not been deployed. No frontend code, production configuration,
provider credentials, dependencies, optimizer or savings equations were changed.

## Evidence and root-cause assessment

Main remains `761f006493b6abc0a53f1f6674c1c3d734bed68a`, with no open PR at the
start of this investigation. Richard's previous dashboard observation reports
that revision Live on Render. A new independent serving revision, deployment ID,
timestamp and control-plane logs were unavailable in this session.

Three sequential production health observations, without deliberate idle waits:

| Request | HTTP | First byte | Total | TLS complete |
| --- | --- | --- | --- | --- |
| First | 200 | 33.330275 s | 33.330485 s | 0.064608 s |
| Second | 200 | 0.092365 s | 0.092559 s | 0.036492 s |
| Third | 200 | 0.089211 s | 0.089397 s | 0.033482 s |

The slow request completed November 2 at **4:36:33 PM Eastern**. Its Render
request ID is `0345cf7d-8b61-48bd`; response headers identify Uvicorn behind the
edge. This gives an exact log-correlation target for the service owner. It does
not reveal how much time the edge queued the request or when the app received it.

| Classification | Finding |
| --- | --- |
| Confirmed application inefficiency | With diagnostics disabled, lifespan still imported the diagnostic module and provider SDK. Fresh-process measurements show 0.664–0.701 s of avoidable local lifespan work. Four new isolation cases fail before the change. |
| Confirmed client compatibility issue | The health hook aborts after five seconds and labels the backend offline. A controlled browser delay reproduced this at 5.318 s; the actual first production response took 33.33 s. |
| Confirmed infrastructure behavior, not confirmed incident attribution | Render documents Free-service spin-down and request-driven spin-up. The supplied service tier and slow-first/fast-next observations are consistent with it. |
| Plausible primary cause | Instance spin-up and/or edge queueing. No service event/startup/request logs establish that this caused either the earlier 35-second timeout or the new 33-second wait. |
| Plausible additional cause | Production startup diagnostic flag may be enabled, or the runtime may differ from the documented configuration. Actual values and logs remain unknown. |
| Ruled out as the bulk of this measured wait | DNS/TCP/TLS: connection setup finished within 65 ms. Body transfer added about 0.2 ms. |
| Not reproduced as a 35-second local cause | Ordinary app import, OR-Tools import, and diagnostics-disabled startup networking. The baseline process reached startup-complete in 1.41–1.51 s locally; outbound audit hooks observed zero connect attempts during import/lifespan. Local hardware is not Render hardware. |

## Startup work and the narrow correction

`backend.main.lifespan` now checks the existing exact opt-in value
`MODEL_API_DIAGNOSTIC_ON_STARTUP == '1'` **before** importing the diagnostic
module or creating its task. Previously the flag check happened only inside the
already-imported diagnostic coroutine. Disabled values retain their original
meaning; enabled diagnostics retain their background execution and shutdown
cancellation behavior.

Live AI generation still imports its SDK on demand within existing worker-thread
paths. This moves optional SDK loading to the first AI request, not the first
health request. Python's normal import synchronization remains in use. Required
optimizer imports, solver errors and provider grounding/validation are unchanged.

Three serial fresh-process samples per revision, using the same Python 3.14.2
environment with diagnostics disabled and no simultaneous regression run:

| Local measurement | Main before: range / median | After: range / median |
| --- | --- | --- |
| App module import | 0.511–0.570 s / 0.544 s | 0.511–0.562 s / 0.561 s |
| Lifespan entry plus one event-loop yield | 0.664–0.701 s / 0.684 s | 0.000052–0.000077 s / 0.000052 s |
| Process launch to Uvicorn startup-complete log | 1.411–1.515 s / 1.415 s | 0.726–0.825 s / 0.758 s |
| First health response once startup-complete | 17.3–19.1 ms | 16.8–19.6 ms |

These small local samples show about **0.66 s less median process startup time**.
They do not establish an equivalent production improvement, eliminate a
33-second infrastructure delay, or form a latency SLA. Earlier measurements
with concurrent test load were retained separately and are not the comparison
used in this table.

The import-time profile attributes about 45 ms to OR-Tools `pywraplp`, not tens
of seconds. Solver construction occurs only when optimization runs. It was not
deferred. EIA loads a small state-name asset and constructs an in-memory service
at import; its network refresh is request-driven, bounded to eight seconds, and
uses a packaged snapshot on supported failures. It does not run during startup.

Health remains the existing lightweight liveness endpoint: no provider call,
optimization, external fetch or configuration disclosure. It is not a guarantee
that a live model or GLOP solve will succeed. Runtime solver failures keep their
existing 500/503 semantics rather than being presented as feasible results.

Startup diagnostics are opt-in, but when enabled they include an inference probe
as well as status/model checks. Their actual production flag is unverified. Do
not enable them, restart, or change configuration as part of this investigation.

## Render assessment and operating choices

Render documents that a Free web service spins down after 15 idle minutes;
the next request triggers spin-up, taking about a minute. A paid service compute
plan removes those Free limitations; changing only the workspace plan does not.
Backend code cannot remove that platform lifecycle. See
[Render Free services](https://render.com/docs/free).

Before the demo, make a deliberate health check and confirm readiness. With the
current hosting tier, allow a visible first-load wait and explicit recovery.
For reliable unattended judging, consider an appropriately configured paid
service instance with separate approval. No billing/hosting change or artificial
keep-alive system is implemented or recommended as a workaround.

The repository handoff documents this intended command, not verified live
settings: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, repository root,
`pip install -r backend/requirements-lock.txt`, health path `/api/health`.
Actual start/build commands, root, worker count and health-path configuration
still need dashboard evidence. Uvicorn's keep-alive timeout is not a request
execution or platform spin-up deadline. The source health endpoint is suitable
for liveness; no new readiness endpoint or unconditional solver probe was added.
Render's HTTP health checks require a response within five seconds **from an
instance**; that is distinct from a browser waiting for platform spin-up. See
[health checks](https://render.com/docs/health-checks) and
[web-service port configuration](https://render.com/docs/web-services).

## Frontend handoff — diagnosis only

| Operation | Current client budget | Behavior / recommendation |
| --- | --- | --- |
| Health | 5 s, including the hook's own abort timer | In `frontend/src/hooks/useBackendHealth.ts`, `useBackendHealth`, distinguish a pending first-load/readiness state from a confirmed service error. Make any longer initial wait bounded and user-visible; retain explicit retry/cancel. Do not indiscriminately extend normal requests. |
| Catalog | 12 s | `getSavingsCatalog` in `frontend/src/services/savings.ts`; may expire before platform spin-up. Keep known forms usable and offer explicit recovery after readiness. |
| Deterministic savings | 45 s | `calculateSavings` in the same file; preserve inputs and label old results after failure. This is distinct from readiness. |
| Optimization | 45 s default; 90 s in the previously byte-matched production build | `optimizeScenario` in `frontend/src/services/api.ts`; two solver phases can each take ten seconds. A client deadline does not stop server work. Retain one in-flight request and no automatic POST replay. |
| Savings Meta | 60 s | `converseSavings`; provider SDK timeout is 25 s plus deterministic/EIA/SDK-loading work. Pre-check readiness rather than automatically resending a paid call. |
| Daily Meta | 60 s | `send` in `frontend/src/components/ai/EnergyAssistant.tsx`; provider timeout is 50 s. Spin-up can exhaust the client budget before useful work finishes. Do not silently retry or append duplicate paid messages. |

Browser reproduction: create a fresh fictional savings workspace, hold its first
health response beyond five seconds, and leave an edited fixture count of 75.
The current UI reports **Backend offline** after 5.318 s and dispatches no
automatic retry. After removing the interception, **Retry backend connection**
reaches actual production, shows **Backend connected**, and retains the inputs.
The business and savings draft remain in browser storage. This is an injected
delay/recovery check, not a claim that a real Render outage was induced.

Acceptance criteria for the teammate: a 35-second first health response should
remain an understandable bounded warming/checking state until success or its
explicit readiness budget expires; unavailable service must remain distinguishable.
No calculation/Meta request should automatically replay when readiness recovers.
User input must survive failure/retry and current results must retain their
submitted-input association. Existing manual recovery works. A later successful
calculation does not itself refresh the independently maintained health badge.
No frontend implementation was changed.

## Both Meta systems: safe evidence and remaining acceptance

PR #51's low reasoning effort and #52's thread-pool call remain in main.
Savings calls synchronous generation through `run_in_threadpool`; Daily Advisor
is a synchronous FastAPI route, dispatched to the worker pool. This investigation
does not repeat that fix. Provider defaults use zero SDK retries; Savings allows
1,500 completion tokens / 25 s, Daily 5,000 / 50 s, both with low reasoning effort.
Those timeouts are network-operation budgets, not end-to-end deadlines.

An additional **26 offline route checks** passed using injected SDK transports
and local ASGI requests: both routes independently handle success, timeout,
authentication/rate/upstream errors, invalid/empty/truncated output, unexpected
transport exceptions, absent credentials, concurrent health/savings and client
cancellation. There are no unexpected HTTP 500s in those cases. Financial values,
equipment exclusions and single provider invocation are preserved.

Savings failures return labeled `deterministic_fallback` with safe calculations;
Daily failures return the existing 502/504/429/503 error, without inventing a
successful reply. The SDK wraps the injected unexpected transport exception as
a connection error; arbitrary application programming errors are not broadly
swallowed. A client cancellation does not guarantee cancellation of underlying
SDK/solver thread work. No retry is triggered by the tested cancellation.

Sanitized provider diagnostics retain bounded status/type/code/parameter/request
IDs. Completion rejection adds a correlation ID, declared-schema paths, finish
reason and numeric usage; it excludes prompts, raw bodies and credentials.
Current production credential presence, live mode, model/base URL, installed SDK
version, diagnostic flag and recent provider records remain **unverified**.
Existing retained October 31 Savings evidence records fallback; the new request
reports a prior genuine success. Neither establishes fresh current acceptance.
Historical Daily successes and one invalid-response failure likewise do not
accept the current revision. No paid request was made here.

The smallest proposed live test is **one** POST to
`https://gridpilot-api-1tpf.onrender.com/api/ai/savings/conversation`, using the
unchanged `docs/verification/meta-savings-acceptance-request.json`
(SHA-256 `6dd75292ed3f83f3ca62a62b1a008fbc9d5755fbb3930295b44140721936d9b0`).
Allow a 60-second client wait, no redirects/retries and no automatic follow-up.
First inspect existing sanitized configuration/logs and establish backend
readiness. Require `source: meta`, relevant category selection, confirmed
exclusions, exactly 2,000 kWh/year for the pilot, unknown main lighting, null
money/payback and useful missing-evidence questions. Fallback is a failed genuine
acceptance. On failure/timeout, stop and read only sanitized diagnostic metadata;
do not resubmit because the server may still be processing.

Daily requires separate authorization. Its minimal plan reuses
`sample_data/scenario.demo.json` and the existing question
“What are my modeled daily costs?” from `scripts/verify_advisor_meta.py`, with a
fresh deterministic result ID and matching mode/scenario. Send only that single
conversation POST, with a 60-second client wait and no retries. Require genuine
source, exact-result grounding and no invented financial claims/proposal.
**Do not run that script as-is: it contains four inference calls.** Authorization
for one Savings call cannot accept or authorize the separate Daily path.

## Regression and minimal release acceptance

From the isolated checkout, with the existing workspace venv:

```bash
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests/test_startup_isolation.py backend/tests/test_startup_diagnostic.py backend/tests/test_meta_smoke.py -q
# 34 passed, 7.50 s
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests -q
# 893 passed, 15.35 s; one existing Starlette/httpx deprecation warning
```

The four new fresh-process regressions failed on baseline and pass after the
guard. They reject SDK/diagnostic imports while also exercising real health and
the original 80.64 USD optimizer fixture. The enabled diagnostic test explicitly
opts in and still verifies non-waiting startup and cancellation. No full separate
mathematical audit or frontend rebuild was repeated for this lifespan change.

Current production, before this proposed fix is deployed, also passes one
official LED request (12,500 kWh/year, 2,500 USD gross/net, one-year payback;
0.571 s), one independently checked original EV optimization (80.64 USD;
0.113 s), and one invalid numerical request (422; 0.029 s). These observations do
not demonstrate deployment of the branch.

For a future separately approved deployment: verify the Live full SHA/ID/time,
build/start command, health path and existing diagnostic flag first. Check health
once with measured first-byte/total times and an explicit client budget; one
immediate follow-up is sufficient. Replay one LED, one original optimization and
one invalid request; verify browser recovery without changing frontend source.
Use offline provider evidence for both routes until individual live requests
are authorized. Do not infer deployed improvements from local tests or a merge.

Remaining demo risks are initial infrastructure delay, misleading first-health
wording, unverified runtime/provider configuration and genuine Meta behavior,
finite worker-pool capacity, and process-local result IDs lost after restart or
eviction. Exact-result loss must produce unavailable context, not a new fabricated
explanation. No unrequested hosting, retry, timeout-budget or solver changes are
included. Review the dedicated branch/PR; do not merge or deploy automatically.
