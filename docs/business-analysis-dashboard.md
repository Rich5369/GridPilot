# Business analysis options, AM/PM controls and calculated onboarding

Initially inspected main `cf6bba0fa5791a39572cfe3bc8ec44ae76b31aeb` (PR #45).
Richard then merged PR #46 (employee-evidence certainty). The unpublished feature
commit was rebased onto latest main `b1faf40a93c06bea9a191f270d976b4499b56c23`,
preserving his backend changes and the completed persistence work.
No open PRs or unrelated working-tree edits were present when this branch began.
The Save/Resume, navigation, E1/E2, advisor and retail frontend work in PR #45 was
already complete; this implementation reuses it. The subsequent ownership prompt
repeated that scope and did not require rebuilding those features.

shaJ46 owns the frontend; Richard owns backend APIs, optimization mathematics,
energy data and Meta reliability. No backend, shared API contract, dependency,
provider configuration or deployment configuration changes are part of this work.

## Analysis choices and exact API mapping

| Frontend choice | EV requirements | Flexible equipment | Existing API mode |
| --- | --- | --- | --- |
| Building electricity only | empty | empty | `joint` |
| Flexible equipment only | empty | configured standard/custom loads | `joint` |
| EV charging only | configured EVs | empty | `ev_only` |
| EV charging and flexible equipment | configured EVs | configured standard/custom loads | `joint` |
| Advanced: hold equipment at baseline | configured EVs, possibly none | retained configured loads | `ev_only` |

New business setup starts with Building electricity only. Explicit demonstrations
retain their original mixed equipment inputs. Selection changes retain inactive
field drafts but omit those devices from Scenario. Inactive parameters do not block
submission. Zero chargers are valid; zero standard-equipment duration omits that
load, rather than creating a synthetic zero-energy placeholder.

Old version-1 workspaces have no `analysisChoice`: the UI derives a truthful label
from their actual counts and stored mode. In particular, `ev_only` with equipment
still holds it at baseline. It never silently drops held equipment or upgrades
its scheduling behavior. New optional editor fields are bounded/validated in the
existing version-1 envelope; old records remain readable without a mount-time rewrite.

The backend's unchanged fixed-only joint path was checked directly with 0, 3 and
6 kW flat demand under a 5 kW cap: zero and 3 kW are feasible, 6 kW is infeasible.
No new mode string or second solver was necessary.

## Custom equipment

One optional custom device uses stable ID `custom-equipment`; standard equipment
keeps `office-equipment` and EV IDs remain unchanged. Name (100 characters),
optional description (500), classification and draft numerical fields are frontend
metadata. This metadata is saved in the browser and exported separately under
`device_metadata`; it is never added to the public Scenario or response contract.

- **Context only / unconfirmed behavior:** retains the name/description without
  inferring electricity consumption. Unsupported HVAC thermal behavior, batteries
  and uninterrupted cycles require additional modeling support.
- **Fixed demand:** the user supplies the existing combined/named hourly profile.
  The name adds no load automatically. Instructions explicitly require counting
  the equipment once and avoiding adding it to a whole-building profile twice.
- **Schedulable:** inclusion requires a flexible-equipment analysis choice, positive
  energy (kWh), maximum power (kW), a same-day whole-hour exclusive window and
  explicit confirmation that power can vary and operation can pause. The adapter
  submits those values exactly. Duration 0 disables the separate standard device
  when only the custom load is wanted. Incomplete active numerical configurations
  block submission; a name alone may remain context.

Schedules retain the result's exact device IDs and arrays. Custom names displayed
with schedules and exported metadata come from that submitted editor snapshot,
not subsequent draft corrections. Metadata does not reconstruct schedules or
allocate fixed load among named sources.

## Whole-hour AM/PM presentation

Shared `data/time.ts` / `HourSelect.tsx` map labels to existing integer-hour strings:
0 = 12:00 AM, 12 = 12:00 PM, 13 = 1:00 PM, 24 = 12:00 AM — end of day.
Starts offer 0–23, exclusive ends 1–24. There is no minute precision or rounding.
Unsupported saved hours remain visibly unsupported, rather than being repaired.
Overnight/equal windows remain invalid and receive the existing same-day explanation.

Setup, review, editor/What-if time controls, business context, tariffs, tables,
chart tooltips, infeasibility windows and device schedules use consistent AM/PM
labels. Numeric hourly arrays/indices in API requests and machine-readable evidence
remain unchanged; each interval is exactly one hour.

## Why the dashboard was empty and what changed

The previous final setup action only marked the workspace complete and opened
Dashboard; `runOptimization` was a separate action. The chart mappings worked, but
there was no response to populate them.

**Create workspace and calculate** now validates active inputs and starts one API
request in the explicit submit event. App captures the exact Scenario, editor
snapshot and existing mode, then opens Overview with calculating metrics plus
configured fixed-demand and tariff charts. A session-only promise handoff subscribes
to that one request; its effect never starts another solve. A synchronous guard
prevents duplicate submits, including Strict Mode/rerenders. No advisor request is
made as part of setup.

The response supplies the existing metrics, demand/cost/tariff charts and same-solve
E1 schedules. Initial completion stays on Overview; subsequent explicit Run remains
available. Edits preserve submitted labels/prices/caps and mark old results stale.
Changed modes discard a late reply; unmount cleanup prevents it updating a different
workspace. Failures keep the input profile with an explicit Run retry; mathematical
infeasibility retains actual baseline information, reasons and null optimized fields.

Fixed-only results explain that no load can be scheduled and still provide whole-
building analysis and evidence export. Flat/zero inputs and overlapping returned
curves are legitimate results, with no fabricated savings. Analysis headings and
movement explanations reflect actual configured devices, rather than calling every
joint-mode result an EV scenario.

Save/Resume continues to restore **inputs only**, independently of results/IDs.
Refresh/reopening never automatically recalculates. What-if and advisor proposals
still require their explicit actions; controlled AI fixtures are not live Meta output.

## Validation and evidence

Tested frontend: `d5175124c23358e2d51c0d2a1e9798c940970a3d`. Backend source matches main
`b1faf40a93c06bea9a191f270d976b4499b56c23` exactly (tree
`5fbc5dd55415c289b233510976f7a353057b6cbe`). Rebase changed the parent but not the tested frontend
source tree (`221e675f6a06e37156d3d7dadb9df53f2fe1b2a9`). QA/report commits do
not change the served implementation. No hosted revision is claimed.

- **235 tests passed**, 2 existing opt-in live tests skipped. TypeScript and
  production build passed. Lint has only the two existing CostBreakdown Fast
  Refresh warnings. Existing negative-zero/What-if assertions remain intact.
- Chromium acceptance passed with **14 real optimizer responses**. Initial setup
  double-click produces one request; loading is visible while its real response
  is held. Both fixed-only and equipment-only results populate Overview without
  a second Run. All active arrays/modes match the selection.
- Tested flat demand, zero demand, zero prices/savings, coincident curves, all four
  primary options, restored legacy held equipment and custom fractional scheduling.
  Captured costs reconcile to hourly tariff-weighted demand within `2e-7 USD`,
  peaks/energy/power/windows/site limits and fixed-load reconciliation within
  `1e-6 kW/kWh`. Held schedules match their returned baselines. No independent
  second solve or guessed allocation generates the device display.
- Custom pump: **3.75 kWh**, maximum **2.5 kW**, **12:00 PM–12:00 AM end of day**.
  Actual returned optimized power is **0.3125 kW** in each allowed hour. Its
  name/description remain metadata. Exported Scenario/result/result ID match
  that same real response; raw numeric hours and fractional arrays are preserved.
- Real What-if requests, explicit Apply/Restore, stale result edits and recalculation
  passed. Exact scenario/mode/result-ID handoff to the advisor was verified with a
  clearly labeled mock proposal; no live or paid Meta call was made. Real dated
  retail data and keyboard state selection were exercised without changing tariffs.
- Active overnight windows are rejected; excluded invalid EV drafts do not block
  building-only submission. Real fixed-only infeasibility keeps reasons/E2 evidence
  and null optimized fields. Controlled initial HTTP 503 produces service failure,
  preserves inputs and supports explicit successful retry against the real backend.
- A real on-disk Chromium profile closes/reopens twice: partial step, choice, custom
  metadata and inactive values survive; completed Continue restores inputs only.
  Edit building and clear/cancel remain functional. Earlier storage failure/recovery
  regressions remain covered by the full frontend suite and PR #45's browser evidence.
- Desktop **1440 px**, tablet **768 px** and mobile **390 px** screenshots were
  captured and visually inspected. Stable chart resizing has no page-wide overflow.
  Targeted axe checks for setup, populated overview and custom equipment found
  **zero violations**. Reduced-motion, keyboard skip navigation, history/direct
  links and retail keyboard selection were exercised. This is targeted coverage,
  not a universal accessibility certification.

| Captured real scenario | Status | Baseline kWh | Optimized kWh | Baseline USD | Optimized USD | Optimized peak kW |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Building only · 3 kW flat | feasible | 72.0000 | 72.0000 | 14.400000 | 14.400000 | 3.000000 |
| Building only · zero | feasible | 0.0000 | 0.0000 | 0.000000 | 0.000000 | 0.000000 |
| Standard flexible only | feasible | 78.0000 | 78.0000 | 15.600000 | 15.600000 | 4.000000 |
| EV only | feasible | 100.8000 | 100.8000 | 20.160000 | 20.160000 | 6.600000 |
| EV + flexible | feasible | 106.8000 | 106.8000 | 21.360000 | 21.360000 | 5.618182 |
| Legacy EV-only + held equipment | feasible | 106.8000 | 106.8000 | 21.360000 | 21.360000 | 7.350000 |
| Custom pump only | feasible | 75.7500 | 75.7500 | 15.150000 | 15.150000 | 3.312500 |
| Fixed demand above cap | infeasible | 144.0000 | — | 28.800000 | — | — |

Prices in these tests are flat $0.20/kWh except the zero-price case. Equal energy
costs are expected; reduced peaks do not imply energy savings. Captures retain the
actual primary and peak tie-break statuses. Although these real feasible cases
report primary optimality, the UI continues to distinguish a merely feasible solve
from proven optimality when the backend supplies that status.

Screenshots: [desktop options](../artifacts/business-analysis/building-options-desktop.png),
[mobile options](../artifacts/business-analysis/building-options-mobile.png),
[AM/PM controls](../artifacts/business-analysis/joint-times-desktop.png),
[mobile AM/PM](../artifacts/business-analysis/joint-times-mobile.png),
[calculating](../artifacts/business-analysis/calculating-desktop.png),
[populated building](../artifacts/business-analysis/building-populated-desktop.png),
[mobile building](../artifacts/business-analysis/building-populated-mobile.png),
[custom device](../artifacts/business-analysis/custom-populated-desktop.png),
[tablet](../artifacts/business-analysis/custom-populated-tablet.png),
[mobile custom device](../artifacts/business-analysis/custom-populated-mobile.png).

The full submitted Scenario bodies, modes and real responses are saved in
[the browser report](../artifacts/business-analysis/verification.json).

```sh
npm --prefix frontend test
(cd frontend && ./node_modules/.bin/tsc -b)
npm --prefix frontend run lint
npm --prefix frontend run build
```

To reproduce local browser acceptance, build with
`VITE_API_BASE_URL=http://127.0.0.1:8018`, start the existing backend on 8018 with
`MODEL_API_DIAGNOSTIC_ON_STARTUP=0` and `CORS_ORIGINS=http://127.0.0.1:5298`, then
run Vite preview on 5298. In a QA environment with Playwright/Chromium and axe:

```sh
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5298 node scripts/verify_business_analysis.cjs
```

`PLAYWRIGHT_MODULE` and `AXE_MODULE` allow a temporary external QA installation;
no app dependency additions are needed. Tests use synthetic business inputs.
Successful optimizer responses come from the unchanged real local backend. One
real initial response is deliberately held in the browser proxy to inspect loading;
its numerical body is not fabricated. AI proposals and service errors are controlled
fixtures, never live provider acceptance. Resize checks wait for chart ResizeObserver
updates before assessing mobile dimensions; they do not hide overflow.

## Remaining interfaces and release work

No new backend defect or contract extension is needed for these three improvements.
The existing missing account/session, authorized building CRUD/versioning and durable
execution retrieval/lifetime interfaces remain Richard's decisions before cross-device
recovery or permanent history can be offered. See
[the original frontend dependency handoff](frontend-completion.md#remaining-interfaces-for-richard).

The approved design, persistence/recovery, E2 presentation, What-if, advisor/profile
review, pricing display and full-precision exports are preserved. No other confirmed
independent frontend gap was deferred. Account integration awaits actual APIs;
hosted browser acceptance and live Meta/provider verification remain separate
release/backend milestones. Nothing in this local report establishes hosted success.
