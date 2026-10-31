# Frontend ownership and completion

shaJ46 owns landing/onboarding, dashboard/design, frontend integration and browser
verification. Richard (Rich5369) owns all backend APIs, numerical systems, pricing,
validation and Meta provider reliability. This supersedes the historical EE/CS split.
The approved navy/teal design, illustration and existing React application remain.

## Revision and scope

Inspected/fetched main `cc453430022f27e47a51c8160b02bf65266ccb17` (merged PR #44).
The working tree was clean on `feature/save-resume-workspace`, at `571d1ff`.
The only open PR was #45, containing completed Save/Resume. This work builds on
that dedicated branch and updates the same PR, avoiding duplicate persistence.
No newer account/persistence implementation was found. Nothing is merged or deployed.

Already implemented: four-step setup/review, explicit demonstration mode, business
context separate from numerical inputs, real optimization metrics/charts, E1 device
plans/full-precision exports, What-if comparison/Apply/Restore, advisor proposal
review, retail benchmarks and validated browser-local Save/Resume. The latter's
contract and recovery behavior are in [Save and Resume](save-resume.md).

Confirmed gaps addressed:

- App/section navigation now uses static-host-compatible URL hashes. Existing
  `#overview`, `#configuration`, `#comparison`, `#whatif`, `#assistant`, `#markets`
  links work, as do `#/building/<section>` aliases. Back/Forward preserves a
  mounted dashboard's session and What-if pair. Home has Continue; Edit building
  reopens setup. Incomplete buildings must finish setup before opening dashboard
  links. Invalid/unknown anchors stay on the homepage without replacing inputs.
  Refresh restores inputs/section, **never solver results or result IDs**.
- The keyboard skip link focuses main without changing the route. New evidence
  cards wrap at narrow widths and retain original numerical precision.
- Existing optional E2 evidence is typed, validated and associated with the
  submitted mode/devices/window/site cap before a result is accepted. Four proof
  categories show the supplied message, typed device identity, exclusive interval,
  units, required/available quantities and calculation context. Generic solver
  proof invents no quantities. Legacy text is retained. Baseline violations remain
  separate from optimization infeasibility; overlapping certificates aren't summed
  and no guaranteed repair is promised. No additional solve generates explanations.
- Advisor extraction preserves user corrections made during a pending reply;
  leaving the dashboard prevents late replies writing into another workspace.
  Explicit Apply/Compare, mode/scenario/result identity and provider errors remain.
- Retail responses are checked before formatting numbers/dates/links: finite
  nonnegative prices or null, unique recognized states, source/period/units/status.
  Malformed releases show unavailable or retain the last validated dated release
  with a saved/unavailable label. Read-only retry is explicit. Source and preliminary
  status come from the response. Benchmarks never change the scenario tariff.

No backend, solver, adapter, pricing retrieval, Meta settings, shared Python schema,
application dependencies or deployment configuration changed. Optimization retains
its 45-second client budget, sequential What-if requests and no automatic retries.

## Verification

Final checks and complete browser request/response evidence are recorded in
[the browser report](../artifacts/frontend-completion/verification.json) and
[the persistence report](../artifacts/frontend-completion/persistence/verification.json).
These are **local production-build checks**, not hosted or live Meta acceptance.
All company inputs are synthetic test data. Advisor replies/service failures are
controlled browser fixtures and are explicitly listed in the report. Successful
optimization responses come from the unchanged real local backend.

Commands:

```sh
npm --prefix frontend test
(cd frontend && ./node_modules/.bin/tsc -b)
npm --prefix frontend run lint
npm --prefix frontend run build
```

For browser reproduction, build with `VITE_API_BASE_URL=http://127.0.0.1:8016`,
run the existing backend on 8016 with `MODEL_API_DIAGNOSTIC_ON_STARTUP=0` and
`CORS_ORIGINS=http://127.0.0.1:5296`, and Vite preview on 5296. In a QA environment
with Playwright/Chromium and `@axe-core/playwright` installed:

```sh
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5296 node scripts/verify_frontend_completion.cjs
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5296 \
  GRIDPILOT_OUTPUT=artifacts/frontend-completion/persistence \
  node scripts/verify_workspace_persistence.cjs
```

`PLAYWRIGHT_MODULE` / `AXE_MODULE` can select an external QA installation; no app
dependency is necessary. The verifier fails on uncaught page errors, horizontal
overflow, numerical reconciliation errors or targeted accessibility violations.
Unit regressions also render all ten historical E2 captures and reject malformed
or mismatched evidence. Existing What-if assertions remain intact.

Tested frontend source: `60b7a19d40c9098ca98713001933442ff121f7e3`.
Backend source equals main `cc453430022f27e47a51c8160b02bf65266ccb17` exactly
(tree `e6a2ecc004277dde222bb50d54fb7f9b6079c833`). QA/report commits do not
change served frontend or backend source. No hosted revision is claimed.

- **206 tests passed**, 2 existing opt-in live tests skipped. TypeScript and
  production build passed. Lint passed with only the two existing CostBreakdown
  Fast Refresh warnings.
- Both Chromium verifiers passed: seven real joint optimizer responses in the new
  flow plus one real persistence-flow response, and ten persistence check groups.
  The latter closes/reopens a real on-disk Chromium profile, rather than merely
  importing a storage snapshot. There were no uncaught page errors.
- Real response costs reconcile to tariff-weighted hourly demand within `2e-7 USD`;
  peaks, per-device energy/windows/power/site limits and fixed-demand reconciliation
  pass at `1e-6 kW/kWh`. The complete exported JSON matches the exact response and
  result ID. No independent solve is required to reconstruct schedules.
- What-if uses joint mode for both exact submitted scenarios. Alternative-minus-
  current is approximately **+$0.288 → $0.29**, **−0.9 kW → −0.90 kW**, and
  **0 kWh → 0.00 kWh**. Each scenario's baseline-to-optimized benefit is separate.
  History preserves the pair; Apply/Restore and changed-mode invalidation pass.
- All four E2 categories use real responses. Infeasible optimized metrics/schedules
  remain null. Empty invalid inputs block submission; controlled HTTP 503 does not
  become mathematical infeasibility. Legacy response regressions pass.
- Advisor same-result/scenario/mode handoff is checked against the real execution;
  controlled replies test pending corrections, explicit Apply/Compare and provider
  errors. Unit regression covers a reply arriving after dashboard unmount.
  No live Meta/provider acceptance is claimed and no paid Meta call was made.
- Real EIA read and keyboard state selection pass. A controlled malformed release
  produces an unavailable state, followed by explicit successful read-only retry.
  Unit coverage also confirms retaining a previous valid release after refresh failure.
- Desktop 1440 px, tablet 768 px and mobile 390 px screenshots were captured and
  visually inspected. No page-wide horizontal overflow. Targeted axe WCAG A/AA
  checks for navigation, E2 and retail interaction report **zero violations**.
  Reduced-motion mode and keyboard skip/state-selection controls were exercised.
  This is targeted automated coverage, not a universal accessibility certification.

| Real joint scenario | Status | Baseline kWh | Optimized kWh | Baseline USD | Optimized USD | Baseline peak kW | Optimized peak kW |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current (also What-if current) | feasible | 128.8000 | 128.8000 | 25.184000 | 20.576000100 | 20.900000 | 15.899999687 |
| What-if alternative: 15 kW cap | feasible | 128.8000 | 128.8000 | 25.184000 | 20.864000100 | 20.900000 | 14.999999688 |
| Device window shortfall | infeasible | 200.8000 | — | 40.736000 | — | 20.900000 | — |
| Fixed demand above cap | infeasible | 128.8000 | — | 25.184000 | — | 20.900000 | — |
| Shared-window shortfall | infeasible | 73.0000 | — | 11.640000 | — | 4.000000 | — |
| Solver-only proof | infeasible | 4.0000 | — | 0.480000 | — | 3.000000 | — |

Screenshots: [desktop E2](../artifacts/frontend-completion/evidence-device-desktop.png),
[tablet E2](../artifacts/frontend-completion/evidence-tablet.png),
[mobile E2](../artifacts/frontend-completion/evidence-mobile.png),
[What-if](../artifacts/frontend-completion/whatif-desktop.png),
[advisor UI fixture](../artifacts/frontend-completion/advisor-fixture-desktop.png),
[desktop retail](../artifacts/frontend-completion/retail-desktop.png),
[mobile retail](../artifacts/frontend-completion/retail-mobile.png),
[completed resume](../artifacts/frontend-completion/persistence/completed-resume-desktop.png),
[mobile resume](../artifacts/frontend-completion/persistence/completed-resume-mobile.png).


## Remaining interfaces for Richard

There are no authentication, account, saved-building CRUD or permanent-execution
APIs in the inspected repository. The current interfaces are health, optimize,
retail-prices and AI interpret/explain/conversation. Browser-local storage is the
honest fallback, scoped to one origin/browser profile; it isn't cross-device storage.

To enable **sign in → reopen the same building on another device**, Richard must
provide an agreed authenticated session interface and owner-authorized building
read/write/delete interface, including version/conflict behavior and the persisted
profile/scenario/mode/completion fields. This is a requested backend design decision,
not an invented endpoint contract. Frontend account integration follows that agreement.
Retained execution history would additionally require a documented durable result
retrieval/lifetime contract; current inputs restore independently of transient IDs.

Live Meta provider behavior, hosted served revisions/CORS and deployment verification
remain Richard's backend/release milestones. Local fixtures establish UI behavior
only. No confirmed independent frontend gap is intentionally deferred in this scope;
real accounts/cross-device recovery cannot be claimed until those APIs exist.
