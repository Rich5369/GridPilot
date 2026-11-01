# Cloud Blue frontend redesign

Based on refreshed `origin/main` at `593b6ac` (PR #58). The working tree was clean before implementation. Reviewed merged frontend PR #57 (goal-led savings and daily planning) and #58 (concise Advisor responses); GitHub reported no open PRs. Their existing flows are reused. No reference mockup image was supplied with the request, so the written layout and simplicity requirements guide the implementation.

## Behavior and design

- `#home` is a separate single-screen landing page with the requested headline, description, two navigation destinations and two hero actions. No lower marketing sections or footer. The desktop image is a capture of the existing verified synthetic example's demand chart, with explicit illustrative labeling and no financial numbers. Mobile and short viewports hide it.
- Get started uses `#setup`. New and unfinished buildings use the existing validated form and saved draft step. Returning users see the existing saved-workspace resume/edit controls; editing is explicit and retains inputs. Visiting public pages does not replace saved information or start optimization/AI calls.
- `#learn-more` contains exactly the three requested explanatory sections, a home link, and Get started. All existing dashboard, alias and isolated example hashes remain supported.
- Shared Cloud Blue variables replace the legacy color literals across all three active stylesheets. White surfaces, subtle borders, blue actions and contrasting chart series apply throughout setup, overview, savings, plan/configuration, comparison, What-if, building, markets and Advisor. Primary blue is refined to `#2372B2` for accessible small text and button contrast. Success, warning and error colors remain distinct.
- Setup is one centered form. Removed the introductory sidebar, lower promotional sections and footer. Employees and electricity bill are under Additional details. Days open and optional ZIP code persist as browser-local context, with backward-compatible optional fields; they do not change backend calculation inputs. Existing AM/PM selectors, energy-profile steps and the savings-first path remain. Reversed operating hours are rejected before either workflow.
- Layout uses `min-height: 100dvh` and natural flow, allowing scrolling for small screens and enlarged text rather than clipping essential actions.

## Files changed

- `frontend/src/pages/Welcome.tsx`, `frontend/src/App.tsx`, `frontend/src/services/navigation.ts`: public pages and routing into existing setup.
- `frontend/src/pages/Setup.tsx`, `frontend/src/types/workspace.ts`, `frontend/src/services/workspaceStorage.ts`: simplified form and optional saved context.
- `frontend/src/index.css`, `frontend/src/command-center.css`, `frontend/src/product-design.css`: shared semantic palette, responsive layouts, states and focus styles.
- `frontend/src/components/DemandChart.tsx`, `frontend/src/components/dashboard/CommandAnalytics.tsx`, `frontend/src/data/chartPresentation.ts`: contrasting chart colors and readable axes.
- `frontend/src/components/dashboard/EiaRetailExplorer.tsx`, `frontend/src/components/dashboard/MarketExplorer.tsx`: light map presentation and blue benchmark scale.
- `frontend/src/assets/dashboard-preview.png`: browser capture of the existing synthetic example; provenance is `frontend/src/data/examplePlan.json`, checked by the existing example-plan test.
- `frontend/src/App.test.tsx`, `frontend/src/pages/Setup.test.tsx`, `frontend/src/services/navigation.test.ts`: public-page isolation, routing, preserved workflow tests and operating-hour validation.
- `scripts/verify_cloud_blue.cjs`, `artifacts/cloud-blue/*`: repeatable browser verification and screenshots.

## Validation

All 317 frontend tests passed (2 opt-in HTTP tests skipped in that run); both opt-in real HTTP integration tests passed separately. Lint, TypeScript and the production build passed. Lint retains two existing `CostBreakdown.tsx` Fast Refresh warnings; Vite retains its existing large bundle advisory. No backend calculations, schemas, solver mathematics, provider settings or dependencies were changed.

Browser verification uses Chromium against the actual local Vite frontend and FastAPI backend. AI endpoints are blocked. The annual LED example is calculated by the real Savings Engine; the overview screenshot uses a real non-EV daily backend calculation. Checks cover:

- Zero home scrolling at 1440×900, 1366×768, 1280×720 and 1024×768; both hero actions visible.
- Desktop/mobile layout, keyboard focus, and access to actions at 320×480 with enlarged hero text.
- Separate Learn more route, Get started, required fields, saved name/ZIP/days restoration, savings-first setup, annual results, daily calculation and overview chart.
- Existing plan/building/Advisor/comparison/What-if/markets deep links, shared background, and returning-user edit behavior.
- Fourteen WCAG A/AA accessibility scans covering public pages, setup/savings on desktop and mobile, overview and remaining major pages. Automated scans supplement the browser checks; they are not a complete accessibility certification.

Run with existing local servers at ports 5173 and 8000:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright node scripts/verify_cloud_blue.cjs
GRIDPILOT_LIVE_API=1 npm run test:integration --prefix frontend
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Screenshots: [desktop landing](../artifacts/cloud-blue/landing-desktop.png), [mobile landing](../artifacts/cloud-blue/landing-mobile.png), [Learn more](../artifacts/cloud-blue/learn-more.png), [setup](../artifacts/cloud-blue/building-setup.png), [mobile setup](../artifacts/cloud-blue/building-setup-mobile.png), [overview](../artifacts/cloud-blue/overview-desktop.png), [savings](../artifacts/cloud-blue/savings-desktop.png), [mobile savings](../artifacts/cloud-blue/savings-mobile.png). Machine-readable results: [verification.json](../artifacts/cloud-blue/verification.json).

Branch: `feature/cloud-blue-redesign`. Prepared for review; no merge or deployment requested or performed. Live Meta output is not exercised by this design verification.
