# R2 — Deterministic Energy Insights

## Scope and inspected contracts

Based on origin/main `57d10e1` after merged PRs #29, #30 and #31. Remote branches,
recent PRs and local worktrees were inspected. No open PR appeared in the recent
PR listing. Local main was outdated; an isolated `feature/deterministic-energy-insights`
worktree starts at refreshed origin/main. Existing Meta diagnostic edits, frontend
index.css/.gitignore edits, engineering branches and the commercial worktree were
preserved. Solver mathematics and E1 device visualization are unchanged.

Inspected `backend/models/contracts.py`, `backend/optimizer/interface.py`,
`docs/contracts.md`, frontend API validation/types, Dashboard submitted snapshots,
Comparison/DemandChart, WhatIf snapshot invalidation, scenario adapters and tariff
expansion. The shared aggregate contract is sufficient for R2:

- Scenario: 24 one-hour prices, fixed-demand profile, positive building cap,
  EV requirements and optional flexible equipment. Prices may be negative.
- OptimizationResult: 24 aggregate baseline/optimized demand values, daily energy
  costs, hourly-average peaks, feasibility and reported constraint violations.
- Mode is request metadata retained with submitted results; EV-only holds equipment
  at baseline, while joint mode allows eligible equipment to shift.
- The optional operating_plan extension exists on main, but its teammate review
  requirement remains in place. R2 does not consume it or reconstruct device schedules.

## Implementation and calculations

`deriveEnergyInsights` is a pure calculation over the submitted scenario/result.
It makes no network, optimizer or AI calls. It validates 24 finite prices and
nonnegative demand values, then reconciles each demand vector independently to its
reported cost (absolute tolerance $2e-7) and peak (1e-6 kW). Missing/inconsistent
vectors produce unavailable insights, never zero-filled results.

Hourly energy expenditure = aggregate kW × 1 hour × USD/kWh. Aggregate demand
already includes every end use; fixed or device values are never added again.
Top three periods sort by full-precision signed expenditure descending, with exact
ties in chronological order. Prices and demand are shown separately. Negative
prices retain their credits; no percentage of daily cost is used.

Peak = maximum hourly average. All hours within 1e-6 kW of that peak are listed.
Headroom = submitted cap − peak; utilization = peak / cap × 100. An uncontrolled
baseline may exceed the cap without invalidating its baseline cost.

Cost and peak reductions = baseline − optimized, only when both reconcile and the
backend reports feasibility. Sub-cent changes display as unchanged at cent
precision, and sub-0.005 kW changes as unchanged at 0.01 kW precision. A genuine
lower-cost/higher-peak tradeoff gets a specific notice. Feasibility evidence is
rendered from backend reasons without invented causes or recovery prescriptions.

## Workspace experience

Energy insights appears after the existing result comparison on Overview and
Optimization, and within each fresh What-if scenario result. Three restrained
cards cover expenditure, capacity and decision support. Baseline expenditure,
tied peak hours and calculation/constraint evidence use native keyboard-accessible
disclosures. Cards stack on tablet/mobile; no animations or new dependencies.

Dashboard passes resultScenario/resultMode, never the editable draft. Stale results
retain the previous submitted cap/prices and show an explicit notice. A scheduling
mode change clears insights with the result. What-if insights are gated by its
existing exact scenario/mode/revision key; edits hide the old pair. Comparing
alternatives keeps each scenario's own prices and requirements and the existing
alternative-minus-current differences. No new solves are introduced.

## Numerical evidence

Real Chromium requests against local production frontend and local FastAPI:

| Default submitted scenario | Baseline | Optimized (EV-only and joint) |
| --- | --- | --- |
| Daily energy cost | $20.576 | approximately $20.5760001 |
| Hourly peak | 23.90 kW | approximately 14.059999875 kW |
| Capacity | 25 kW | 56.24% utilization; 10.940000125 kW headroom |
| Highest expenditure | 10:00: 23.9 × $0.12 = $2.868 | 14:00: 7.5 × $0.28 = $2.10 |

The baseline example demonstrates that its highest expenditure occurs at a lower
price than the $0.28 peak rate. Daily energy cost is unchanged at cent precision;
the tiny increase is solver tolerance, not a claimed cost increase. Peak decreases
by 9.84 kW. An edited $0.99 tariff produces $43.296 baseline daily energy cost;
changing draft prices/cap does not mutate the earlier submitted insights. A real
1 kW cap case is infeasible and shows only baseline calculations and backend reasons.
Full request/response/calculation evidence: [verification.json](../artifacts/r2/verification.json).

Screenshots: [desktop joint](../artifacts/r2/joint-1440.png),
[tablet](../artifacts/r2/joint-768.png), [mobile EV](../artifacts/r2/ev_only-390.png),
[stale](../artifacts/r2/stale-mobile.png), [What-if](../artifacts/r2/what-if-mobile.png),
[infeasible](../artifacts/r2/infeasible-mobile.png).

## Verification

- Frontend: 97 passed, 2 opt-in HTTP tests skipped in the default suite; both
  live HTTP integration tests pass separately against :8022. Tests include pure numerical tests, component availability/mode tests,
  submitted-price/cap stale isolation, no extra optimization requests, and opt-in
  live HTTP tests consuming both modes and infeasible results.
- Relevant backend API, adapter, EV/joint optimizer, simulator and What-if tests:
  159 passed. One existing Starlette/httpx deprecation warning.
- TypeScript and production build pass. Lint passes with the two existing
  CostBreakdown fast-refresh warnings.
- Real Chromium: EV-only and joint response costs/peaks independently reconciled;
  displayed top-hour amounts verified; 1440/1024/768/390 widths without page overflow;
  rendered chart geometry; keyboard disclosure; stale isolation; fresh/invalidated
  What-if pair; backend infeasibility evidence. No page errors. Screenshots visually
  inspected at desktop and mobile sizes.
- Real HTTP readiness: frontend 200, backend health 200. Existing joint HTTP numerical
  acceptance passes separately (joint recovery, price shift and infeasibility). Reproduce browser QA with Playwright installed outside
  application dependencies and `NODE_PATH` set, then run `scripts/verify_r2_browser.cjs`.
  The first attempt to run all unit tests with the live URL override hit two existing
  tests that hardcode localhost:8000; default unit tests and live integration were
  therefore run separately and both pass.
  Defaults are frontend :5182, API :8022; set VITE_API_BASE_URL at build time and
  CORS_ORIGINS on backend accordingly. No Meta credentials or responses are required.

## Limits and engineering review recommendations

These are modeled one-day energy charges, not utility-bill savings or measured
billing peaks. No demand charges, billing history, operational verification,
thermal comfort or individual device behavior is inferred. Top-hour patterns are
informational; the supported action is to compare explicitly configured scenarios.
Fixed HVAC, lighting and refrigeration remain fixed.

No new backend contract is required for this R2 scope. Future engineering additions
should be reviewed separately: structured constraint codes and affected hours/items
(instead of interpreting prose); explicit interval duration/timezone/date metadata
before accepting non-hourly data; baseline-specific feasibility evidence in the
aggregate contract; and server-side scenario/result identity for persistence.
Device timelines still require the teammate-reviewed E1 contract. Do not infer
infeasibility causes or suggest automatic constraint changes from this UI.
