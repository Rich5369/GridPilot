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
GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration
```

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
