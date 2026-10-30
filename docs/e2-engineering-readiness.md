# E2 verification, E1 review and final engineering demonstration

## Revision and scope

Reviewed October 30, 2026 (America/Chicago). Initial fetched main was
`904c618602beacc564e686d75c3e2ea4390b1f3b`, the merge of Richard's PR #36
(device operating timeline). No open PRs existed at task start. The clean
workspace was preserved; work uses `feature/structured-infeasibility-evidence`.
Richard's PR #37 merged during verification. The branch was fast-forwarded to
`254e4af30d72cac73ce378e41df7fa199c059258` without overlapping edits. This is the
latest main checked before publication. Its backend is identical to the initial
base; its frontend analytics changes and new E1 captures were checked separately.
Verified implementation commit:
`78179d94af4059efa0d49694717073d26d78bf71`.
Review PR: <https://github.com/Rich5369/GridPilot/pull/39>, with Rich5369 requested.
The main/base SHA recorded in HTTP captures is not the implementation SHA.

At final publication, PR #38 had also merged to main
`e390fca2edc7bbd76396dd44f4009967439311e5`. Its changes are frontend analytics,
tests and artifacts only; no backend/E1 contract changes. It is **not included**
in this tested branch, whose application base remains PR #37 / `254e4af`.
The PR is mergeable; the frontend counts/build above describe that tested base,
not the later #38 plotting changes. No new application acceptance for #38 is
claimed. This documentation follow-up does not change the verified implementation.
Tests and new local HTTP evidence were taken from this branch's implementation
working tree before its review commit. Nothing was merged or deployed.

Existing engineering is reused: `solver.solve_ev_charging`, its GLOP model,
`constraints.movable_equipment`, baseline/evaluation functions in
`simulator/interface.py`, the shared `optimize_scenario` adapter and E1
`build_operating_plan`. Before E2, current main's backend suite passed 289 tests.

Previously `_infeasibility_diagnostics` emitted device availability, fixed/held
site-cap and wholly-contained shared-window necessary-condition text. GLOP
handled conflicts that those bounds could not isolate. E2 turns those same
checks into numerical records; `_infeasibility_diagnostics` still returns the
original complete text. LP variables, constraints, objectives, verification,
limits and tie-breaking are unchanged. E1 serialization is untouched.

## Additive contract and changed files

The [contract](structured-infeasibility-evidence.md) was documented before model
edits. The EE owner approved the additive shape for Richard's review; Richard's
final response/presentation review remains pending. Existing response keys,
legacy text, schedules, metrics and errors are retained. New optional top-level
`infeasibility_evidence` is empty for feasible results and populated for proven
infeasibility. Omitted/null is accepted for old responses. It never describes
provider errors, unresolved solves or failed verification as infeasibility.

| File | Purpose |
| --- | --- |
| `backend/optimizer/infeasibility.py` | Typed internal numerical facts, original messages, deterministic selection |
| `backend/optimizer/solver.py` | Attach facts to the same existing proof outcome; no additional solve |
| `backend/models/contracts.py` | Optional typed E2 extension and consistency checks |
| `backend/optimizer/interface.py` | Transfer same-outcome facts into shared response |
| `backend/tests/test_infeasibility_evidence.py` | Independent numerical, solver, schema and HTTP regressions |
| `scripts/verify_infeasibility_regression.py` | Reproduce seeded comparison against the pre-E2 solver from local Git |
| `scripts/verify_infeasibility_http.py` | Capture actual local requests/responses; compare direct aggregate metrics |
| `scripts/verify_e1_engineering_evidence.py` | Verify supplied E1 arrays without invoking optimization |
| `docs/structured-infeasibility-evidence.md`, `docs/contracts.md` | Exact field semantics, equations, examples and compatibility |
| This report and `docs/verification/e2-*.json` | Verification, E1 acceptance and demo evidence |

## Numerical verification

- Full backend: **344 passed**, no skips; one existing Starlette/httpx
  TestClient deprecation warning. Includes **55 new E2 tests**.
- Existing optimizer/joint, adapter/API, E1, What-if, AI and market tests included.
- Frontend after incorporating PR #37: **117 passed, 2 opt-in live tests skipped**; production build passed.
  No frontend source or dependency changes in E2. The unchanged real frontend
  `isOptimizationResult` and `matchesSubmittedPlan` TypeScript validators also
  accepted all ten actual E2 HTTP responses with their submitted scenarios/modes
  (transpiled/evaluated in memory, without editing frontend files).
- Actual local uvicorn HTTP: **10 cases passed**, with complete payloads and
  responses in [e2-local-http.json](verification/e2-local-http.json).
- Existing four-probe joint HTTP verifier: **4 passed**, no retries/timeouts;
  [separate capture](verification/e2-joint-http.json).
- Differential check against the pre-E2 solver loaded from `git show` at the
  main SHA above: **214 solves**, comprising seven existing examples and 100
  seeded generated scenarios, each in both modes. Seed: 20261030. 86 optimal,
  128 infeasible; status/proof quality, all legacy messages and warnings
  identical; maximum cost and peak differences **zero**. Generated scenarios
  cover zero/fractional energy, negative/zero tariffs, different windows/power
  bounds, capacities and both scheduling modes. No unique schedule equality
  across solves is required. [Summary](verification/e2-pre-change-comparison.json).

The new tests independently integrate headroom from the submitted fixed vector
and earliest-start held equipment, identify wholly-contained movable windows,
and recompute each quantity in every numerical category. Specific checks include
5 kWh requested vs 4 kWh device-window capacity; 8 kW immutable + 2 kW held vs
6 kW site cap (EV-only), vs 8 kW immutable / 6 kW cap (joint); shared 8 kWh
within [0,3) vs 6 kWh headroom with differently overlapping windows; and actual
GLOP-only infeasibility caused by a 1 kW device bound over headroom [2,0] kW.
That last case has enough aggregate-window energy headroom but only 1 kWh is
usable by the device. E2 deliberately reports only the generic solver proof.

Analytical comparisons retain existing 1e-8 kWh device-window tolerance and
1e-6 kW/kWh fixed/shared tolerances. Tests exercise either side, not a rounding
threshold. Independent schedule/energy verification uses 1e-6 kW/kWh and costs
use $2e-7. GLOP's primal/dual tolerances remain 1e-9; the secondary objective
allows $1e-7 above the primary optimum. A feasible unproved incumbent is not
called optimal. New serialization rejects contradictory evidence/status/mode,
wrong units, nonviolations and fabricated solver-only quantities. Failure
injection includes unavailable/throwing solvers, timeout, abnormal and invalid
solver statuses; existing tests also cover corrupt schedules/verification and
secondary failures. These injections use TestClient/engine calls, not a modified
live server. Ordinary local HTTP responses use the real optimizer.

No irreducible-infeasible-set extraction, capacity repair, extra explanation
solve, exhaustive root-cause diagnosis, timing guarantee or hosted E2 test is
claimed. An individual numerical certificate can establish infeasibility without
being its only cause. Overlapping evidence must not be summed.

## E1 frontend engineering acceptance

**PASS for the supplied PR #36/#37 captures, with revision provenance qualified.**
The frontend implementation is commit
`4af330c` incorporated by main `904c618`. Its supplied
[acceptance.json](../artifacts/e1/acceptance.json) contains five complete actual
browser requests/responses and associated screenshots. `baseRevision: c3d52a4`
is its historical base, not an exact producing frontend/backend commit pair.
Those producing SHAs were not embedded in the capture. The engineering backend
implementation did not change in Richard's frontend PR. This review checks its
submitted arrays, not an invented re-solve or a claim of current hosted success.

Independent review output:
[e2-e1-capture-review.json](verification/e2-e1-capture-review.json).
The captured browser checks include exact DOM table/accessible power equality,
export equality and 1440/768/390 viewports. This turn independently recomputed
all five PR #36 responses, inspected desktop feasible/recovery/infeasible and
stale screenshots plus mobile EV-only infeasibility, reviewed the timeline source
and reran its existing frontend tests. Chromium was not re-executed this turn. After PR #37 merged, its separate five
E1 regression responses also passed the same independent checks without solving:
[e2-e1-latest-capture-review.json](verification/e2-e1-latest-capture-review.json).
The newer mobile recovery screenshot was inspected as well. It preserves the
same schedule/window/proof semantics. Its inherited `baseRevision` metadata also
does not identify an exact producing SHA pair.

| Captured case | Baseline kWh / USD / peak kW | Optimized kWh / USD / peak kW |
| --- | --- | --- |
| EV-only feasible | 128.8 / 20.576 / 23.9 | 128.8 / 20.5760001 / 14.059999875 |
| Joint feasible | 128.8 / 20.576 / 23.9 | 128.8 / 20.5760001 / 14.059999875 |
| EV-only recovery infeasible | 98 / 17.84 / 10.5 | unavailable |
| Joint recovery | 98 / 17.84 / 10.5 | 98 / 17.84 / 8.5 |
| Joint infeasible | 98 / 17.84 / 10.5 | unavailable |

- [x] IDs/types/order and requirements match original submitted devices.
- [x] Exactly 24 raw hourly values, correct kW/kWh integration, exclusive windows,
  exact required energy, power bounds and shared site cap in feasible plans.
- [x] Submitted fixed demand preserved once; baseline and optimized arrays
  reconcile with their own same-response aggregate metrics. Largest residual
  1.78e-15 kW. No optimizer invoked by this review.
- [x] EV-only flexible arrays held exactly at baseline; joint recovery shifts
  equipment from hour 9 to hour 10 while EV receives 2 kWh in hour 9.
- [x] Infeasible optimized arrays/metrics remain null; displayed baseline clearly
  informational/noncompliant, and optimized instructions unavailable.
- [x] Separate primary and peak proof labels, baseline violations and stale
  submitted-scenario warning match source/screenshots. Unproved/fallback quality
  states are covered by existing synthetic frontend tests, not real captures.
- [x] Existing exact-value table/export checks preserve fractions and same-response
  association; bars are normalized to each device maximum, not absolute between
  devices. Source values, not graphical pixel heights, are numerical evidence.
- [ ] Exact producing frontend/backend SHA pair for the historical browser run.
- [ ] Fresh hosted acceptance at Richard's intended deployed revision, including
  E2 presentation once integrated. These are separate milestones.

No concrete E1 engineering or display defect was found. The remaining metadata
needed for exact revision attribution is Richard's frontend/backend build SHA
pair (or a fresh exported browser capture with those SHAs). This does not block
E2 implementation or the bounded captured-response acceptance.

## Final synthetic engineering demonstration

Use the existing commercial named-source scenario from
`docs/verification/joint-application-captures.json` (`sources-dashboard`). The new
local HTTP runner reuses that exact Scenario, changing only the site limit.
Joint mode, 24 one-hour intervals; lighting 2 + refrigeration 1 = fixed 3 kW
throughout; two EVs each 14.4 kWh, max 7.2 kW, [15,22); interruptible equipment
6 kWh, max 3 kW, [10,16). Prices $0.28/kWh in [14,20), $0.12 otherwise.
No EV/equipment energy is inside the fixed vector. Operating hours [8,18) are
metadata and do not truncate separately specified EV availability.

| Limit | Status | Baseline kWh / energy USD / peak kW | Optimized kWh / energy USD / peak kW |
| --- | --- | --- | --- |
| 25 kW | optimal | 106.8 / 20.304 / 17.4 | 106.8 / 15.696000100 / 17.399999688 |
| 15 kW | optimal | 106.8 / 20.304 / 17.4 | 106.8 / 16.464000100 / 14.999999687 |
| 3 kW | infeasible | 106.8 / 20.304 / 17.4 (overloaded) | null / null / null |

Fixed energy is 3×24 = 72 kWh, EVs require 28.8 kWh, equipment 6 kWh:
106.8 kWh in both feasible scenarios. Fixed cost is $11.52 and equipment's cheap
energy is $0.72. At 25 kW, all EV energy fits the two cheap [20,22) hours,
costing $3.456. At 15 kW, headroom is 12 kW: only 24 kWh fit those cheap hours;
4.8 kWh must move to $0.28 hours, adding 4.8×$0.16 = **$0.768**. Peak drops
about 2.4 kW. Alternative-minus-current: **+$0.77, −2.40 kW, 0.00 kWh** when
formatted. Separate modeled baseline energy-cost benefits are about $4.608 and
$3.840; they are not the between-scenario cost difference.

At 3 kW, fixed demand equals capacity everywhere: zero headroom. Equipment
requires 6 kWh in [10,16), EVs 28.8 in [15,22), combined 34.8 in [10,22).
Each reported shared-window certificate has available 0 kWh. Do not incorrectly
call this fixed demand *above* the cap; it leaves no capacity for extra work.
All optimized values remain unavailable; do not display fabricated savings.

Suggested 90-second narrative:

1. “This is a synthetic daily planning model. Lighting/refrigeration are fixed;
   EVs and this interruptible equipment can be scheduled within their windows.”
2. “The same verified solve supplies these hourly device values and aggregate
   cost/peak. Each EV still gets 14.4 kWh; total work remains 106.8 kWh.”
3. “At 25 kW we move EV charging to cheap hours. Tightening to 15 kW reduces
   peak by 2.4 kW but raises energy charges about 77 cents because 4.8 kWh must
   use expensive hours. Optimization does not guarantee positive savings.”
4. “At 3 kW the fixed building load uses all capacity. Here are the actual
   required and available kWh; no feasible device instructions are issued.”
5. “These are modeled daily energy charges, not a full utility bill, measured
   utility savings, or hardware control. HVAC is predefined; one-hour averages,
   100% EV efficiency and interruptible continuous equipment are assumptions.”

## Commands

From the repository root (existing virtualenv/dependencies):

```bash
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m pytest backend/tests/test_infeasibility_evidence.py backend/tests/test_joint_optimizer.py backend/tests/test_optimizer_adapter.py backend/tests/test_device_schedules.py backend/tests/test_api.py -q
npm --prefix frontend test
npm --prefix frontend run build
backend/.venv/bin/python scripts/verify_e1_engineering_evidence.py
backend/.venv/bin/python scripts/verify_infeasibility_regression.py --output /tmp/e2-comparison.json
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_price_shift
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_infeasible
```

For real local HTTP verification, start the existing service in one terminal:

```bash
MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8011
```

In another terminal (use separate output files to retain historical evidence):

```bash
backend/.venv/bin/python scripts/verify_infeasibility_http.py --base-url http://127.0.0.1:8011 --output /tmp/e2-http.json
backend/.venv/bin/python scripts/verify_joint_http.py --base-url http://127.0.0.1:8011 --focused --output /tmp/e2-joint-http.json
```

The real request examples are the `cases[].scenario` bodies in
`verification/e2-local-http.json`; mode is the adjacent `scheduling_mode`, sent
as the query parameter, not a Scenario member or BuildingConfig wrapper.
Existing installation remains `python -m pip install -r backend/requirements.txt`
inside a Python virtualenv and `npm --prefix frontend ci`. No new dependencies.

## Handoff to Richard

E2 adds optional `infeasibility_evidence` alongside unchanged aggregate/E1 fields.
Use typed codes, device references, exclusive windows, quantities and units for
cards; retain legacy text as fallback. Numerical facts come from existing checks
and the same solver outcome, not an AI estimate or second optimization. Empty
means no infeasibility evidence for a feasible response; absent/null supports
older responses. Solver-only proofs deliberately have no numerical cause.
Overlapping certificates are not additive, exhaustive or guaranteed repairs.
Please review the documented field shape before merge, then integrate cards or
advisor consumption in your owned frontend/Meta code. The supplied E1 captures
pass independent engineering checks. Before submission, supply exact deployed
frontend/backend SHAs and perform bounded hosted acceptance. Local E2 success
and earlier screenshots do not establish hosted E2 behavior.
