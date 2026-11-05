# Savings Meta advisor modal

Historical verification of the superseded modal UI. The current correction is documented in [Full-page Meta advisor](full-page-meta-advisor.md).
The Savings page header now opens the existing Meta savings conversation in a native modal. The standalone “Help me find opportunities” accordion and duplicate introduction-card action have been removed. The introduction retains Edit building summary and How this was calculated.

Question drafts, retained responses, selected recommendations and follow-up history survive closing/reopening. Opening never sends an AI request. Only Submit question submits the current question. Closing during a pending request keeps waiting; Cancel advisor request explicitly stops waiting. Escape and the close button dismiss the modal; native modality contains keyboard focus and restores it to the opener. The close action remains visible when scrolling results.

Estimate savings closes the modal and reuses the existing project lookup/add/open handler. Investigation-only categories and daily scheduling handoffs keep their existing behavior. A subsequent non-AI calculation does not erase the retained advisor response. Edited evidence continues to mark old results stale, and history resets when the evidence context changes. The existing `meta` and `deterministic_fallback` labels remain unchanged. Calculation notices follow the answer in a collapsed disclosure; the overlap warning remains visible.

Daily Energy Advisor behavior, reviewed scenario comparisons (#74–75), optimization, financial formulas, backend contracts and provider configuration are unchanged.

## Base and isolation

Base: `1bf40b9f9a0cef12e27a0dca476724bc2b403432` (`origin/main`). Reviewed the ten latest merged PR descriptions, #66–75:

- #75: advisor scenario review below send controls.
- #74: reviewed Meta scenario comparisons.
- #73: Ask Meta Energy Advisor savings label.
- #72: discoverable Meta savings selection and evidence handoff.
- #71: modeled landing-page statistics.
- #70: bounded backend recovery and timeline readability.
- #69: frontend cold-start handling and annual expenses.
- #68: disabled diagnostic startup isolation.
- #67 and #66: sidebar icon contrast.

All are ancestors of the feature branch. Work was implemented in `/tmp/gridpilot-meta-advisor` on `feature/savings-meta-advisor-panel`; the original checkout and all its uncommitted changes remain untouched. No merge conflicts were encountered.

## Verification

- Full frontend suite: 350 passed, two existing opt-in HTTP tests skipped.
- Production build and lint pass. Existing bundle-size and CostBreakdown Fast Refresh warnings remain; no new lint warnings.
- Component tests cover header routing to the savings modal, unchanged daily advisor routing, no automatic requests, both source labels, close/reopen, pending completion while closed, explicit follow-up history, Escape and evidence-form handoff.
- Production-build Chromium verifies both injected source variants, explicit submissions, follow-up request history, response/question retention, keyboard focus containment and restoration, and handoff to the unchanged local savings calculator.
- Fictional LED inputs produce 12,500 kWh/year and $2,500/year net savings from the real local deterministic backend. Unknown initial financial values remain unknown.
- Widths 1440, 768, 390 and 320 pass page/modal overflow checks. Ten axe scans have zero violations; no page errors.

AI replies in these checks are **injected test responses**, including those labeled `meta`. They do not establish genuine Meta inference or live-provider availability. All other browser AI routes are blocked. No paid/live inference, merge or deployment was performed. Conversation results remain session-only; question/evidence drafts retain existing browser persistence.

Evidence: `artifacts/savings-advisor-modal/verification.json`, build/test logs and screenshots. Reproduce with the production build configured with `VITE_API_BASE_URL=http://127.0.0.1:8001`, preview on port 5301, and latest-main Uvicorn on port 8001. Install Playwright and @axe-core/playwright outside the repository, then run:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright AXE_MODULE=/path/to/@axe-core/playwright \
  node scripts/verify_savings_advisor_modal.cjs
```
