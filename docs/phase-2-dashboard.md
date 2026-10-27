# Phase 2: interactive dashboard

Implemented locally on `feature/interactive-dashboard`. No backend files, deployment settings, project dependencies or lockfiles changed. The pre-existing modification to `frontend/.gitignore` is unrelated to this phase and should be reviewed separately before staging.

## What is implemented

- Responsive navigation: Energy overview, Scenario configuration, Optimization, AI assistant.
- Overview: daily kWh, daily energy charges, hourly peak kW, displayed fixture limit and current draft limit.
- Stacked hourly average demand for background, HVAC, two EV chargers and flexible equipment; total-demand line and building-limit reference line, legend, hover tooltips, all 24 intervals in an accessible table.
- Cost breakdown: energy, explicitly configured fixed daily charges, optional conditional demand-charge allocation, and clearly qualified subtotal/total.
- Configuration: opening/closing hours, demand limit, time-of-use tariff, 0–2 identical EV charging requirements, flexible equipment power/duration/window, validation, feasibility warnings, draft summary and reset.
- Real request handling: GET `/api/health`, POST `/api/optimize`, loading state, retry for health, timeout/network/HTTP errors, runtime result validation, 501 and even HTTP 200 `not_implemented` rejection.
- Comparison: empty state until a valid backend response exists; backend baseline/optimized curves, energy costs, signed cost difference, peak reduction, feasibility and violations. Results retain their submitted configuration identity when draft inputs change.
- AI panel: example prompts, explicitly disconnected, no messaging or external AI calls.

## Data and modeling boundaries

`frontend/src/data/demoScenario.ts` is the deterministic fixture. Background is 1.5 kW for all 24 intervals; HVAC is predetermined; each EV uses 7.2 kW at hours 9 and 10 (14.4 kWh each); equipment uses 3 kW at hours 10 and 11 (6 kWh). Peak pricing is $0.28/kWh during [14, 20), otherwise $0.12/kWh. The demo building limit is 25 kW.

Totals: **128.8 kWh**, **$20.576** daily energy charges (displayed as $20.58), **23.9 kW** maximum hourly demand. These are arithmetic over a fictional fixture, not output from the future simulator or optimizer. No sample optimization success is shown.

Inputs and results are separate. Editing or resetting scenario fields never recalculates the fixture. Draft inputs persist across navigation but not a page reload. Billing assumptions also persist across navigation and take effect only after “Apply cost assumptions.” They are local display assumptions, not part of the optimization API payload.

Hourly energy charges are kW × 1 hour × USD/kWh. Default fixed utility charge is explicitly $0/day. Demand charges remain unavailable without BOTH a rate and an independently supplied assumed billing-period peak. Exposure = rate × assumed billing peak; illustrative daily allocation = exposure / billing days. This does not infer a monthly peak from the displayed day or model utility ratchets, taxes or sub-hourly measurements. When absent, the total is labeled a known daily subtotal.

## API compatibility

No backend contract updates are required for Phase 2. `backend/models/contracts.py` remains authoritative and `frontend/src/types/api.ts` is unchanged.

`toScenario` is the sole editor-to-API adapter:

- Background plus predetermined HVAC populate `fixed_demand_kw`, excluding EV and flexible loads.
- Opening hours are metadata, matching the current contract; they do not regenerate HVAC or suppress fixed demand.
- Time-of-use controls expand to 24 prices.
- Shared EV editor values expand to separate uniquely identified EV requirements.
- Flexible duration × maximum power becomes `energy_required_kwh`. The backend currently models interruptible energy delivery, not mandatory contiguous run time.
- Windows are same-day, whole-hour, end-exclusive; overnight windows are rejected clearly.
- The UI currently accepts nonnegative retail prices; the broader backend contract also allows negative prices.
- Physically infeasible requirements are warned about and preserved, rather than silently reduced. Backend feasibility assessment remains necessary.

The future optimizer should return the existing `OptimizationResult` schema from `/api/optimize`. The comparison accepts feasible and infeasible results. A future simulator integration can populate `SimulationResult` for the demand chart, but no simulation endpoint is invented in this phase. Revisit the contract together if future HVAC controls, contiguous equipment operation, heterogeneous charger editing or monthly tariffs require more fields.

## Files

Modified:

- `frontend/src/pages/Dashboard.tsx`: view state, draft/result separation, layout, request flow.
- `frontend/src/components/EnergyChart.tsx`: composable demand chart and hourly table.
- `frontend/src/services/api.ts`: production-safe URL handling, optimize request and response validation.
- `frontend/src/index.css`: responsive workspace, forms, costs, comparisons and assistant styles.
- `README.md`: link to this handoff.

Created:

- `frontend/src/types/dashboard.ts`: editor, schedule, tariff, simulation and feasibility types, reusing API types.
- `frontend/src/data/demoScenario.ts` and `.test.ts`: fixture, adapter, validation, arithmetic tests.
- `frontend/src/components/configuration/ScenarioPanel.tsx`.
- `frontend/src/components/dashboard/CostBreakdown.tsx` and `Comparison.tsx`.
- `frontend/src/components/ai/EnergyAssistant.tsx`.
- `frontend/src/pages/Dashboard.test.tsx` and `frontend/src/services/api.test.ts`.
- `docs/phase-2-dashboard.md`: this handoff.

## Local development

```bash
cd frontend
npm ci
npm run dev
```

The frontend serves on port 5173. Development defaults to `http://localhost:8000`. Optionally copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to your API origin (without `/api`). Browser-exposed Vite variables must never contain credentials.

To start the existing API from the repository root:

```bash
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Production has no localhost fallback: if `VITE_API_BASE_URL` is absent, demo mode works and optimization explains that the backend is not configured. Set an API origin in the existing Vercel project only when a backend is actually deployed, with its CORS origin configured appropriately. No production settings were changed.

## Verification commands

```bash
cd frontend
npm test
npm run build
GRIDPILOT_LIVE_API=1 npm run test:integration # requires the local API
```

From repository root:

```bash
backend/.venv/bin/python -m pytest backend/tests -q
```

The build runs TypeScript project compilation and Vite production bundling. Chart code is lazy-loaded. No new application dependencies were needed: React, TypeScript, Vite, Tailwind, Recharts, Lucide, Vitest and jsdom were already installed. Playwright/Chromium and Prettier were installed temporarily under `/tmp/gridpilot-browser` for local QA/formatting; Chromium system libraries were installed for browser QA. They are not application or lockfile dependencies.

## Executed verification results

- TypeScript compilation and Vite production build passed.
- Frontend Vitest suite: 27 passed; the opt-in live integration test was skipped in the standard run, then executed separately and passed against local FastAPI.
- Existing backend suite: 20 passed. One existing Starlette/httpx deprecation warning was emitted.
- Chromium desktop QA at 1440px: demand chart renders, hover tooltip works, 24 table rows, edit/reset/validation and live HTTP 501 behavior pass.
- All four views checked at 390px, 768px and 1024px with no horizontal page overflow; screenshots reviewed. Mobile time-axis labels use responsive tick selection to avoid overlap.
- Network-aborted API checks: offline status and optimization error displayed without crashing or fabricated results. No browser runtime errors.
- Billing assumptions: missing-pair validation, explicit application and persistence across navigation verified.
- Explicitly test-only intercepted API responses verified feasible/infeasible comparison rendering, both demand lines and stale-result warning. These responses are not included in the application and are not real solver results.
- `git diff --check` passed.

## Commit and deployment handoff

Review `git diff` and the new files first. To commit only Phase 2 files:

```bash
git add frontend/src/components/EnergyChart.tsx frontend/src/components/ai frontend/src/components/configuration frontend/src/components/dashboard frontend/src/data frontend/src/index.css frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx frontend/src/services/api.ts frontend/src/services/api.test.ts frontend/src/types/dashboard.ts docs/phase-2-dashboard.md README.md
git commit -m "Build interactive commercial energy dashboard"
```

After your approval, push `feature/interactive-dashboard`, open a pull request against `main`, inspect the existing Vercel project's preview and merge when approved. The existing GitHub-connected Vercel project handles deployment; do not create another project. The initial implementation handoff stopped before committing or publishing; subsequent Git operations follow the repository owner’s approval.

## Next milestone

Agree with Developer 2 on the uncontrolled baseline scheduling policy, implement and verify the Python simulator and constrained optimizer, and return real `OptimizationResult` responses. Validate physical constraints and fixture parity before integrating Meta AI. Phase 3 has not been implemented here.
