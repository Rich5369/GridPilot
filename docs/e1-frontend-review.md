# E1 frontend handoff for shaJ46

Branch: `feature/e1-device-operating-timeline`, based on `origin/main` c3d52a4.
No optimizer, solver, backend, Meta diagnostics, deployment, or dependency changes.
The original workspace and teammate worktrees were preserved. All 35 PRs were
inspected (merged); no open PRs existed at inspection.

## Review the exact submission

Open `artifacts/e1/acceptance.json`. Every `cases[]` record contains its name,
submitted Scenario, scheduling mode, complete actual HTTP response, numerical
reconciliation and screenshot filenames. Screenshots live beside that JSON.
The browser makes one real optimize request per case; no intercepted responses,
reconstructed device allocations, or second optimization are used for evidence.
`stale` identifies the saved response and the subsequent unsaved draft change.
The UI's **Export submitted evidence** downloads the same Scenario/mode/response;
Chromium verifies that export against the captured request and response.

| Case | Baseline peak kW | Optimized peak kW | Total kWh | Optimized energy USD |
| --- | ---: | ---: | ---: | ---: |
| EV-only feasible | 23.9 | 14.059999875000004 | 128.8 | 20.576000099999998 |
| Joint feasible | 23.9 | 14.05999987500001 | 128.8 | 20.576000099999998 |
| EV-only recovery infeasible | 10.5 | unavailable | baseline 98 | unavailable |
| Joint recovery | 10.5 | 8.5 | 98 | 17.84 |
| Joint infeasible | 10.5 | unavailable | baseline 98 | unavailable |

Baseline costs: first two $20.576; remaining $17.84. The first two results retain
the solver's documented $1e-7 secondary-stage cost allowance. They are not rounded
into identical raw charges. Largest observed hourly reconciliation residual was
1.78e-15 kW. Acceptance thresholds: 1e-6 kW/kWh, $2e-7.

## Teammate checklist

- [ ] Compare each device's original type and ID, window, maximum kW and required
  kWh to the captured Scenario. Identity uses `(device_type, device_id)`.
- [ ] Open **Exact hourly values**: all 24 baseline/optimized cells must match the
  JSON. Null optimized schedules must read unavailable, never zero.
- [ ] Sum device kW plus submitted fixed demand hourly, then check aggregate
  energy, peak and tariff-weighted charges using that same response.
- [ ] Confirm EV-only flexible equipment is labeled **Held at baseline** and
  matches its baseline values. Joint mode permits equipment to move.
- [ ] Inspect baseline in recovery: it explicitly violates modeled constraints.
  Its partial/overloaded arrays are informational, not compliant instructions.
- [ ] Confirm primary-cost proof and peak proof are separate. A feasible unproved
  incumbent never reads optimal; solver warnings remain verbatim.
- [ ] Change draft inputs after a result: the timeline retains submitted values
  and displays the previous-scenario warning. Export still contains old inputs.
- [ ] Check 1440/768/390 screenshots, keyboard focus/selection, hourly table and
  mobile hour/power cards. No horizontal page overflow.
- [ ] Missing/null E1 plans retain aggregate results and show the legacy message.

## Verification

- Frontend: 114 tests passed; two opt-in live tests additionally passed against
  the real API (the normal suite skips those two).
- Backend: 289 tests passed, including 37 E1 contract tests. One existing
  Starlette/httpx deprecation warning.
- TypeScript and Vite production build passed.
- Lint passed with two existing CostBreakdown Fast Refresh warnings.
- Real local HTTP + Chromium: five scenarios, three viewport widths, stale
  snapshot, raw table/accessible power checks, energy/window/capacity checks,
  aggregate/price reconciliation, exported evidence and no browser errors.

Reproduce using the existing backend virtualenv and frontend npm dependencies:
serve `backend.main:app` on 8092 with CORS origin `http://127.0.0.1:5291`, build
frontend with `VITE_API_BASE_URL=http://127.0.0.1:8092`, preview on 5291, then run
`NODE_PATH=<playwright node_modules> node scripts/verify_e1_browser.cjs`.
The browser tool is intentionally not an application dependency.

## Presentation assumptions and limits

Bar height is relative to each device's maximum, not comparable absolute height
across devices with different capacities. Every positive allocation has a minimum
2px marker; exact hover/focus/table/export values retain raw fractions. Compact
numbers use seven significant digits; tiny positive values use scientific
notation rather than misleading zero. Baseline/optimized toggle affects all rows.
Hour h is [h,h+1); end_hour is exclusive. Mobile uses 24 labeled hour/power cards
per device plus the same exact-value table. No extra chart library is introduced.

The timeline appears in Energy overview and Optimization for the main submitted
result. What-if comparisons retain their existing aggregate views. Fixed demand
is reconciled once and never shown as a fictitious device. E1 null/missing is
backward-compatible; malformed or request-mismatched E1 payloads are rejected.
Unproved/fallback warnings are tested with synthetic quality metadata; real local
captures returned optimal or infeasible outcomes. No hardware controls, overnight,
calendar/DST, thermal comfort or uninterrupted equipment cycles are modeled.
These are planning results, not verified building operation. No merge or deployment
was performed.
