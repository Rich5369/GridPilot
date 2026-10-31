# Savings responsiveness and release acceptance — October 31, 2026

Canonical frontend/backend contract: [Savings Advisor integration](../../meta-savings-integration.md).
Reviewed all 13 roadmap tasks (A1–A6, B1–B7) and the audit evidence bundle in the
original workspace. Only the targeted A2 correction and A3 handoff are implemented;
advanced calculators and frontend implementation remain outside this change.

## Confirmed defect and correction

`POST /api/ai/savings/conversation` with any valid request reaching a slow
synchronous provider call blocks its application worker's event loop. A minimal
fictional warehouse request, with no location or measurements, reproduces it;
no particular customer input, EIA request or genuine Meta call is necessary.
The root cause is the async handler directly calling synchronous `generate`,
which uses the synchronous OpenAI SDK. This establishes an integration defect,
not a provider outage.

Before editing, an injected 250 ms sleep delayed a 20 ms timer to **252 ms**;
the request took **252 ms**. After `await run_in_threadpool(generate, ...)`, the
timer completed in **23 ms** while the request took **274 ms**, with one provider
invocation in each run. Raw measurements: [before](before.json), [after](after.json).
These short local measurements are illustrative, not a production latency SLA.

The SDK default timeout remains 25 seconds with zero retries. Its network timeout
is not an end-to-end route deadline. Previously a stalled provider could block
other async requests on the same worker for the duration of that synchronous
work. This path can execute in production and stall concurrent calculations or
health requests during a live savings demonstration. Production occurrence and
latency were not measured. Thread offloading frees the loop; it does not cancel
SDK work, remove network latency or make the shared worker pool unlimited.

No calculator/optimizer math, output contracts, prompts, provider budgets,
exception categories or retry behavior changed. The existing HTTPException
fallback still preserves supported calculations and labels its source.

## Offline verification

- Full backend suite: **747 passed**, one pre-existing Starlette/httpx deprecation warning.
- New concurrency tests: both fail on unchanged main and pass after the correction.
  An injected provider waits on an explicit gate; health and deterministic savings
  requests must complete before release. Both success and provider-timeout paths
  verify one call, low reasoning effort, exclusions and exact preserved LED results.
- Existing injected SDK tests verify strict category validation, rejected financial
  fields, unknown-equipment investigations, missing-rate nulls, context grounding,
  truncation handling, labeled fallback and zero retries.
- Existing independent optimizer verifier: **200 exact-oracle cases** (96 feasible,
  104 infeasible), six representative cases and six stress cases passed.
- No paid inference requests. No frontend files changed. Original dirty work preserved.

Tests used an isolated checkout based on refreshed main
`89f20fb68aadf65346034bcf6fa25c7e463d2071`, reusing only the existing Python
dependency environment. Threaded tests required execution outside the sandbox,
consistent with the earlier audit's sandbox limitation; providers were injected.

## Deployment and production gates

Current **user-supplied** Render overview evidence identifies service `gridpilot-api`,
branch `main`, status **Live**, serving SHA
`99268894c60e833a814e4d737dcdcd5ac9000f32` (#50). This is a current observation,
not merely the historical deployment artifact. No independent control-plane read
was possible; deployment ID, service ID and deployment timestamp remain unknown.
See [attributed deployment evidence](render-evidence.json).

Fresh GitHub fetch still identifies main as `89f20fb68aadf65346034bcf6fa25c7e463d2071`.
Both #51's merge and implementation commit are ancestors of main, and the actual
call sets `reasoning_effort='low'`. Neither is an ancestor of the observed serving
#50 commit; its actual call lacks this argument. PR #52 remains open/unmerged,
and production #50 also lacks its thread offload. No merge, deployment, restart,
environment change or paid inference is authorized.

Fresh **15/15 production non-AI checks passed** against the user-identified #50
revision. These results do not accept #51 or #52 in production. The first health
request took **33.217 seconds**; subsequent probes took **0.026–0.854 seconds**.
No retry was sent. The initial delay's cause is not established by these timings;
do not attribute it to provider work or assume a Render cold start. No paid
provider call was involved. [Compact results](production-summary.json); full
fictional requests/responses and harness are retained in the original workspace's
`artifacts/backend-responsiveness-2026-10-31/`.

The same production probes must be repeated after a future approved deployment
is identified if they are to accept that revision. Once identity is established, use only
fictional requests and zero retries for the following deterministic checks:

| Probe | Required result |
| --- | --- |
| Catalog | HTTP 200, version 1, 16 categories |
| Empty office / warehouse profile, no measurements | All annual energy/financial estimates null; catalog-only entries remain investigations |
| [Complete office LED fixture](../savings-request.json), or same evidence with warehouse profile | 100 × (60−10)/1000 × 10 × 250 = 12,500 kWh/year; fictional $0.20/kWh → $2,500 gross/net, $2,500 upfront, 1-year payback, 100% simple annual ROI |
| Same fixture without customer rate, with full-state benchmark | 12,500 kWh; gross/net/payback/ROI null regardless of EIA benchmark availability |
| Same fixture without incremental expense | Gross $2,500; net/payback/ROI null |
| Same fixture without old wattage | Energy and dependent financial estimates null |
| Two measures sharing a load ID | Explicit overlap warning; portfolio savings null; no summed benefit |
| Boolean fixture count | HTTP 422 |
| Fixed-only no-EV optimizer | $4.80 → $4.80/day, 24 kWh |
| Non-EV flexible optimizer | $4.80 → approximately $3.20/day, 28 kWh unchanged |
| Fixed load above cap | Infeasible; optimized fields null |

For optimizer probes reuse the original audit's `check_optimizer_public.py`
fixtures and independent `backend.verification.accuracy.check_result`. Preserve
synthetic provenance, rate effective dates, equipment applicability and existing
daily/annual unit separation. Do not sum standalone measures or infer tariffs
from EIA. A deterministic-only request has per-measure applicability, not a
top-level category map; the frontend must filter its full catalog view.

## Prepared genuine Meta acceptance and freeze recommendation

Use the existing [warehouse fixture](../meta-savings-acceptance-request.json),
also checked into `backend/tests/fixtures/savings_warehouse_acceptance.json`.
The current #50 revision is insufficient. Do not send until the required fix is
confirmed Live and the user explicitly authorizes exactly one paid request. No automatic retry. Success requires genuine
`source: meta`, useful warehouse investigations/questions, no excluded scheduling,
refrigeration or compressed-air selection, exact pilot **2,000 kWh/year**, unknown
main-lighting energy, and null money/payback throughout. Profile/history must not
supply measurements. The same fixture already passes with injected SDK responses;
that is not genuine provider acceptance. On failure follow the canonical guide's
sanitized-log procedure before recommending another change.

Freeze backend API and numerical scope after review. Conditional go for a clearly
labeled deterministic API demonstration; hold a complete public AI savings release
claim until identified production revision, deterministic production acceptance,
authorized genuine Meta success, and the teammate's integrated browser journey
are recorded. No P0 numerical defect was reproduced. P0 release gates remain the
frontend savings journey and verified genuine Meta acceptance. This responsiveness
fix is the audit's targeted P1 reliability correction, pending review/deployment.
