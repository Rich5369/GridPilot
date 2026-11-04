# Meta AI visibility

Based on main `69be4bc`, including merged PR #71. Reviewed recent PRs #65–71: preserve the Savings copy cleanup, Cloud Blue navigation, startup recovery, and landing statistics. The original workspace's unrelated uncommitted edits remain untouched in its original checkout.

## Changes

- A compact **Ask Meta AI** action in the existing Savings introduction opens and focuses the existing question form, now above the evidence forms.
- On that explicit action, an empty question receives the editable example “How can my business lower its electricity costs?” Existing saved questions are retained. Opening, editing and returning to the question never sends an AI request; **Submit question** is required.
- Accepted `meta` responses show **Selected by Meta AI**. Accepted `deterministic_fallback` responses show **Standard guidance — Meta unavailable**.
- Selected categories with an existing annual calculation form show **Estimate savings** on their existing recommendation action. It reuses the existing project lookup/add/open handler. Scheduling and categories without an annual calculator retain their existing navigation/investigation handling.
- The existing Ask Energy Advisor remains available for daily planning. No second assistant, new calculations, backend changes, dependency changes, API contract changes, or CSS/theme changes.

## Verification

- `npm test --prefix frontend`: 330 passed; two existing opt-in HTTP tests skipped.
- `npm run build --prefix frontend`: TypeScript project checks and production build passed. Also built with `VITE_API_BASE_URL=http://127.0.0.1:8000` for local production-browser verification.
- `npm run lint --prefix frontend`: passed, with two existing Fast Refresh warnings in CostBreakdown. Production build retains the existing large-chunk advisory.
- New component coverage checks disclosure order, focus, editable example, preservation of saved questions, no automatic AI/calculation calls, exact source labels, and the selected evidence form.
- `scripts/verify_meta_visibility.cjs` runs Chromium against the local production build at port 5300 and unchanged local backend at port 8000. Set `PLAYWRIGHT_MODULE` and `AXE_MODULE` to installed Playwright and @axe-core/playwright modules if needed. All browser AI endpoints are intercepted or blocked. Injected responses use the exact request's deterministic evidence response, preserving the production response validator.
- Both injected source variants complete: Ask Meta AI → Submit question → selected LED opportunity → Estimate savings → existing LED evidence form → Calculate savings. The fictional repository LED evidence returns 12,500 kWh/year and $2,500/year net from the actual Savings Engine; initial financial unknowns remain unknown. Exactly one explicit AI request and one UI calculation per journey. No live provider inference.
- Drafts survive refresh, Energy Advisor still opens/closes, and desktop/mobile widths 1440, 390 and 320 have no horizontal overflow. WCAG scans include returned recommendations and the expanded form at all three widths. No violations or page errors.

Evidence: [browser report](../artifacts/meta-visibility/verification.json), [top action](../artifacts/meta-visibility/meta-desktop.png), [mobile form](../artifacts/meta-visibility/meta-390.png), [Meta selection](../artifacts/meta-visibility/meta-selection.png), [fallback selection](../artifacts/meta-visibility/deterministic_fallback-selection.png).

No paid Meta calls, backend configuration edits, merge, or deployment performed. Source labels are verified with injected responses, not claimed as live-provider acceptance.
