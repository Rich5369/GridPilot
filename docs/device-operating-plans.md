# E1: verified device-level operating plans

Contract proposal for Richard's review before frontend integration. The approved
direction is one optional `operating_plan` object; this document defines the exact
candidate schema. Work began from main `bbe84174b44e9dfe74cd4df85dab62d987dec26d`
(PR #28); merged PR #29 was incorporated before publication, moving the branch
base to `494289560de4a3d23752944378f37d26531806fd`. That merge changes the UI,
not the backend or existing API consumer validator. The local HTTP examples
retain the actual pre-merge base they were captured against; backend source is
identical across this integration update.
No solver mathematics, constraints, simulator assumptions, routes, frontend, AI,
dependencies or deployment configuration changed. This feature is verified locally;
prior hosted aggregate acceptance is not deployment evidence for E1.

## Shared response contract

All existing OptimizationResult fields and meanings are preserved. The additional
field is `operating_plan: OperatingPlan | null`, default null when omitted from
an older payload. The real adapter supplies the object for both HTTP-200 feasible
and proven-infeasible results. Scenario and mode-selection inputs are unchanged:

```python
optimize_scenario(scenario, *, optimize_flexible=False)
```

`POST /api/optimize` defaults to EV-only; `?scheduling_mode=joint` enables joint.
FastAPI's existing response model serializes the extension without a route change.
See [actual complete solver-generated HTTP responses](verification/device-operating-plan-examples.json):
each `responses[]` record contains its exact request/mode/status and full response.
`responses[1].response` is the full joint-recovery example, not illustrative data.

`operating_plan` has exactly these fields:

| Field | Type / meaning |
| --- | --- |
| `scheduling_mode` | `ev_only` or `joint`, from the submitted mode |
| `solver_status` | `optimal`, `feasible` or `infeasible`, copied from the outcome |
| `primary_status` | `optimal`, `feasible`, `infeasible` or `analytic_infeasibility` |
| `peak_tiebreak_status` | `optimal`, `feasible`, `unresolved` or `not_run` |
| `primary_optimum_usd` | Finite number only with a primary optimum proof; otherwise null. Shared energy-only objective, not a demand-inclusive operating cost |
| `verification_status` | `passed` for the verified optimized result; `unavailable` for infeasibility |
| `warnings` | Actual solver warning strings, including secondary fallback/limited-proof warnings |
| `baseline_constraint_violations` | Existing uncontrolled-baseline reasons; an overloaded baseline is not labeled feasible |
| `device_schedules` | Ordered array of DeviceSchedule objects, including EVs and flexible equipment in both modes |

Each DeviceSchedule has exactly these fields:

| Field | Type / meaning |
| --- | --- |
| `device_id` | Original configured nonempty ID, unchanged; no invented display name |
| `device_type` | `ev` or `flexible` |
| `scheduling_role` | `optimized` for movable items; `held_at_baseline` for flexible equipment in EV-only mode |
| `required_energy_kwh` | Configured nonnegative energy requirement |
| `available_hours` | `{start_hour: integer, end_hour: integer}`; end exclusive. For an EV these are arrival and deadline |
| `max_power_kw` | Configured positive power maximum |
| `baseline_power_kw` | Exactly 24 finite nonnegative hourly-average kW values |
| `baseline_delivered_energy_kwh` | Sum of the actual baseline power values × 1 hour; may be less than required for an impossible request |
| `optimized_power_kw` | Exactly 24 finite nonnegative values from the same verified outcome, or null for infeasibility |
| `optimized_delivered_energy_kwh` | Sum of actual optimized power values × 1 hour, or null alongside unavailable optimized power |

Device identity is the pair **(device_type, device_id)**: IDs need only be unique
within each Scenario collection. Order is EV input order followed by flexible
input order, including zero-energy items. A fixed-only scenario has an empty
device array. No names/labels are supplied by Scenario, so none are invented.
`scheduling_role` describes control policy, not feasibility or proof of optimality.

## One verified optimization outcome

The adapter calls `solve_ev_charging` once, then copies each actual component array
from that returned SolveOutcome. The existing primary and secondary LP stages
are unchanged. It does not run another optimizer, infer components from the
aggregate curve, or choose a different equivalent optimum for device instructions.

`backend/optimizer/operating_plan.py` independently validates the serialized device
arrays using the existing evaluator, checks exact correspondence to that outcome's
components, and reconciles fixed+device demand, total energy, energy charges and
peak with the returned aggregate metrics. Baseline arrays come from the existing
earliest-start policy and reconcile with the same response's baseline fields.
Fixed demand is added once, not returned as a fictitious schedulable device.

All raw fractions are retained. Physical comparisons use **1e-6 kW/kWh**, dollar
comparisons **$2e-7**, with the existing **$1e-7** primary-cost allowance for the
peak tie-break. Each optimized item still meets its exact modeled energy,
power bounds and exclusive window; shared site capacity and fixed preservation
remain independently checked. No array from a separate solve is required to match.

## Feasibility, quality and safe display

- `solver_status=optimal` means the primary optimum was proved; it does not prove
  minimum peak unless `peak_tiebreak_status=optimal` too. The returned cost may
  use the documented secondary allowance.
- `feasible` means a verified incumbent without primary optimality proof. Its
  primary optimum is null and peak stage is not run. Never label it optimal.
- A secondary timeout may retain a verified primary result: primary remains
  optimal, peak stage is `unresolved`, and the actual warning is preserved.
  A feasible secondary result likewise does not claim peak optimality.
- Proven infeasibility retains aggregate reasons/null optimized metrics. Device
  requirements and informational baseline arrays remain, but every optimized
  power/energy field is null and verification is `unavailable`. Baselines can
  overload the cap or contain partial work; read the baseline violations.
- Unresolved, unavailable, solver-error and verification-failure outcomes retain
  typed adapter exceptions and sanitized HTTP 503/500, with **no result/operating
  plan**. Bad transfer or reconciliation raises OptimizationVerificationError;
  no actionable unverified plan or zero-cost fallback is returned.

The optional field permits old aggregate payloads to validate with the new model.
The unchanged current frontend validator accepts all six extended real HTTP
responses, ignoring the addition until a timeline UI is implemented. External
clients that reject unknown response fields must accept this optional extension
before consuming it; additive JSON does not guarantee compatibility with an old
strict schema. Rich5369 should review field names, nulls and quality labels here
before integrating. No frontend types or consumer code were silently changed.

## Worked results and verification

All examples use the existing engineering fixtures with 1 kW fixed demand all day.

| Fixture | Mode | Result | Optimized kWh / energy USD / peak kW |
| --- | --- | --- | --- |
| `joint_recovery` | EV-only | Infeasible | null / null / null |
| `joint_recovery` | Joint | Optimal and verified | 28 / 5.6000000000000005 / 3 |
| `joint_price_shift` | EV-only | Optimal and verified | 26 / 7.9 / 3 |
| `joint_price_shift` | Joint | Optimal and verified | 26 / 7.3000001 / 2.999999666666665 |
| `joint_infeasible` | EV-only or joint | Infeasible with reasons | null / null / null |

In recovery, baseline EV `a` and equipment `pump` both draw 2 kW at hour 0;
baseline peak is 5 kW, violating the 3 kW cap. The joint plan's actual EV power
is 2 kW in [0,1); equipment is 2 kW in [1,2). Fixed 24 + EV 2 + equipment 2 =
28 kWh; $0.20/kWh gives $5.60; total peak is 3 kW. In price shifting, the
actual joint flexible power includes approximately 0.000000333333334934 kW at
hour 0 and 1.999999666666665 kW at hour 1, not rounded zero/two instructions.
Its total remains 2 kWh; the tiny split follows the existing cost allowance.
Use the linked JSON for full precision rather than copying presentation values.

Verification executed: **263 backend tests passed**, including **37 new E1
cases**, no skipped tests, one existing Starlette/httpx TestClient deprecation
warning. Coverage includes actual one-outcome/one-solver-instance provenance,
real OR-Tools results, API serialization, stable cross-type IDs/order, fractional/
zero/negative-price energy, partial baseline, reconciliation, quality/warnings,
verified-primary fallback, fault injection and rejection of corrupted transfers.
Existing simulator/optimizer/joint/adapter/API/AI assertions were retained.
Six real local HTTP calls also passed component reconciliation; the unchanged
actual frontend result validator accepted each response. Fault injections are
tests, not genuine failures observed in those HTTP examples. No production
requests or deployed E1 claims are made. The example artifact labels its base
revision, not a deployment or final implementation SHA.

After incorporating PR #29, its unchanged actual frontend validator again accepted
all six E1 responses, and the existing API-client suite passed **13 tests** with
no skips. Backend/solver source outside this E1 diff was unchanged by that merge;
the full backend results above remain applicable. No frontend code was edited.

```bash
backend/.venv/bin/python -m pytest backend/tests/test_device_schedules.py -q
backend/.venv/bin/python -m pytest backend/tests -q
```

## Richard's timeline/hourly-table handoff

1. Review the shared Pydantic schema/OpenAPI and linked complete responses. Keep
   accepting results without a plan, and preserve old aggregate rendering.
2. Keep the entire response associated with its original submitted Scenario/mode.
   Use that Scenario's fixed vector when reconciling totals. Do not mix a device
   plan with another request, another mode, a refreshed solve or unsaved edits.
3. Require aggregate feasibility plus `verification_status=passed` before showing
   an optimized plan. With null/unavailable optimized fields show reasons and an
   informational baseline only; never turn nulls into zeros. Keep failures separate.
4. Use `(device_type, device_id)` as the stable key; label by supplied identity.
   Render baseline and optimized bars/cells for hours 0–23; h means [h,h+1).
   The exclusive `end_hour` is the EV deadline or equipment availability end.
5. Use backend arrays directly, and backend delivered-energy totals/quality/warnings.
   Format values for display without changing raw numbers. A plotting closing
   point at 24 must not create a 25th energy interval. Flexible equipment held in
   EV-only mode should be labeled held, even though it appears in the plan.
6. Show primary/peak proof separately and retain warnings. Never reconstruct
   device allocations from the aggregate or ask another solve for a timeline.
7. After consumer integration, Richard owns application/browser and deployment
   verification; none is implied by this local engineering extension.

These are planning schedules with hourly-average, grid-side energy and 100% EV
efficiency, not a hardware-control guarantee. Background/HVAC remain fixed;
flexible equipment is interruptible/continuous, without uninterrupted cycles,
startup/minimum-runtime or thermal-comfort constraints. There is no overnight/
calendar/DST model. Shared costs stay daily energy-only; hourly peak is not
necessarily utility billing demand. No named fixed-source allocation is invented.
