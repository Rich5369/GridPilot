# Savings opportunities copy cleanup

Starting main: `9c06ab2`. Branch: `feature/savings-copy-cleanup`.

The working tree was clean. Fetched origin, reviewed the recent PR history and inventoried all 64 repository PRs: all were merged, with no open or draft PRs. Main includes #62 (dashboard clarity/Advisor), #63 (powerline landing) and #64 (demand preview/What-if spacing). PR #64 was rechecked and confirmed merged. No unfinished work was integrated.

## Copy changes

- Removed the exact annual-estimate introduction sentence, the entire saved-setup/caller-context paragraph under About your building, and both architecture/applicability paragraphs under Which equipment does your building have. A source search confirms none of those passages remains in frontend source.
- Kept the requested introductory description, section headings, all inputs and Yes/No/Not sure choices. No replacement paragraphs were inserted into the building/equipment sections.
- Shortened field labels, project instructions, empty-state text and status messages. Removed request timing/retry implementation prose beneath Calculate savings. The existing financial inputs retain their explanation that blanks are unknown, not zero.
- Replaced internal result wording such as ENGINE ORDER and deterministic fallback with Priority and standard guidance. Removed the explanation of backend ordering and endpoint/request construction from result areas.
- Moved the net-savings formula explanation into the existing How this was calculated disclosure. The existing introductory disclosure uses the same label and retains modeled/annual scope, saved-input/session behavior and the distinction between business context and measured equipment/rates.
- Retained visible modeled/scenario/synthetic status, financial units and periods, unknown-value rendering, missing information, critical equipment safety notices, stale/error states, actual returned warnings, and a concise do-not-add/overlap warning. Financial assumptions, input/provenance data and source links remain accessible.

## Scope and files

- `frontend/src/components/savings/SavingsOpportunities.tsx`: removed requested passages and simplified page/field copy.
- `frontend/src/components/savings/SavingsMeasureForm.tsx`: shorter project and operating-condition guidance; safety and financial limitations preserved.
- `frontend/src/components/savings/SavingsResults.tsx`: simpler result labels, overlap warning, optional-guidance copy and existing calculation disclosure.
- `frontend/src/components/savings/SavingsResults.test.tsx` and `SavingsOpportunities.test.tsx`: updated text assertions for the intentional wording changes; numerical assertions unchanged.
- `scripts/verify_savings_copy.cjs`: repeatable before/after browser verification with actual local savings calculations.
- `artifacts/savings-copy/*`: screenshots and verification report.
- This document records review and validation.

No CSS, theme, layout system, backend, API schemas, request-building logic, applicability conditions, business-profile mapping, missing-data handling, financial validation, AI selection/fallback logic or storage implementation changed. The powerline landing, overview cards, Advisor control and other views are preserved. Removing paragraphs lets existing document flow close their space naturally.

## Validation

All 320 frontend tests passed (2 opt-in HTTP tests skipped). TypeScript, lint and the production build passed. The existing two CostBreakdown Fast Refresh lint warnings and large-bundle advisory remain. Browser tests exercise the actual local frontend and unchanged FastAPI Savings Engine; AI endpoints are blocked and no live Meta request is made.

Chromium verifies:

- Exact introductory passages removed without replacement technical paragraphs; desktop/mobile layouts remain readable.
- Employee-count edits survive reload; Yes, No and Not sure equipment choices retain their values.
- Real synthetic LED calculation returns $2,500.00 net annual savings, with synthetic labeling and accessible calculation evidence.
- Removing the rate leaves financial savings unknown. Additional annual costs of 3,000 and 2,500 preserve negative and zero net savings, respectively.
- Implausible input warnings remain visible. Financial fields, evidence disclosure and warnings retain their existing behavior.
- Overview, Advisor open/return and the powerline landing still work.
- Three desktop/mobile/result accessibility scans report no violations, with no page errors.

The synthetic example is explicitly fictional and used only for verification; no customer savings are claimed. Calculation/request source directories were checked and are unchanged.

Run with Vite on port 5173 and FastAPI on port 8000:

```sh
npm test --prefix frontend -- --maxWorkers=1
npm run lint --prefix frontend
npm run build --prefix frontend
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright node scripts/verify_savings_copy.cjs
```

The browser script also accepts `--before` for capturing a baseline from the original checkout.

Screenshots: [before desktop](../artifacts/savings-copy/before-desktop.png), [after desktop](../artifacts/savings-copy/after-desktop.png), [before mobile](../artifacts/savings-copy/before-mobile.png), [after mobile](../artifacts/savings-copy/after-mobile.png), [result desktop](../artifacts/savings-copy/after-results-desktop.png). [Verification report](../artifacts/savings-copy/verification.json).

Prepared for review. No merge or explicit deployment performed.
