# Thin-line analytics review

Branch: `feature/premium-analytics`, based on fetched `origin/main` at `904c618`. PR #36 is merged into that base; there were no open PRs at inspection. Implementation is isolated in `.chart-redesign`; the original worktree and its unrelated edits were preserved. No merge or deployment was performed.

## Visual comparison with the supplied reference

The supplied Stripe dashboard and the two GridPilot screenshots were inspected before continuing implementation. Stripe's large gross-volume graph and small report graphs use thin purple and gray comparison lines, essentially no fill, minimal axis treatment, and strong numbers above compact plots. GridPilot's supplied demand and tariff plots have heavier step strokes and fills; its cost comparison is two solid bars.

The final screenshots were compared directly with that reference:

| Visual property | Stripe reference | Final GridPilot graphs |
| --- | --- | --- |
| Graph marks | Thin purple and gray lines | Thin teal, blue, purple and gray lines; no bars or comparison tracks |
| Area fills | Essentially absent | No area fills in demand, tariff, cost, source breakdown, or KPI plots |
| Miniature graphs | Paired lines under prominent metrics | 1.5px scenario sparklines; muted baseline lines for cost and demand |
| Comparison | A quiet reference line and accent line | Gray dashed baseline, teal optimized; exact daily totals stay above the hourly cost plot |
| Grid and axes | Quiet, sparse framing | Very subtle horizontal grids, muted labels, explicit units and sparse time ticks |
| Interpolation | Angled segments appropriate to Stripe's data | Exact hourly `stepAfter` transitions throughout; no unsupported subhourly curves |
| Framing | Low emphasis on container borders | Softer borders, restrained icons, lighter numeric weight and generous plot spacing; GridPilot's dark blue branding retained |

The reference is a conversation attachment, not reproduced in this repository. These are scenario profiles rather than historical or cumulative revenue graphs.

## Implementation and numerical meaning

- Demand: baseline 1.5px dashed gray, fixed-demand 1.5px blue, optimized 1.8px teal, and a restrained dashed power-limit reference. The optional source breakdown now also uses separate thin lines; source toggles and tables remain available.
- Tariff: 1.6px purple line with no fill. Its actual minimum and maximum hourly input rates are shown above the plot. A closing sample extends the last one-hour interval to 24:00; the input table remains exactly 24 rows.
- Cost: two genuine hourly energy-cost series derived from **submitted** demand and tariff arrays. Each interval is `average kW × 1 hour × USD/kWh = USD`. The daily values displayed above the chart remain the exact solver-reported totals, formatted as currency.
- `hourlyAnalytics` validates complete finite 24-hour arrays and reconciles each derived series with its solver total to absolute tolerance `1e-5 USD` before displaying it. Missing/mismatched hourly data yields numerical totals and an unavailable message, rather than a fabricated series. An infeasible result can still show its genuine baseline line; optimized values remain unavailable.
- KPI cost, cost-difference and headroom profiles use the submitted snapshot. The cost-difference line is hourly baseline cost minus optimized cost; headroom is submitted site limit minus actual hourly optimized demand. Negative hourly charges and differences are preserved.
- The 25th sample is a rendering-only closing boundary, never an extra hour in cost/energy sums. The closing tooltip describes 23:00–24:00.
- Shared tooltip and legend replace Recharts defaults: aligned values, explicit one-hour intervals, precise units, a dashed crosshair and small active markers. Tables and keyboard chart access remain available.
- Device timeline styling aligns with the quieter surfaces and palette; proof, held-at-baseline, availability and power encoding remain intact.

No solver mathematics, engineering outputs, API contracts, feasibility/proof logic, or submitted-versus-draft/stale behavior were modified. No runtime dependencies were added.

## Files changed

| File | Purpose |
| --- | --- |
| `frontend/src/components/dashboard/CommandAnalytics.tsx` | Line sparklines, unfilled tariff, true hourly cost comparison and tables |
| `frontend/src/data/hourlyAnalytics.ts` | Guarded, reconciled display derivations from the submitted snapshot |
| `frontend/src/data/hourlyAnalytics.test.ts` | Signed charges, reconciliation, missing/mismatched data, closing boundary and infeasibility |
| `frontend/src/components/DemandChart.tsx` | Thin unfilled demand/source lines, reference, legend, crosshair, accessible chart group |
| `frontend/src/components/ChartPrimitives.tsx` | Shared tooltip and legend |
| `frontend/src/data/chartPresentation.ts` | Shared axis/cursor styling and interval formatting |
| `frontend/src/command-center.css` | Analytics hierarchy, spacing, tooltip, totals, responsive layout and timeline alignment |
| `frontend/src/components/dashboard/CommandAnalytics.test.tsx` | Update chart mock for line charts |
| `scripts/verify_premium_analytics.cjs` | Real API browser assertions, responsive captures and accessibility checks |
| `artifacts/premium-analytics/` | Before/after images and machine-readable verification evidence |
| `docs/premium-analytics-review.md` | This review record |

## Before and after

Matching captures use real local joint-scheduling solver responses with identical daily optimized cost (`20.576000099999998 USD` before display rounding).

| View | Before | After |
| --- | --- | --- |
| KPI cards, desktop | [Before](../artifacts/premium-analytics/before-kpis-1440.png) | [After](../artifacts/premium-analytics/after-kpis-1440.png) |
| Demand, desktop | [Before](../artifacts/premium-analytics/before-demand-1440.png) | [After](../artifacts/premium-analytics/after-demand-1440.png) |
| Tariff and hourly cost, desktop | [Before](../artifacts/premium-analytics/before-analytics-1440.png) | [After](../artifacts/premium-analytics/after-analytics-1440.png) |
| Full dashboard, desktop | [Before](../artifacts/premium-analytics/before-1440.png) | [After](../artifacts/premium-analytics/after-1440.png) |
| Full dashboard, tablet | [Before](../artifacts/premium-analytics/before-768.png) | [After](../artifacts/premium-analytics/after-768.png) |
| Full dashboard, mobile | [Before](../artifacts/premium-analytics/before-390.png) | [After](../artifacts/premium-analytics/after-390.png) |
| Mobile hourly cost hover | — | [Tooltip](../artifacts/premium-analytics/after-cost-tooltip-390.png) |
| Stale submitted snapshot | — | [Unchanged submitted costs](../artifacts/premium-analytics/after-stale.png) |
| Infeasible result | — | [Baseline only, optimized unavailable](../artifacts/premium-analytics/after-infeasible.png) |

## Verification

- Frontend Vitest: **117 passed, 2 skipped**; 17 files passed, 1 skipped. Skips belong to the existing opt-in live API integration suite.
- TypeScript and production Vite build: passed (`npm run build`). Browser build uses `VITE_API_BASE_URL=http://localhost:8000` for the real temporary local API.
- Lint: passed with two pre-existing Fast Refresh warnings in `CostBreakdown.tsx`; no new warnings.
- Production Chromium at 1440, 768 and 390px: no page overflow; correct chart geometry, two cost-line paths, no area/bar marks, all 24 hourly cost cells equal demand × submitted tariff, both daily sums reconcile within `1e-5 USD`, correct kW / USD / $/kWh tooltip units, and correct final-hour tooltip. Stale draft changes retain submitted cost values; infeasible results retain baseline only. See [verification.json](../artifacts/premium-analytics/verification.json).
- Axe on changed KPI, comparison and tariff/cost regions: zero violations; see [accessibility.json](../artifacts/premium-analytics/accessibility.json).
- Existing E1 browser regression passed: exact device-hour values, energy/windows/caps, aggregate/cost/peak reconciliation, held semantics, recovery, infeasibility, stale snapshot, keyboard behavior and all three widths. See [device regression evidence](../artifacts/premium-analytics/device-regression/acceptance.json). Only its preview URL and artifact path were adapted.
- `git diff --check`: passed.

Browser reproduction: pristine main frontend on 5194, production preview on 5193, unchanged backend on 8000 with `CORS_ORIGINS=http://localhost:5193,http://localhost:5194`. Run `NODE_PATH=<browser QA dependency directory> node scripts/verify_premium_analytics.cjs` from the worktree. Playwright and `@axe-core/playwright` are external browser QA dependencies, not new app dependencies.

## Limits

Browser evidence covers Chromium and mobile viewport emulation, rather than physical touch devices or Safari/Firefox. Axe applies to the changed analytics regions, not a whole-application audit. Stripe's specific data shapes are intentionally not reproduced: GridPilot renders its real hourly scenario values and step boundaries.
