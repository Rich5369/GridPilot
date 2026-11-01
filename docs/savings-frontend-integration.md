# Savings opportunities frontend integration

P0 (endpoint integration, recommendation cards and onboarding context), P1
(typed evidence forms, missing-data follow-up and non-EV journeys), and P2
(targeted navy/teal styling, mobile and accessibility checks) are implemented on
`feature/savings-opportunities`. The existing workspace, daily optimizer,
exact-result advisor, device plans and What-if workflow are retained.

The workspace was updated through merged PR #52 (`64d761c`), then PR #53
(`911f381006ebf1ec597b86e19de29e74da0b205a`) merged during verification and was
incorporated. The final fetch also found merged PR #54,
`d448a0cd53928adf196b91e8223faebc2713b67a`, which was incorporated before final
acceptance. No open PR was automatically merged. Backend,
optimizer, API schemas, dependencies, deployment settings and provider configuration
are unchanged by this feature. Local acceptance is not hosted acceptance.

## Requests and evidence

The new **Savings opportunities** dashboard item uses the existing API base URL:

| Endpoint | Trigger and behavior |
| --- | --- |
| `GET /api/savings/catalog` | Read-only on entering the view; explicit retry on failure. Known typed forms remain usable without the catalog. |
| `POST /api/savings/recommendations` | **Calculate savings without AI**; sends `SavingsRequest`. |
| `POST /api/ai/savings/conversation` | **Ask AI to select opportunities**; sends question, bounded session history, `evidence: SavingsRequest`, and explicit category confirmations. |

No Scenario or optimizer result ID is sent to the savings endpoints. The existing
exact-result Energy Advisor remains separate. Requests and responses have explicit
TypeScript types and runtime guards; results are matched to supplied measure IDs,
category, evidence, load and returned `inputs_used`. No numerical result is derived
from AI prose. API version `1`, the 16 catalog categories and existing status fields
are respected. PR #53's additive recurring non-energy benefit is supported, while
responses predating that optional field remain readable. Unanswered PR #53
fields are omitted so the original evidence-only requests remain compatible with
older servers; explicitly supplied benefits require the newer backend.

Onboarding's saved business context supplies only supported profile fields:
business type, employee count, operating hours, bill/consumption descriptions,
equipment, goals and restrictions. Corrections in the view update that same saved
context. Building name/identity stays frontend-only. State, ZIP, city, utility and
rate-plan metadata are collected explicitly in the view; ZIP is not geocoded.
Business hours, employee count, monthly spending, demo hourly prices and EIA state
averages never supply equipment runtime, consumption or a customer tariff.

Every category has **Yes / No / Not sure**. Only explicit Yes/No becomes a strict
boolean in conversation `category_applicability`; unknown keys are omitted.
The deterministic body never receives this map. Per-project applicability remains
separate, and contradictory category/project answers block submission for correction.
No EVs or an analysis-mode omission does not imply no other scheduling equipment.

Six forms use the existing typed calculator fields: LED, lighting controls,
after-hours shutdown, office power management, motors and refrigeration.
Projects retain their own IDs and load IDs even in the same category. Known
identity/source fields are required; measurements may remain unknown for follow-up.
Safety and equivalent-service confirmations start unknown. Switching off loads
requires explicit safety/nonessential evidence; the UI never defaults it.
Unsupported numerical categories remain investigations with catalog requirements;
scheduling links to the existing configuration without replacing its inputs/mode.

## Truthful financial and conversation states

Cards preserve backend order, priority reason, applicability, status, provenance,
inputs, sources, missing information and next actions. Submitted projects,
AI-selected investigations, unselected general guidance and exclusions appear
separately. All catalog guidance is not presented as personalized investments.
`quantified` means caller-reported energy measurements, not an independent audit or
proof of realized savings. Synthetic examples are explicitly labeled.

Each annual field is rendered independently: null means unknown; valid zero and
negative values remain visible. Gross electricity savings, recurring non-energy
benefits and net savings have separate labels. Blank recurring benefits mean
**not included in this estimate**, not confirmed zero. Positive benefits require
their own annual basis/source and exclude energy savings, demand charges, one-time
incentives and double counting. Backend payback and ROI are displayed directly,
never reconstructed from rounded dollars. No daily result is annualized and no
standalone project amounts are summed; portfolio savings remain withheld.

The historical EIA commercial benchmark is expandable context, separate from the
customer-specific flat avoidable energy rate. Rate source, dates and applicability
confirmations are explicit. Expired/future/unconfirmed rates are passed unchanged
for backend evaluation. Missing rate, incremental expenses and upfront cost retain
the backend's distinct null behavior.

AI `source: meta` is labeled AI-assisted category selection; calculations remain
attributed to the deterministic engine. `deterministic_fallback` explicitly says AI
selection was unavailable, preserving valid calculations and standard guidance.
HTTP 200 alone is not described as successful Meta selection.

One in-flight savings submission is allowed. No automatic paid call/retry runs.
Catalog/calculation/conversation client wait budgets are 12/45/60 seconds; these
are not server deadlines. Cancel stops waiting, preserves inputs/results and warns
that the server may continue. HTTP 422 errors show field paths, preserve evidence
and allow an explicit deterministic retry. Late/unmounted responses are ignored;
results returned after edits remain labeled as belonging to previous submitted
inputs. Failed/canceled attempts cannot masquerade as a newly accepted result.

PR #54 adds per-project nonblocking plausibility/evidence warnings, shown beside
financial results without duplicating their top-level copies. Global overlap and
service warnings remain visible. Optional operating-baseline/comparison-condition
confirmations start unknown, are omitted until explicitly answered, and never
replace safety or equivalent-service gates. No values are clamped or corrected.
A real 1,000 kW controls test retains 500,000 kWh/year and its unit-review warning
after operating-baseline confirmation removes only that evidence limitation.

## Save and Resume

A bounded, validated optional `workspace.savingsDraft` extends the existing version-1
browser record: location, project identities/evidence/numeric text, rate information,
category confirmations and question draft. Existing records without it still load.
Saved business context remains the existing independent profile. Storage is **Saved
in this browser**, with the existing error/clear-workspace behavior. Results,
conversation history and IDs are not persisted or automatically replayed. Returning
to the view requires an explicit calculation. Real accounts, server persistence,
cross-device sync and multi-tab reconciliation remain separate work.

## Local verification

The machine-readable [acceptance capture](../artifacts/savings-frontend/verification.json)
records the exact tested frontend commit
`52da550e74d59607811ec927003c771f3b1c61ca`, backend tree
`6c6104d405cd02bd2e0e9e7b1f1d8de6bb35659a`, submitted bodies, actual
responses, injected UI fixtures, checks and screenshot names. The frontend and
backend execute from the same checkout; the backend tree is identical to merged
`d448a0c`. Subsequent documentation/evidence commits do not change that implementation.
Four targeted desktop/mobile WCAG scans reported zero violations; screenshots
were visually inspected for readability and horizontal overflow. All businesses,
rates and measurements below are fictional test evidence.

| Real local backend case | Actual result |
| --- | --- |
| Office LED: 100 × (60−10) W, 10 h/day, 250 days/year, $0.20/kWh, $0 expense, $2,500 upfront | 12,500 kWh/year; $2,500 gross/net; 1-year payback; 100% simple annual ROI |
| Same energy evidence, PR #53: $300 documented non-energy benefit, $100 expense, $2,700 upfront | $2,500 gross energy, $300 separate benefit, $2,700 net; 1 year and 100% ROI |
| Missing rate | 12,500 kWh; financial results/payback null |
| Missing annual expenses | Gross $2,500; net/payback/ROI null |
| Missing upfront cost | Net $2,500; payback/ROI null |
| Annual expenses $3,000 / $2,500, no additional benefit | Net −$500 / $0; displayed as returned |
| Warehouse: unknown main lights + separate 20-fixture pilot, 60→10 W, 8 h/day, 250 days | Main energy unknown; pilot 2,000 kWh/year; monetary results unknown |

The browser runner types through real onboarding and forms and checks remaining
five calculator forms, invalid numerical input, overlap warnings, explicit retry,
pending-edit staleness, cancellation, refresh without result replay, non-EV
flexible-equipment applicability, keyboard navigation, daily device plans and real
What-if comparison/Apply/Restore. Financial comparisons use `1e-7` absolute
tolerance against known fixture outputs; production UI does not recompute them.

**Injected, not live:** Meta-success/fallback selection replies, EIA-unavailable
presentation and delivery of a captured real HTTP 422 error through the UI. These
are separately identified in the JSON; injected Meta screenshots carry an explicit
QA banner. All AI browser routes are intercepted. No paid Meta or production
request is part of this acceptance. Original engine responses used beneath the EIA
presentation fixture remain recorded separately.

Commands (from the repository root):

```bash
npm --prefix frontend test
(cd frontend && npx tsc -b)
npm --prefix frontend run lint
npm --prefix frontend run build
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m pytest -q \
  backend/tests/test_savings_plausibility.py backend/tests/test_operating_cost_savings.py \
  backend/tests/test_savings.py \
  backend/tests/test_savings_advisor.py backend/tests/test_savings_reasoning.py \
  backend/tests/test_savings_responsiveness.py backend/tests/test_eia_retail.py
```

Results: **298 frontend tests passed; two opt-in live tests skipped**. **182 focused
backend tests passed** without production code changes. TypeScript, lint and
production build pass. Lint retains two existing `CostBreakdown.tsx` Fast Refresh
warnings; backend tests retain the existing Starlette/httpx deprecation warning.
Vite reports a >500 kB main bundle advisory; the Savings view is lazy-loaded and no
new dependency was added. Bundle partitioning is not changed in this scoped feature.

To repeat browser checks, install Playwright and `@axe-core/playwright` outside the
repository (or use an existing installation), install Chromium, build with
`VITE_API_BASE_URL=http://127.0.0.1:8020`, start the real backend on 8020 with
`MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0` and
`CORS_ORIGINS=http://127.0.0.1:5300`, and run Vite preview on 5300. Then:

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
AXE_MODULE=/absolute/path/to/node_modules/@axe-core/playwright \
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5300 \
node scripts/verify_savings_frontend.cjs
```

The script intentionally uses the local backend URL for the invalid-request probe.
Use a fictional test workspace: it creates its own browser contexts. It rewrites
local acceptance artifacts. These commands do not authorize deployment or live AI.

Desktop/mobile evidence:

- [Office input form, mobile](../artifacts/savings-frontend/office-evidence-mobile.png)
- [Office results, desktop](../artifacts/savings-frontend/office-result-desktop.png)
- [Office results, mobile](../artifacts/savings-frontend/office-result-mobile.png)
- [Recurring non-energy benefit](../artifacts/savings-frontend/recurring-benefit-desktop.png)
- [Unknown rate](../artifacts/savings-frontend/unknown-rate-desktop.png)
- [Warehouse injected selection, desktop](../artifacts/savings-frontend/warehouse-meta-fixture-desktop.png)
- [Warehouse injected selection, mobile](../artifacts/savings-frontend/warehouse-meta-fixture-mobile.png)
- [Explicit fallback, mobile](../artifacts/savings-frontend/warehouse-fallback-mobile.png)
- [Overlap warning](../artifacts/savings-frontend/overlap-desktop.png)
- [Advisory warnings, desktop](../artifacts/savings-frontend/advisory-warnings-desktop.png)
- [Advisory warnings, mobile](../artifacts/savings-frontend/advisory-warnings-mobile.png)

## Richard's remaining dependencies

No remaining P0/P1/P2 implementation blocker was identified locally. Richard must
confirm the exact serving backend revision includes #51/#52 responsiveness and
#53's optional recurring-benefit fields and #54's advisory evidence contract
before accepting those new inputs in hosted use. Older responses remain renderable, but an older server rejecting newly supplied
fields produces a visible 422 rather than silently losing evidence. Git merges do
not establish a deployed revision.

Hosted frontend/backend acceptance and separately authorized genuine Meta selection
remain Richard's release work under the canonical handoff's gates. He also owns
provider latency/reliability, pricing data and calculator correctness. This PR makes
no production success claim and does not merge or deploy itself.
