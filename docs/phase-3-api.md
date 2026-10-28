# Phase 3: real optimization through FastAPI

`POST /api/optimize` now calls the existing EE-owned
`backend.optimizer.interface.optimize_scenario`. The synchronous route runs in
FastAPI's worker thread pool. No simulator or optimizer mathematics changed.

## Install and run

From repository root, Python 3.12+:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
backend/.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
```

On Windows use `backend\.venv\Scripts\python.exe`. The main runtime requirements
now include NumPy and OR-Tools, and the application lock uses the already verified
engineering snapshot. The existing engineering lock is unchanged; its direct
requirements include the shared application requirements. For deliberate upgrades,
install `backend/requirements.txt`, verify, and regenerate/review lockfiles together.

In another terminal:

```bash
curl -i http://localhost:8000/api/optimize \
  -H 'Content-Type: application/json' \
  --data-binary @sample_data/scenario.demo.json
npm --prefix frontend run dev
```

Configure `VITE_API_BASE_URL` and backend `CORS_ORIGINS` for non-local origins as
described in the root README. No deployment or credentials are needed locally.

## Responses

- **200 feasible:** the existing `OptimizationResult`, including baseline and
  optimized 24-hour average kW arrays, peaks in kW, daily energy costs in USD,
  and empty `constraint_violations`. The demo scenario optimizes to about $80.64.
- **200 infeasible:** the same contract, baseline values and meaningful reasons;
  all three optimized fields are explicitly null. No fabricated schedule.
- **422:** normal FastAPI/Pydantic validation errors for invalid request schemas.
- **503 `optimization_unresolved`:** `OptimizationUnresolvedError`; mathematical
  infeasibility was not established.
- **503 `solver_unavailable`:** `OptimizationSolverError` before the primary solve
  (`outcome.primary_status == "not_run"`), including unavailable GLOP or solver
  initialization failures. The engine has no separate unavailable exception.
- **500 `solver_error`:** `OptimizationSolverError` after the primary solve began.
- **500 `verification_failed`:** `OptimizationVerificationError`.
- **500 `optimization_error`:** unexpected failures, including invalid adapter output.

Service errors have the stable shape
`{"detail":{"code":"solver_error","message":"The optimization solver failed. No result was returned."}}`.
Underlying exceptions are logged server-side; responses omit internal diagnostics
and stack traces. Health reports application availability, not solver readiness.

## Frontend and modeling boundaries

The existing TypeScript `OptimizationResult` and runtime validator accept the
actual JSON, including explicit null optimized fields on infeasibility. No shared
field names, units, or model validations changed. The dashboard already sends
scenario requests and renders the comparison; its overview remains a demo fixture.
The live client integration test exercises both result variants through the same
`optimizeScenario` function used by the dashboard.

Only EV charging is optimized: arrival/deadline windows, charger power, exact
energy and the shared building limit are enforced. Background, supplied HVAC,
and flexible equipment remain at their baseline schedules. Infeasibility is
relative to these held schedules, not proof that rescheduling equipment could
never work. Baseline overlap violations do not by themselves prove optimization
infeasible. The baseline can contain partial energy delivery for requests beyond
window capacity, as documented by EE.

The API adapter uses the energy-only objective, with peak minimization as a
secondary tie-break. Costs exclude demand charges and fixed fees. Advanced HVAC
optimization, flexible-equipment optimization, and Meta AI are not implemented.
A verified feasible result is not necessarily a proof of global optimality: the
existing shared schema intentionally exposes feasibility only. Richer solver
status/warnings would require a jointly reviewed contract extension.

Optimization now defaults to a configurable 45-second timeout; health checks stay
at five seconds. See [Phase 3.5](phase-3.5-hardening.md) for timeout bounds,
browser QA, remaining cancellation limits, and deployment instructions.

## Verification

```bash
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
# With local backend and frontend running:
backend/.venv/bin/python scripts/smoke.py
backend/.venv/bin/python scripts/verify_optimizer_http.py
GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration
```

The same numerical verifier can target an already-running hosted backend. Supply
its actual HTTP(S) origin, without `/api` or other paths:

```bash
backend/.venv/bin/python scripts/verify_optimizer_http.py --base-url "$GRIDPILOT_BACKEND_ORIGIN"
```

Set `GRIDPILOT_BACKEND_ORIGIN` to the backend URL supplied by the deployment owner;
do not substitute a frontend URL or the documentation's example Render hostname.
Omitting `--base-url` preserves `http://127.0.0.1:8000`. A trailing slash is accepted.
The verifier prints its target, keeps the 45-second timeout, and posts each existing
`config.scenario` to `/api/optimize`. It compares hosted results with independent
local engine calls using the existing 1e-6 kW/kWh and 2e-7 USD tolerances, allowing
equivalent optimal schedules. It does not start, stop or configure the target.
HTTP errors, malformed responses and failed numerical checks exit nonzero; PASS
is printed only after all three cases succeed. Run without `-O` or
`PYTHONOPTIMIZE`, because the existing numerical checks use Python assertions;
the script rejects optimized mode rather than silently skipping those checks.
The infeasible example's $6 baseline cost covers incomplete service and is not a
valid savings benchmark.

Phase 2 and foundation verification documents record historical results; their
501 checks describe the old endpoint. Current smoke and live-client checks expect
real optimization responses.

Executed verification for this integration:

- Backend pytest: 84 passed; one upstream Starlette/httpx deprecation warning.
- Frontend unit tests: 27 passed, one opt-in live test skipped.
- Frontend production build: passed.
- Frontend lint: exit 0; two existing Fast Refresh export warnings in CostBreakdown.tsx.
- Live smoke script: passed, including genuine feasible/infeasible optimization,
  validation, health, docs, CORS and Vite HTTP serving.
- Opt-in TypeScript live API test: one passed; actual feasible and infeasible
  responses accepted by the production runtime validator.
- Installed dependency consistency (`pip check`): no broken requirements.

Local servers and backend tests required execution outside the restricted sandbox.
No fresh dependency installation or browser visual QA was performed; the existing
local environment was used. No commits, pushes, merges or deployments were made.

### Checklist re-verification (2026-10-27)

Remote main at `c9cda1f` includes merged PR #5 and the existing integration commit
`e4b42f9`; no competing route implementation was needed. Re-verification used
`feature/phase-3-optimization-integration`, whose source matches that merge.

`scripts/verify_optimizer_http.py` now submits only each demonstration's
`config.scenario` to a real local Uvicorn server and compares it with an independent
`optimize_scenario` call. It checks feasibility, reasons/nulls, energy-only costs,
peaks, aggregate energy, cost arithmetic and capacity. It uses absolute 1e-6
power/energy and 2e-7 USD tolerances, preserves full precision, and permits
equivalent optimal demand arrays. Run it with Python assertions enabled.

| Case | HTTP | Baseline → optimized energy USD | Baseline → optimized peak kW |
| --- | --- | --- | --- |
| price_shift | 200 feasible | 7.9 → 7.3000001 | 3 → 2.999999666666665 |
| tight_cap | 200 feasible | 5.6000000000000005 → 5.6000000000000005 | 5 → 3 |
| infeasible | 200 infeasible with reasons | 6 → null | 5 → null |

The infeasible baseline delivers incomplete requested EV energy: its $6 is not
a valid savings comparison. The tiny price-shift cost excess is the documented
primary-cost tolerance used during peak minimization.

Fresh checks passed: 84 backend tests, 36 frontend tests (one opt-in test skipped),
one live TypeScript-client test, production build, HTTP smoke check, three-case
HTTP/direct comparison, and `pip check`. Lint exits successfully with two existing
Fast Refresh warnings; backend tests emit the existing TestClient deprecation.
The smoke client's optimization timeout now matches the 45-second browser budget.
Browser QA additionally asserts the demo label, displayed peak reduction and
stale-result notice after editing inputs.
The fresh Chromium run passed the real browser-to-solver flow, feasible and
infeasible displays, changed-input request contents, stale-result warning,
six-second delayed response, 422/503/500/network failures, native 45-second
timeout and recovery, and desktop/mobile overflow checks. Captured artifacts
are in `/tmp/gridpilot-phase35-qa`; the desktop feasible screenshot was visually
inspected. The browser scenario returned $21.44 → $21.440000100000002 and
23.9 → 15.499999875 kW, displayed as $21.44 → $21.44 and 8.40 kW peak reduction.
No remaining local integration blocker was found. No push, merge or deployment
was performed; the pre-existing `frontend/.gitignore` edit was preserved.

### Hosted numerical acceptance (2026-10-27)

Verified from `test/hosted-numerical-verification`, based on current remote main
`7b91b4245470cbd6a119ea3282a848af19029423` (merged PR #6). No newer main
revision was available. The verifier change adds external targeting only; the
optimizer, scenarios, shared contracts, routes and frontend remain unchanged.

Actual targets were discovered rather than inferred:

- Public frontend: `https://gridpilot-weld.vercel.app`, from the repository homepage.
- Backend: `https://gridpilot-api-1tpf.onrender.com`, from that frontend's published
  JavaScript bundle. The bundle configures a 90000 ms optimization timeout.
- PR preview URLs redirect to Vercel authentication; they were not used as evidence
  of application connectivity. GitHub's deployment list supplied no backend URL.

Run the hosted numerical check:

```bash
backend/.venv/bin/python scripts/verify_optimizer_http.py --base-url https://gridpilot-api-1tpf.onrender.com
```

All three cases returned HTTP 200 and matched independent local engine calls:

| Case | Feasibility | Baseline / optimized energy USD | Baseline / optimized peak kW |
| --- | --- | --- | --- |
| price_shift | feasible | 7.9 / 7.3000001 | 3 / 2.999999666666665 |
| tight_cap | feasible | 5.6000000000000005 / 5.6000000000000005 | 5 / 3 |
| infeasible | infeasible, with reasons | 6 / null | 5 / null |

The first hosted attempt exited unsuccessfully with a 45-second read timeout on
its first optimization request and printed no PASS. A later health check returned
200, and one retry passed all three cases. Startup delay is a possible explanation,
not a diagnosis from service logs. The verifier deliberately retains its required
45-second request timeout; the deployed frontend currently allows 90 seconds.
The passing retry establishes numerical correctness for those responses, not a
cold-start latency guarantee. The infeasible baseline still represents incomplete
service, so its cost is not a savings benchmark.

Local regression checks also passed against a temporary Uvicorn server using both
the default localhost target and an explicit origin with a trailing slash. Deliberate
HTTP 503, malformed JSON, malformed result schema and incorrect cost responses
all exited nonzero without PASS. Invalid `/api` target paths and optimized Python
mode were rejected. These failure cases were local test responses, not failures
injected into the hosted backend.

Focused Chromium QA reused the feasible/infeasible portion of
`scripts/browser-qa.cjs` in a temporary script, targeting the public frontend.
No hosted responses were mocked. The complete submitted Scenarios and responses
were captured and compared with independent `optimize_scenario` calls:

- With a 20 kW limit and 18 kWh per EV, the hosted browser response was feasible:
  energy costs $21.44 / $21.440000100000002, peaks 23.9 / 15.499999875 kW.
  The UI correctly displayed $21.44 / $21.44, $0.00 cost difference and 8.40 kW
  peak reduction. Inputs included the frontend's actual background/HVAC profile
  and flexible load; the synthetic CLI scenarios were not substituted.
- Changing the limit to 1 kW marked the old result stale before submission. The
  new response was infeasible, with reasons and all optimized fields null. The
  comparison replaced optimized cost, cost difference and peak reduction with
  Unavailable. Baseline values remained displayed as baseline values.
- Cost arithmetic, peak-from-demand, aggregate energy, capacity and feasibility
  matched direct engine results within the documented tolerances. Backend CORS
  preflight explicitly allowed the public frontend origin. No browser page errors
  were observed in this focused run.

Temporary evidence is under `/tmp/gridpilot-hosted-qa`: `real-result.json`,
`infeasible-result.json`, and desktop screenshots of overview and both result
states. The focused browser command was:

```bash
NODE_PATH=/tmp/gridpilot-browser/node_modules node /tmp/gridpilot-hosted-browser-qa.cjs
```

The temporary script and artifacts are workspace-local, not committed fixtures or
application dependencies. Optional Playwright/Chromium tooling and its required
system libraries were installed for this check. This run did not repeat the full
mobile/error/timeout browser suite recorded above. No hosting settings, deployment,
external-service lifecycle, optimizer mathematics or application dependencies were
changed. Status: verifier ready; hosted backend numerical checks passed on retry;
hosted feasible/infeasible browser flow verified, with initial latency noted above.
