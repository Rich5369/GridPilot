# Full-page Meta Energy Advisor correction

The shared header contains one Ask Meta Energy Advisor navigation action. It opens the existing `EnergyAssistant` screen (`#assistant`), replacing the duplicate modal trigger and the old Ask Energy Advisor label. While viewing the advisor, Close Energy Advisor returns to the previous page and retains the existing composer/history behavior.

The full-page EnergyAssistant component is unchanged: business context, suggested questions, conversation history, scenario recommendations, review, Compare with Meta and Apply Changes remain intact. It is not replaced by or combined with the savings conversation component.

Removed the savings modal markup, portal, modal state, submission handler and modal CSS. Savings keeps its evidence forms, validation, catalog investigations, calculations, error/cancel/retry handling and existing results. The old Help me find opportunities accordion remains absent. Shared API helpers, data contracts and stored draft schemas remain intact. No backend, optimization, savings-formula or Meta-configuration changes.

## Base and preserved work

Based on latest main `1dde3e436d79539d2e230c31818dcc65d4713ecc`, including reviewed merged PRs #71–78. This includes the latest landing-page annual-reduction change (#78), full-page comparison/review changes (#74–75), and prior modal changes (#76–77), which this correction explicitly supersedes. Latest main was fetched again before commit with no newer revision. Original uncommitted work remains in its original checkout; implementation uses `/tmp/gridpilot-full-page-advisor`.

## Verification

- Full frontend suite: 352 passed; two existing opt-in HTTP tests skipped.
- Focused Dashboard, Savings and EnergyAssistant regressions: 38 passed.
- Lint and production build pass with existing CostBreakdown Fast Refresh and bundle-size warnings.
- Production-build Chromium verifies navigation from Overview, Savings, Energy plan, My building, Optimization, What-if and markets at 1440px and 390px. One Ask Meta button per source page, correct `#assistant` route, no dialog, no removed accordion, retained composer/return navigation and no automatic AI requests.
- One explicitly injected `source: mock` reply verifies retained full-page history and proposal review/Apply/Compare controls. The UI labels it MOCK MODE — NOT META AI. No genuine/paid Meta inference was performed, and all other AI requests were blocked. Zero page errors.
- `git diff` confirms EnergyAssistant and backend are unchanged from main. Cloud Blue styling remains intact.

Browser reproduction: production build with VITE_API_BASE_URL set to a nonempty backend origin, preview on port 5173, then run `scripts/verify_full_page_meta_advisor.cjs` with PLAYWRIGHT_MODULE pointing to an external Playwright installation. The script intercepts API traffic; it needs no running backend or live provider. Report/screenshots: `artifacts/full-page-meta-advisor/`.

The earlier modal acceptance reports/scripts are historical and describe the superseded implementation. No automatic merge or deployment commands were run.
