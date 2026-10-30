# Connected hourly analytics

The demand chart (including source breakdown), four KPI sparklines, hourly tariff,
and hourly cost comparison now connect original hourly observations with linear
segments. The existing thin strokes, subdued grids, whitespace and shared
crosshair/tooltips are retained. No area fills or comparison bars are introduced.

Plots contain exactly 24 samples, at 00:00 through 23:00; the last sample describes
23:00–24:00. The duplicated midnight closing vertex used for step charts is omitted.
Labels and tooltips explicitly distinguish visual interpolation from subhourly
readings. Hourly tables retain the original 24 interval values. Calculations,
submitted prices, solver outputs and daily totals are unchanged. Coincident
series remain coincident; constant data remain flat.

## Verification

- Frontend suite, TypeScript/production build and lint pass (two pre-existing
  Fast Refresh warnings in CostBreakdown.tsx).
- Numerical regression covers identical flat baseline/optimized profiles totaling
  $20.58, exactly zero hourly differences, fixed headroom and immutable inputs.
- `scripts/verify_linear_analytics.cjs` uses real local solver responses, compares
  complete before/after results and submitted scenarios, checks 24 SVG vertices
  per series and diagonal linear geometry without step or curve commands.
- Chromium screenshots and overflow checks cover 1440, 768 and 390 pixel widths;
  tooltip checks, all 24 hourly cost rows, sum reconciliation, stale submitted
  snapshots, infeasible unavailability and scoped axe checks are included.
- Actual screenshots were visually inspected for demand, tariff, costs and KPIs,
  including mobile composition. The default scenario retains displayed $20.58
  totals and $0.00 daily difference. Hourly differences may still vary while their
  daily sum is zero; the plots preserve those original differences.

The Stripe reference image was unavailable. Visual assessment uses the supplied
written acceptance criteria rather than claiming a pixel-exact reference match.

Evidence: `artifacts/linear-analytics/`, including before/after captures, tooltip
captures, `verification.json`, and `accessibility.json`. No merge or deployment.
