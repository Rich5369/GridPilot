# Phase 6: Business what-if comparison

Phase 5 is merged in local main (merge 19964de). No project AGENTS.md was found.
The pre-existing single-scenario Comparison component is reused, not replaced.
No backend, shared API contracts, solver constraints or EE modules changed.

## Manual workflow

Start the existing backend on :8000 and frontend on :5173. Open **What-if
scenarios**, then **Create alternative from current**. Change the alternative's
building limit, charger count/power, energy per EV, arrival/deadline or peak price.
Choose **Compare both scenarios**. For a feasible example use the default current
scenario and an alternative with limit 15 kW. For infeasibility use limit 1 kW.

The current scenario follows Scenario configuration; the alternative is a separate
copy. Other configuration values remain those copied at creation. Reset alternative
copies the latest current configuration and saves that as the restore point.
**Apply alternative to current** updates the main editor; **Restore starting
scenario** restores the configuration saved when creating/resetting the alternative.
Both invalidate comparison results if the input pair changes. Names are display-only.
Input changes during requests also prevent late responses appearing as current.

Each scenario shows backend feasibility, optimized daily energy charges, peak
hourly demand, total consumption and solver reasons, alongside its own baseline
chart and optimization benefit. Between-scenario differences are alternative minus
current and appear only if both solves are feasible. Price and requirements can
differ, so the comparison does not claim energy savings. Costs come from backend
fields; the only consumption aggregation sums the backend's 24 hourly average-kW
values times the documented one-hour duration. Infeasible optimized values remain
unavailable. Baselines may themselves violate constraints.

## Requests and AI

The workflow uses two sequential calls to the existing POST /api/optimize client,
with its configured timeout, and shares the dashboard's optimization lock. There
are no retries. A timeout/abort stops the sequence because the server may still be
working. Other errors remain attached to the affected scenario; no mathematical
infeasibility is inferred from an HTTP failure. A second scenario can still be
attempted after a non-timeout error.

No AI credentials or AI calls are required. Phase 5's reviewed proposals have a
**Compare as alternative** action, using the existing validation and exact scenario
round-trip checks. This preserves the current editor and sends the proposal to
this workflow. Future AI proposals can enter through the same validated
ScenarioEditor boundary, followed by explicit user optimization. Live Meta API
verification remains pending; mock fixtures are not live inference.

State exists in memory only and is lost on page reload. At most one alternative,
a shared EV requirement/deadline, and the existing editor's two-rate tariff are
supported. Daily hourly energy-only modeling does not estimate monthly bills.
No backend or deployment configuration changes are required.

## Verification

- Backend pytest: 104 passed; existing TestClient deprecation warning.
- Frontend: 39 passed, one opt-in test skipped; includes timeout and late-response tests.
- TypeScript and production build; Oxlint (two existing CostBreakdown Fast Refresh warnings).
- Opt-in real HTTP API client integration test: passed.
- Existing Phase 5 Chromium regression and reviewed-proposal comparison handoff: passed.
- Chromium: genuine feasible pair and feasible/infeasible pair; exact submitted
  configurations and displayed backend costs; stale result invalidation;
  apply/restore; validation; sequential requests, loading and injected HTTP 503;
  390px mobile overflow and browser errors. Screenshot `/tmp/gridpilot-phase6-mobile.png`.

Repeat browser checks with local servers running:

```sh
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_whatif_browser.cjs
```

Recommended next task: a facility-manager acceptance review of comparison labels
and workflow, then an approved release. Authenticated Meta verification can follow
when credentials become available.
