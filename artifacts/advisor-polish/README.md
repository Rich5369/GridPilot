# Energy Advisor polish

Branch: `feature/energy-advisor-ui-polish`, based on current `origin/main` (`1390af2`, merged PR #33). Implementation and PR #33 backend response contract inspected before editing. Work isolated from the original checkout to preserve unrelated Meta diagnostics, CSS, and teammate work.

## Changes

- Restrained message cards distinguish user, guidance, clarification, unsupported requests, and proposal replies with text labels as well as color.
- Grounded facts appear in a separate evidence section. Only the backend's explicit `Verified submitted …` cost-result fact receives the verified solver treatment. Missing-result text never receives that badge. Provider receipt is described separately from solver verification.
- A dedicated proposal review card appears before the composer, with readable field names, units, pending-outcome disclosure, and a primary Apply action. Compare, cancel, round-trip validation, stale protection, and optimizer semantics are retained.
- Business context starts with a compact summary, provided-field count, and extracted/user-edited provenance. Native keyboard-accessible disclosure opens a two-column editor (one column on mobile). Missing values say Not provided; zero remains a valid provided value.
- Clear composer instructions, business-relevant starter questions, visible focus rings, live conversation/status announcements, and responsive layouts.
- Presentation metadata stays client-side; outgoing history still contains only role/content.

## Files

- `frontend/src/components/ai/EnergyAssistant.tsx`: advisor presentation and local display metadata.
- `frontend/src/components/ai/EnergyAssistant.test.tsx`: clarification, evidence, context, payload, units, and stale action coverage.
- `frontend/src/index.css`: scoped advisor styling.
- `frontend/src/pages/Dashboard.test.tsx`: updated initial reply-state wording assertion.
- `scripts/verify_advisor_polish.cjs`: reproducible browser presentation/workflow checks.
- `artifacts/advisor-polish/`: baseline and finished screenshots, this report.

## Verification

- `npm test` (frontend): 99 passed, 2 skipped; 12 files passed, 1 skipped (existing opt-in integration tests).
- `npx tsc -b`: passed.
- `npm run lint`: passed; two existing Fast Refresh export warnings in CostBreakdown.tsx.
- `npm run build`: passed.
- `git diff --check`: passed.
- Chromium: multi-turn wire format, keyboard disclosure/composer, extracted vs edited context, no false verified badge, explicit Apply, Compare handoff, 1440/768/390 px layouts without horizontal overflow, no page errors.

Run browser checks with a frontend server at port 5186 and Playwright available:

```
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify_advisor_polish.cjs
```

`ADVISOR_URL` overrides the server URL.

## Screenshots and limits

`before/desktop.png` and `before/mobile.png` show merged PR #33's initial UI. `after/desktop-empty.png` shows the revised initial UI. `after/desktop-conversation.png`, `after/768-conversation.png`, and `after/390-conversation.png` show the multi-turn proposal workflow.

Browser conversation screenshots use visibly labeled MOCK response fixtures, not real Meta inference or solver outcomes. No computed outcomes are fabricated in those screenshots. Verified-result rendering is covered with a unit fixture; this pass does not revalidate live provider inference or solver mathematics. Screen-reader announcements were checked structurally, not with a manual screen-reader session. Business context remains session-only, and provenance describes local edits rather than a persisted audit trail. Verified cost styling conservatively depends on the backend's existing explicit fact prefix; other evidence stays neutrally labeled.

No backend, provider configuration, solver, or optimization behavior was changed. Nothing merged or deployed.
