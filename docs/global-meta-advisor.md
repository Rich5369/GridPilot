# Meta advisor on every dashboard page

Historical verification of the superseded modal UI. The current correction is documented in [Full-page Meta advisor](full-page-meta-advisor.md).
The shared header shows Ask Meta Energy Advisor on all eight dashboard views. It opens the same retained savings conversation over the current page; opening does not submit a request. The separate Ask Energy Advisor action retains daily scheduling, scenario comparison and Apply behavior.

The native modal is rendered into document.body so hidden Savings content cannot hide it on other pages. Estimate savings reveals the Savings page before the existing evidence handler opens/focuses the form. Questions, responses and follow-up history remain shared across views. Escape closes only the modal, including when the underlying page is the daily Energy Advisor; focus returns to the Meta opener.

Based on merged #76, main `2651e5a`. Original uncommitted work is preserved in its original checkout. No backend, formula, contract or provider configuration changes.

Validation:

- Full frontend suite: 359 passed; two existing opt-in HTTP tests skipped.
- Dashboard/Savings regression suite rerun after final Escape fix.
- Production build and lint pass with existing bundle-size and CostBreakdown warnings.
- Chromium checks all eight views at 1440px and 390px: modal visible, opening sends no AI request, Escape preserves the page and restores focus, drafts persist, and one explicit question hands a recommendation from My building to the visible Savings evidence form. No page errors.
- Browser AI response was injected and labeled as test evidence, not genuine Meta inference. No live/paid AI calls, merge or deployment commands were run.

Reproduce with the dev frontend on port 5173 and the unchanged local backend on port 8000, then run `scripts/verify_global_meta_advisor.cjs` with PLAYWRIGHT_MODULE pointing to an external Playwright installation. All AI routes are intercepted or blocked by the script.
