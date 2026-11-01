# Dashboard clarity and Advisor navigation

Starting main: `7f13c6745f0522d97af8587e64b3b8252ab4d265`.
Branch: `feature/dashboard-clarity`.

The working tree was clean. Fetched origin and reviewed the twelve most recent PRs, including merged #59 (Cloud Blue landing/theme), #60 (softer backgrounds), and #61 (readable, specific Advisor replies). All are included through current main. There were no newer or open PRs at the initial review. Remote branches `feature/business-savings-engine` and `feature/meta-savings-integration` retain historical integration commits outside main's ancestry; they were left untouched. No unmerged branch was integrated.

## Presentation changes

- Keep the existing Cloud Blue palette, three overview metric cards and single demand graph.
- Use **Energy overview** with the building name. Remove the eyebrow slogan, trailing marketing sentence, sidebar motto and redundant footer copy.
- Shorten the successful plan heading to **Your energy plan**. Move daily modeled-charge scope and fixed/demand-charge exclusions into a closed **Calculation details** disclosure within the existing panel. The metric still explicitly says modeled daily energy cost and USD/day. Loading, errors, stale results, calculation warnings and infeasibility remain visible; the heading announces status changes politely.
- Use **Power usage throughout the day (kW)** below the graph title. Replace the overlap paragraph with **Lines overlap** and move sampling/interpolation/precision notes into **Chart details**. Retain legends, tooltips, units, the 24-row table, source breakdown and unchanged numerical values. Remove the total-demand switch when there is no other view to switch to.
- Replace competing Advisor entry buttons with one prominent **Ask Energy Advisor** beside the page heading, available across main sections. Calculate remains available as a secondary control. Opening the existing Advisor sends no request.
- Keep the existing mounted `EnergyAssistant` and PR #61 reply presentation. Close or Escape returns to the last workspace section and restores focus to the trigger; in-session replies and unsent composer text remain. A direct Advisor deep link closes to Overview. Remove the redundant collapsible Advisor heading wrapper and visible marketing text; retain its accessible component heading and provider/status information.
- Make the dashboard and recovery-header GridPilot logos labeled, keyboard-accessible home links. Remove the separate Home button. Existing Overview navigation, route aliases, browser history and saved workspace behavior remain.
- Landing page implementation and backend implementation are unchanged.

## Files changed

- `frontend/src/pages/Dashboard.tsx`: clear headings, prominent Advisor action, return/focus behavior, logo navigation and removed redundant controls/mottos.
- `frontend/src/components/dashboard/Overview.tsx`: compact healthy status, cost disclosure and graph subtitle.
- `frontend/src/components/DemandChart.tsx`: chart disclosure, short overlap notice and conditional source-view controls.
- `frontend/src/components/ai/EnergyAssistant.tsx`: presentation-only header cleanup; conversation/provider logic unchanged.
- `frontend/src/App.tsx`: clickable recovery-header logo.
- `frontend/src/product-design.css`: compact existing panel, disclosure typography and responsive header actions; existing palette unchanged.
- `frontend/src/pages/Dashboard.test.tsx`, `frontend/src/components/dashboard/Overview.test.tsx`, `frontend/src/App.test.tsx`: focus/close/context isolation and presentation regression coverage; existing entry assertions updated for the single Advisor control.
- `scripts/verify_dashboard_clarity.cjs`: repeatable browser verification; `scripts/verify_cloud_blue.cjs`: updated shortened ready heading.
- `artifacts/dashboard-clarity/*`: before/after screenshots and verification results.

## Verification

- **320 frontend tests passed**, with the two opt-in HTTP tests skipped in that run.
- **Both real HTTP integration tests passed** separately against local FastAPI.
- **TypeScript, production build and lint passed.** Two existing `CostBreakdown.tsx` Fast Refresh lint warnings and Vite's existing large bundle advisory remain.
- Chromium tests use the real local frontend and backend for daily calculations, proven infeasibility, What-if's two scenario calculations, and the annual LED Savings Engine example. One injected Advisor response verifies conversation persistence, exact result/business request context and no request on open. No live Meta request was made, so live wording is not verified by this task.
- Desktop/mobile accessibility scans cover empty, successful, stale and infeasible overviews and the mobile Advisor; see the report for each scan. No violations or page errors were observed.
- Browser checks verify three metrics/one graph, retained disclosures and table, overlap note, Advisor entry/close/Escape/focus, retained conversation/composer, logo home navigation, exact saved-data retention, Back/Forward and returning Get started. Responsive chart resizing is allowed to settle before overflow assertions.

Run with Vite on port 5173 and FastAPI on port 8000:

```sh
npm test --prefix frontend -- --maxWorkers=2
GRIDPILOT_LIVE_API=1 npm run test:integration --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright node scripts/verify_dashboard_clarity.cjs
```

## Screenshots

- [Before: successful desktop overview](../artifacts/dashboard-clarity/before-result-desktop.png)
- [After: successful desktop overview](../artifacts/dashboard-clarity/after-result-desktop.png)
- [Before: empty desktop overview](../artifacts/dashboard-clarity/before-empty-desktop.png)
- [After: empty desktop overview](../artifacts/dashboard-clarity/after-empty-desktop.png)
- [After: successful mobile overview](../artifacts/dashboard-clarity/after-overview-mobile.png)
- [After: mobile Advisor](../artifacts/dashboard-clarity/after-advisor-mobile.png)
- [After: stale desktop overview](../artifacts/dashboard-clarity/after-stale-desktop.png)
- [After: stale mobile overview](../artifacts/dashboard-clarity/after-stale-mobile.png)
- [After: infeasible desktop overview](../artifacts/dashboard-clarity/after-infeasible-desktop.png)
- [Machine-readable verification](../artifacts/dashboard-clarity/verification.json)

Prepared for review. No merge or explicit deployment performed.
