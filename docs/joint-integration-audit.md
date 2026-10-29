# Joint optimizer integration audit — October 29, 2026

Local application acceptance **PASS** on fetched main `6d21fae295eb52ddcfafa40d610e693473c90b05`.
No merge or deployment was performed. Production was not tested in this audit.
Work used a clean isolated checkout at `/tmp/gridpilot-joint-audit`; the original
workspace's unrelated uncommitted Meta diagnostic and ignore-file work was preserved.

## A. Teammate adapter

shaJ46's adapter is `feature/joint-optimizer-adapter`, commit
`c1d2758bf87088201a6922d27b0f27b2d3d22b1b`, merged in
[PR #23](https://github.com/Rich5369/GridPilot/pull/23).
His latest contribution is [PR #25](https://github.com/Rich5369/GridPilot/pull/25),
acceptance commit `b0cf137`, also merged. A fresh remote fetch and GitHub PR query
confirmed no open PRs and that PRs #19, #20 and #21 are merged and ancestors of
the tested revision, alongside the commercial dashboard (#22) and chart fix (#24).

Actual callable:
`optimize_scenario(scenario: Scenario, *, optimize_flexible: bool = False) -> OptimizationResult`.
The adapter forwards the flag to the existing `solve_ev_charging`; omitted/False
retains EV-only behavior and True enables the existing OR-Tools solver's joint
mode. The adapter diff changes no simulator or solver implementation. Independent
engineering checks, typed failures and daily energy-only USD semantics remain intact.
Detailed per-item schedules were verified through the existing engineering engine;
no per-equipment allocation is invented from the aggregate API response.

## B. FastAPI and HTTP

The existing endpoint requires no runtime changes. Omitted mode and `ev_only`
retain legacy dispatch; `joint` invokes the extended adapter; invalid modes
return 422. Infeasibility returns HTTP 200 with reasons and null optimized fields.
Backend fault-injection tests cover unresolved 503, unavailable 503, solver and
verification 500, and sanitized unexpected errors. These injected failures are
regression tests, not genuine solver failures observed in browser acceptance.

Both `verify_joint_http.py --base-url http://127.0.0.1:8007` and
`verify_optimizer_http.py --base-url http://127.0.0.1:8007` pass. Six additional
real HTTP/direct adapter comparisons (three joint fixtures, two modes) pass.
The API response schema is unchanged. Frontend timeout and late-response behavior
passes existing regressions; browser acceptance does not inject delayed responses.
The client deadline does not claim to cancel an already-running server solve.

An initial run against default port 8000 failed with `joint_adapter_unavailable`.
That port belongs to a pre-existing `uvicorn` process (PID 3382), preventing the
clean audit server from binding there. It was left untouched. The isolated server
on 8007 uses the fetched revision and resolves the adapter issue. This discrepancy
is local server provenance, not a failure of the merged adapter.

## C. React, What-if and business profiles

The existing application needed no product changes. Fresh Chromium acceptance
captured **12 genuine joint responses** (10 feasible, two infeasible), four
What-if pairs, exact submitted bodies/modes and UI editor snapshots. All captured
scenarios were independently re-solved and verified. Desktop 1440 px and mobile
390 px charts render; 24-row demand tables and displayed metrics match responses.
No page errors or settled horizontal overflow occurred.

Demo, custom 24-hour and named-source fixed-demand inputs pass without double
counting. EVs and flexible equipment remain separate from immutable fixed demand.
Mode switches preserve inputs and invalidate old results/comparisons. Current and
alternative snapshots use joint mode independently. Apply/Restore preserves
profiles. Alternative-minus-current displays +$0.77, -2.40 kW and 0.00 kWh for
the tighter-cap pair, corresponding to +$0.768 before display rounding. Infeasible
pairs suppress optimized metrics and differences. Input edits hide stale results;
in-flight late-response protection is covered separately by frontend unit tests.
The joint-mode AI guard is unchanged; no Meta inference or diagnostics were used.

Fresh captures and independent results are in
[request captures](verification/joint-application-captures.json) and
[numerical checks](verification/joint-application-numerical-checks.json).
Screenshots reproduce the existing accepted images without image changes.

## D. Numerical results

| Fixture | Mode | Status | Optimized kWh | Daily energy USD | Peak kW |
| --- | --- | --- | ---: | ---: | ---: |
| joint_recovery | EV-only | infeasible | null | null | null |
| joint_recovery | joint | feasible | 28 | 5.600000000 | 3 |
| joint_price_shift | EV-only | feasible | 26 | 7.900000000 | 3 |
| joint_price_shift | joint | feasible | 26 | 7.300000100 | 2.999999667 |
| joint_infeasible | EV-only | infeasible | null | null | null |
| joint_infeasible | joint | infeasible | null | null | null |

Joint infeasibility correctly reports 5 kWh required against 4 kWh shared
capacity in [0,2). Numerical tolerances: 1e-6 kW/kWh and $2e-7, preserving the
existing $1e-7 primary-cost allowance. Equivalent schedules are not required
to match hourly arrays. All 12 application captures had zero HTTP/direct scalar
metric discrepancies at recorded precision.

## E. Checks

- Full backend pytest: **226 passed**, one existing Starlette/httpx deprecation warning.
- Frontend suite: **74 passed**, one opt-in live test skipped; live test run separately.
- Opt-in frontend live HTTP integration test: **1 passed** against port 8007.
- Updated custom-profile Chromium regression: pass, including real joint results.
- TypeScript and production Vite build: pass.
- Lint: pass with two existing Fast Refresh export warnings in CostBreakdown.tsx.
- Real joint HTTP fixtures and three legacy HTTP demonstrations: pass.
- Full joint application Chromium capture and independent verifier: pass, 12 requests/four pairs.
- Updated joint-mode Chromium regression: pass, genuine EV-only/joint metric comparisons.
- Browser API predicate test: pass.

The first sandboxed pytest run stalled and was interrupted; the full suite passed
with local sockets enabled. The first custom-profile driver run timed out because
successful joint optimization navigates to results, while the old failure-path
script expected to remain in configuration. Its navigation was corrected.
These tooling attempts are recorded separately from solver results.

## F. Implementation and review

Only verification maintenance is needed:

- `scripts/verify_joint_browser.cjs`: replace obsolete missing-adapter expectations
  with actual joint success and direct optimizer metric checks; allow a frontend URL.
- `scripts/verify_demand_profile_browser.cjs`: verify real joint custom-profile
  results, record them, and return to configuration after successful optimization.
- `scripts/verify_joint_http.py`: add explicit backend targeting and reject Python
  optimization mode, which would disable the script's assertions.
- This report and refreshed capture/check JSON: record this audit's revision and run.

No optimizer mathematics, fixtures, simulator, API, React product code, Meta code,
credentials or deployment configuration changed.
Branch: `test/joint-browser-adapter-regressions`.

## G. Remaining work

Review the focused verification maintenance PR. No engineering implementation
remains for shaJ46 for these tested scenarios; his adapter and acceptance are
already merged. Deployment and hosted verification remain separate work: identify
actual deployed frontend/backend revisions, deploy only with authorization, then
rerun hosted joint dashboard/What-if workflows and compare exact submitted bodies
against the accepted engineering results. Local acceptance does not establish
production success.
