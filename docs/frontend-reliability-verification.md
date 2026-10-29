# Frontend reliability verification

Verified October 29, 2026 against main revision `7c02479` using a local Vite
frontend, local FastAPI/OR-Tools backend on port 8000, and an explicit
`MODEL_API_MODE=mock` backend on port 8001. Backend startup lifespan was disabled
to avoid diagnostics. No live Meta inference, production changes, or deployment.

## Changes

- Browser predicates parse URLs and check `/api/optimize` pathname, scheduling
  mode query parameter, and POST method for requests/responses. EV-only and joint
  requests are distinguished. Playwright route and unroute use the same predicate.
  Interception counts prevent false passes in delayed/error cases.
- Reproduced Restore returning 25 kW instead of the 20 kW current configuration
  after accepting a 15 kW AI alternative into an already mounted What-if session.
  Dashboard now starts a new keyed What-if session on an AI comparison handoff.
  The new session captures the current Restore snapshot and discards prior local
  comparison state, including late results from the previous component instance.
  Navigation and ordinary manual edits retain their existing session behavior.
  Scheduling mode remains owned by Dashboard.
- Moved only the six intended What-if CSS rules from unused App.css to the
  imported index.css. No template styles were globally activated.

## Verification

- `cd frontend && npm test`: 56 passed, 1 skipped (opt-in HTTP integration test).
  Includes the confirmed Restore regression both with and without an old
  comparison request completing after the handoff; scheduling mode remains EV-only.
  Existing manual, timeout, stale-result, joint-mode and negative-zero tests pass.
- `GRIDPILOT_LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 npm run test:integration`: 1 passed against the real local API (the default-suite skip was exercised separately).
- `node --test scripts/browser-api.test.cjs`: passed. Covers reordered query
  parameters, both modes, wrong paths, missing modes and non-POST requests.
- `cd frontend && npm run build`: passed, including TypeScript project checks.
- `cd frontend && npm run lint`: passed with two pre-existing Fast Refresh
  export warnings in CostBreakdown.tsx.
- `scripts/verify_whatif_browser.cjs`: passed with real feasible/infeasible
  optimization, exact submitted values/costs, manual apply/restore, stale hiding,
  validation, two intercepted sequential delayed 503 responses, and the real
  `503 joint_adapter_unavailable` response. Joint requests are excluded from the
  EV-only counter. At 1440/1024 px results are side by side; at 768/390 px they
  stack. Both chart SVGs have positive dimensions, controls are enabled and there
  is no horizontal page overflow. Desktop/mobile screenshots visually inspected.
- `scripts/verify_ai_browser.cjs`: passed with injected AI-unavailable response,
  explicit mock backend proposals/explanations and real optimizer results. Tests
  cancel, apply, a previously mounted What-if handoff and 20 → 15 → Restore 20 kW,
  EV-only mode preservation and mobile overflow. No live Meta calls.
- `scripts/browser-qa.cjs`: passed; exercises real feasible/infeasible responses, six-second
  delayed real response, duplicate guard, injected 422/503/500/network failures,
  native 45-second timeout and recovery, and desktop/390/768/1024 layouts.

Run browser scripts with Playwright available through NODE_PATH and local servers
running on ports 5173/8000/8001. The AI script explicitly mocks unavailable AI;
its provider success cases must use the mock-mode backend. Screenshots and QA
output are written under /tmp, outside the repository.

## Scope and limitations

Backend/engineering code, AI provider configuration, diagnostics, credentials and
infrastructure were untouched. Existing diagnostic and frontend/.gitignore work
was preserved in the original workspace; implementation used an isolated worktree.
Joint success is intentionally unverified while the adapter is unavailable. The
joint-unavailable browser expectation will need updating once that adapter lands.
The frontend fixes can merge independently of that adapter work.
