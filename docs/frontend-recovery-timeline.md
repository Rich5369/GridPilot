# Frontend recovery and timeline release check

Scope: frontend only, based on public main `761f006`. No backend, financial equations, solver, hosting configuration or paid inference changes.

## Connection behavior

The workspace checks `/api/health` with a single **90-second overall budget**. After five seconds, the status changes from connecting to waiting for backend startup; it does not declare the backend offline. Failed read-only checks retry sequentially after three seconds within the same deadline. A successful check connects automatically and stops checking. The user can stop the check at any time. At the deadline, a clear timeout offers an explicit retry with a fresh budget.

Cleanup aborts the active health request and clears all timers. Cancelled, unmounted and expired checks cannot overwrite later state. Backend identity validation remains required.

Only health GETs retry. Health status does not trigger or replay financial calculations, optimization, catalog requests or AI messages. Existing financial/AI/optimization budgets and explicit retry controls remain unchanged. A calculation timeout does not claim that server work was cancelled. Connection checks do not clear or remount business forms, saved workspaces, evidence or question drafts.

## Timeline behavior

The scheduling panel retains its dark SaaS surface with locally scoped color tokens. Scheduled green fills and held-at-baseline blue fills remain distinct from empty available cells; a brighter hatch marks outside availability. A legend identifies empty available cells. Proof, device, axis and table labels retain readable contrast. Mobile tiles use compact power labels; accessible labels and exact-value tables preserve full response precision. No schedules or computed values change.

## Verification

- Full frontend suite: **324 passed, 2 opt-in HTTP tests skipped**.
- Final targeted status/API/timeline suite: **23 passed**.
- Type checking and production build pass. Lint has no errors and two existing Fast Refresh warnings in `CostBreakdown.tsx`. The existing large-bundle build warning remains.
- Real Chromium with the local production build and unchanged local FastAPI backend: LED, W01 and O01 workflows pass using the official fictional inputs. Backend costs, all 24 demand/device table rows and bar heights match actual responses.
- Actual 45-second health delay plus initial failed connection: automatic recovery, one financial submission, preserved business/evidence/question drafts, zero automatic optimization/AI requests.
- Actual 60-second health delay and delayed financial response: automatic connection recovery, financial timeout at its existing 45 seconds, no automatic replay, one successful explicit retry after readiness.
- Actual 60-second optimization response during health recovery: one solve, zero AI requests; the returned schedule and charts remain correct.
- Fake-timer regressions additionally cover the 90-second bound, repeated failures, cancellation, late responses, retry and unmount cleanup.
- Desktop (1440 px) and mobile (390 px): no horizontal document overflow; dark timeline keyboard focus and mobile power labels work. Measured text contrast: device label **15.4:1**, secondary label **9.0:1**, proof text **14.2:1**. Scheduled fill minimum tested contrast **3.39:1** against its cell.
- Every browser AI request is intercepted locally: controlled 503 failure and explicitly labeled deterministic-fallback fixture. The fallback displays the real deterministic calculation, but it is **not genuine Meta acceptance**. No paid Meta request is sent.

These checks verify a local build of this branch. They do not establish a production deployment of this change. Do not merge or deploy automatically.

## Reproduce

Install the repository's existing frontend/backend dependencies first. In the repository root, start the unchanged backend with providers disabled:

```bash
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 CORS_ORIGINS=http://127.0.0.1:4173 \
  python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm test
npm run lint
npx tsc -b --pretty false
VITE_API_BASE_URL=http://127.0.0.1:8000 VITE_OPTIMIZATION_TIMEOUT_MS=90000 npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

The standalone browser test uses Playwright without adding an application dependency. Use an existing Playwright installation, or install it in an isolated temporary directory:

```bash
npm install --prefix /tmp/gridpilot-browser-tools --no-save playwright@1.64.1
export GRIDPILOT_PLAYWRIGHT_PATH=/tmp/gridpilot-browser-tools/node_modules/playwright
node "$GRIDPILOT_PLAYWRIGHT_PATH/cli.js" install chromium
# From the repository root; outputs default to /tmp/gridpilot-browser-<delay>.
node frontend/scripts/verify-release-browser.cjs
GRIDPILOT_TEST_DELAY_MS=45000 node frontend/scripts/verify-release-browser.cjs
GRIDPILOT_TEST_DELAY_MS=60000 node frontend/scripts/verify-release-browser.cjs
GRIDPILOT_OPTIMIZATION_DELAY_MS=60000 GRIDPILOT_BROWSER_OUTPUT=/tmp/gridpilot-optimization-delay \
  node frontend/scripts/verify-release-browser.cjs
```

Each command creates isolated fictional browser storage and writes a JSON report/screenshots. The browser refuses a non-local frontend URL and intercepts all AI endpoints before dispatch. In delay tests, deterministic requests reach the local backend once per explicit submission; only response delivery is delayed.

## Presenter checklist after a separately approved deployment

1. Confirm the serving frontend revision and backend readiness once before presenting. This PR does not prove PR #68 or any Render revision is deployed.
2. Landing → **Get started** → fictional Office → **Find savings opportunities** → **Load synthetic LED example** → review inputs → **Calculate savings** once. Expect 12,500 kWh/year, $2,500/year net, $2,500 investment and one-year payback, all labeled synthetic.
3. Show the calculation explanation. Optional AI controls must clearly distinguish a live response, fallback and error. This verification authorizes no live paid inference.
4. In a separate fictional Warehouse workspace, select flexible equipment only and enter W01. Show $19.76 → $18.48/day, 114 kWh unchanged and peak 10 → 7 kW. Inspect the dark device timeline and exact hourly values. The immediate-start baseline is the comparison; a simple scheduling rule also achieves that energy cost.
5. Optionally enter O01 with joint charging/equipment. Expect $20.304 → approximately $15.696/day and 106.8 kWh unchanged, feasible under 25 kW. Equivalent optimal device allocations may differ.
6. If backend startup is slow, let the bounded connection check recover. At timeout, retry explicitly; keep entered data. Do not repeatedly submit calculations or resend an AI request that may still be running.
