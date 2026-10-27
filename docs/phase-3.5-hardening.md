# Phase 3.5: integration hardening and deployment handoff

## Changes

The optimization client uses `VITE_OPTIMIZATION_TIMEOUT_MS`, default **45000 ms**.
Valid configuration is a whole number from 1000 to 120000 ms; invalid, blank,
nonfinite and out-of-range values fall back to 45000. Use at least 30000 ms in
production; shorter values are useful for deliberate QA but can reject valid solves.
Vite embeds this public setting at build time: restart development or rebuild and
redeploy after changes. Health checks retain their separate five-second deadline.

The existing engine can run two sequential solves with ten-second limits each.
45 seconds allows twenty seconds of solving plus startup, scheduling and network
headroom. This is a client deadline, not a guarantee of maximum backend runtime.
Abort does not cancel solver work. Cold starts or overloaded services can still
exceed the deadline; the timeout message asks users to wait before retrying.

The Run button stays disabled and exposes `aria-busy` during requests. An immediate
ref guard also prevents repeated submissions before React updates the button.
Loading text states the configured deadline. Timeout handling accepts native
DOMException as well as Error instances. HTTP 422, 503 and 500 produce distinct,
safe messages. Existing results remain associated with their original submitted
scenario; failed requests do not overwrite them with fabricated values.

No shared models or engineering mathematics changed in this phase. Comparison
costs now explicitly state USD; amounts smaller than half a cent display as
$0.00 rather than negative zero, without altering API values. Power remains kW; daily consumption is kWh;
energy costs are sum(hourly kW × one hour × USD/kWh). Baseline and optimized
curves map to their respective response arrays; cost difference uses baseline
minus optimized, with signed increases preserved. Infeasible costs and optimized
schedules remain unavailable. Overview demo data is explicitly labeled and separate
from backend results. Conditional billing assumptions remain local display inputs:
demand exposure needs both a rate and independently supplied billing-period peak,
and its daily allocation is illustrative, not verified monthly savings.

## Repeatable browser QA

Optional tooling is separate from application dependencies:

```bash
npm install --prefix /tmp/gridpilot-browser playwright
/tmp/gridpilot-browser/node_modules/.bin/playwright install chromium
# Start backend on 8000 and frontend on 5173, then:
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/browser-qa.cjs
```

Screenshots and captured genuine request/result JSON go to
`/tmp/gridpilot-phase35-qa` (override with `GRIDPILOT_QA_OUTPUT`). Successful and
infeasible cases use actual FastAPI/GLOP execution. Fault injection is used only
for delayed delivery, HTTP/network errors and a stalled request to exercise the
native browser timeout. The script verifies modified inputs, displayed money,
24-hour arrays, site capacity, energy-cost arithmetic, responsive page overflow,
loading and repeat-submit handling. Screenshots complement these assertions.

## Render deployment configuration (not deployed)

Use a Python web service with repository root as its working directory:

| Setting | Value |
| --- | --- |
| Python version | `PYTHON_VERSION=3.14.2` (matches verified local runtime) |
| Build command | `pip install -r backend/requirements-lock.txt` |
| Start command | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |
| CORS_ORIGINS | Exact HTTPS Vercel production origin; comma-separate explicitly approved preview/custom origins |

The lockfile includes FastAPI, Pydantic, NumPy, OR-Tools and Uvicorn. The application
imports from repository root, so do not set Render's root directory to `backend`
with the command above. No AI credentials or database are required. Health is
liveness, not a solver-readiness check. Local `.env` files are ignored and should
not be uploaded; set environment values in Render.

These settings follow [Render's FastAPI guide](https://render.com/docs/deploy-fastapi)
and [Python-version configuration](https://render.com/docs/python-version).

The existing Vercel Vite project needs public build variables:

```text
VITE_API_BASE_URL=https://<your-service>.onrender.com
VITE_OPTIMIZATION_TIMEOUT_MS=45000
```

Use the backend origin without `/api` or trailing paths. Production deliberately
has no localhost fallback. Vite values are public and must never contain API keys.
Vercel environment changes require a new deployment:
[environment variable documentation](https://vercel.com/docs/environment-variables/managing-environment-variables).
Preview frontend domains need explicit CORS entries; wildcard subdomain strings
are not supported by the current exact-origin configuration. CORS is not access
control: the endpoint is unauthenticated and lacks rate limiting/admission limits.
Choose service capacity and evaluate public traffic controls before broad launch.

## Exact deployment sequence after approval

1. Review and commit the intended Phase 3 and 3.5 files separately from unrelated
   pre-existing changes. Push the reviewed branch only when authorized.
2. Create/configure the Render Python service using the settings above and the
   intended reviewed revision. Set its exact allowed frontend origins, then deploy.
3. Confirm `/api/health` and submit `sample_data/scenario.demo.json` to
   `/api/optimize`; verify 200, real feasible result, and 24-hour demand arrays.
   Submit the same scenario with fixed demand above the limit; verify 200
   infeasible and null optimized fields. Invalid `{}` must return 422.
4. Set the two public variables in the existing Vercel project's intended
   production/preview environment and redeploy that project. Keep any future
   Meta AI credentials backend-only.
5. From the deployed frontend, repeat configuration, feasible/infeasible, loading,
   mobile and offline checks. Inspect browser CORS/network errors and service logs;
   verify the production bundle calls the HTTPS Render origin rather than localhost.
6. Check cold-start latency and resource use before deciding whether 45 seconds
   and the selected service tier are sufficient. No cancellation, queueing or
   backend concurrency control is added here.


## Executed verification (2026-10-27)

- Backend pytest: **84 passed**, one existing upstream Starlette/httpx deprecation warning.
- Frontend Vitest: **36 passed**, one opt-in live test skipped in the standard run.
- Live TypeScript client integration: **1 passed**, real feasible and infeasible results.
- TypeScript project compilation and Vite production build: **passed**.
- Oxlint: **exit 0**, two existing Fast Refresh export warnings in CostBreakdown.tsx.
- Live smoke script: **passed**, including real feasible/infeasible optimization and validation/CORS.
- Chromium browser script: **passed**. Default sample restored, demand limit set to
  20 kW, EV energy set to 18 kWh, request body and real response inspected. Baseline
  cost $21.44, optimized cost $21.44 at display precision, peak reduced from 23.9
  to approximately 15.5 kW. No monetary savings were invented for this case.
- Real 1 kW site limit scenario: **infeasible**, reasons shown, optimized cost,
  cost difference and peak reduction unavailable; no optimized schedule returned.
- Six-second delayed delivery of a genuine backend response: loading and disabled
  button remained active beyond the former five-second limit; only one request.
- Injected HTTP 422/503/500 and network failure: distinct messages, retry enabled.
  Native Chromium 45-second stalled-request timeout: explanatory message and recovery.
- Desktop 1440px and all four views at 390/768/1024px: no horizontal page overflow,
  no browser runtime errors. Desktop and mobile screenshots visually inspected.
- Production lock dry-run with `--ignore-installed` on Python 3.14.2: resolved
  successfully, including Linux NumPy/OR-Tools wheels. This is a resolution check,
  not a clean environment install or an actual Render build.
- Tracked-file credential-pattern scan: no matches; no local secret `.env` files
  tracked. This is a limited pattern scan, not a guarantee against every secret type.
- Existing `frontend/.gitignore` change preserved; engineering modules unchanged.

The backend is prepared for a Render deployment using the configuration above.
Actual Render image compatibility, service resources/cold starts and HTTPS
production-origin CORS still require post-deployment verification. No commit,
push, merge, hosting configuration mutation, or deployment was performed.
