# Scenario-centric workspace review

The dashboard now puts the submitted optimization outcome ahead of editable configuration and technical provenance. The overview and Optimization views share the same result component; neither displays the old fictional overview fixture as a user result.

## Problems found

- The overview continued to show the original office fixture after configuration and optimization, while actual results appeared in a separate view.
- A large workflow panel, mode explanations and repeated provenance pushed primary results below the first viewport.
- Fictional building branding, draft settings and submitted values appeared together without a clear hierarchy.
- Energy, cost and power needed distinct labels to avoid implying that cheaper scheduling saves energy.

## Design and implementation

A dark evergreen navigation rail and restrained lime accent retain GridPilot's existing visual language. Compact controls lead into an outcome statement, baseline/optimized costs, cost difference, peak reduction, daily energy and optimized peak. The demand comparison starts within the first desktop viewport. Native expandable sections retain the 24-hour numerical table, submitted scenario, provenance and manual billing assumptions.

Before optimization, the workspace shows no result claims, the selected draft's configuration and its fixed-demand preview. Demonstration fixed demand is explicitly fictional; custom and named profiles remain labeled manually entered, unverified data. Editable drafts and submitted snapshots have separate summaries with expandable tariff, operating-hour, charging and equipment settings.

Stale results retain the submitted demand limit, mode and scenario. They are prominently labeled as belonging to a previous scenario. Existing editor state, serialized submitted snapshot, mode-version guard, shared in-flight lock, What-if session lifecycle and Apply/Restore behavior remain in place. Daily energy is the sum of returned one-hour kW intervals; it is not inferred from cost savings. Infeasible results show backend constraint reasons and unavailable optimized values.

On tablet and mobile, the navigation becomes a horizontal strip and metrics use two columns. Outcomes precede detailed configuration. Keyboard focus, native selects and expandable sections, source visibility controls, chart navigation and numerical tables remain available.

## Files changed

- `frontend/src/pages/Dashboard.tsx`: replace fictional overview with the scenario/result workspace; retain request lifecycle and state ownership.
- `frontend/src/components/dashboard/ScenarioSummary.tsx`: shared read-only draft/submitted summary; no additional scenario state.
- `frontend/src/components/dashboard/Comparison.tsx`: business outcome, returned energy and peak metrics, stale/infeasible hierarchy.
- `frontend/src/components/dashboard/CostBreakdown.tsx`: correct provenance for submitted baseline billing.
- `frontend/src/index.css`: workspace styling and desktop/tablet/mobile layouts.
- `frontend/src/pages/Dashboard.test.tsx` and `frontend/src/components/dashboard/Comparison.test.tsx`: scenario-first, snapshot, request race, energy, cost and infeasibility regression coverage.
- `scripts/verify_workspace_browser.cjs`: real-backend workspace acceptance with explicitly injected failure states.
- `scripts/verify_demand_profile_browser.cjs` and `scripts/verify_commercial_browser.cjs`: adapt existing acceptance to expandable provenance and current scenario previews.
- `artifacts/scenario-workspace/`: screenshots and genuine request/result evidence.

## Verification

- Frontend unit suite: **79 passed**, one opt-in live integration test skipped in the default run.
- Opt-in integration with local FastAPI and OR-Tools: **1 passed**, genuine feasible and infeasible HTTP results.
- TypeScript and Vite production build: passed.
- Oxlint: passed with two pre-existing `only-export-components` warnings in `CostBreakdown.tsx`.
- Real-browser custom-profile acceptance: passed; exact 24-hour payloads, independent baseline/cost/energy/peak calculations, keyboard profile controls, stale results, What-if comparison, Apply/Restore, joint mode, infeasibility and reset.
- Real-browser named-source acceptance: passed; Lighting + Refrigeration aggregation, disabled EVs, exact submitted demand, source toggles, numerical table, keyboard chart interaction, What-if Apply/Restore, and no horizontal overflow at 1440/768/390 widths.
- Workspace acceptance: **passed**. Covers real EV-only/joint/infeasible responses, draft/submitted provenance, overview results, first-viewport metric/chart geometry, mobile/tablet layouts (additional navigation checks at 1024 px), loading, injected HTTP 422/503/500, native 45-second timeout and recovery. Provider unavailability is explicitly injected; no live Meta inference is claimed.

Reproduce with a local backend on port 8000 and the frontend on port 5173:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8000 npm --prefix frontend run dev
GRIDPILOT_LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 npm --prefix frontend run test:integration
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_workspace_browser.cjs
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_demand_profile_browser.cjs
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_commercial_browser.cjs
```

Playwright is installed outside application dependencies. Backend dependencies were installed in a temporary virtual environment. Existing unrelated diagnostic edits were preserved and excluded from this change. No optimizer, solver mathematics, AI provider or deployment configuration was modified.

## Screenshots

Captured and visually inspected the rendered UI. The before screenshots were taken before starting the local backend, so their offline indicator is an environment difference rather than a claimed product fix.

| State | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Before | [Original overview](../artifacts/scenario-workspace/before-desktop.png) | — | [Original mobile](../artifacts/scenario-workspace/before-mobile.png) |
| Initial workspace | [1440 px](../artifacts/scenario-workspace/initial-1440.png) | [768 px](../artifacts/scenario-workspace/initial-768.png) | [390 px](../artifacts/scenario-workspace/initial-390.png) |
| Actual result | [1440 px](../artifacts/scenario-workspace/result-1440.png) | [768 px](../artifacts/scenario-workspace/result-768.png) | [390 px](../artifacts/scenario-workspace/result-390.png) |

Additional captures cover stale results, infeasibility, provider unavailability, custom profiles and named sources. Genuine solver payloads and results are recorded in `workspace-results.json` and `profiles/verified-results.json`.

## Remaining product gaps

This remains a single-day planning tool with manually entered or demonstration inputs, rather than verified telemetry. Meter integrations, persistence, device-level operating schedules and full utility billing forecasts remain outside this phase. AI actions remain unavailable in joint mode because the existing explanation path recomputes EV-only results. No live Meta provider acceptance or deployment was performed.
