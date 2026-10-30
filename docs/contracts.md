# Energy API contracts (v0.1)

The source of truth is `backend/models/contracts.py`; corresponding frontend types
are in `frontend/src/types/api.ts`. FastAPI exposes the JSON schemas at
`/openapi.json`. Review contract changes together before changing field names or
units. `sample_data/scenario.demo.json` is fictional input, not measured data.

## Scenario

- `operating_hours`: integer `start_hour` (0–23), `end_hour` (1–24), start < end.
- `fixed_demand_kw`: exactly 24 finite, nonnegative hourly average demand values.
- `electricity_prices_usd_per_kwh`: exactly 24 finite prices. Negative prices are allowed.
- `building_max_demand_kw`: positive finite total building import limit.
- `ev_requirements`: array, default empty. Each EV has unique nonempty `id`,
  integer `arrival_hour` and `deadline_hour` with 0 <= arrival < deadline <= 24,
  nonnegative `energy_required_kwh` and positive `max_charging_power_kw`.
- `flexible_equipment`: optional array, default empty. Each item has unique
  nonempty `id`, `available_hours` (same shape as operating hours),
  nonnegative `energy_required_kwh`, and positive `max_power_kw`.

All power/energy values must be finite. Unknown fields are rejected. Invalid
shapes/windows return HTTP 422. Physical infeasibility (e.g. fixed demand above
capacity or too much EV energy for its window) is **not** an input shape error:
optimization reports it as infeasible with HTTP 200 and null optimized fields.
Solver failures are separate HTTP 500/503 errors; see [Phase 3](phase-3-api.md).

E2 adds optional `OptimizationResult.infeasibility_evidence`, a typed list of
numerical necessary-condition violations or a non-localized solver proof. It
preserves existing `constraint_violations`, aggregate metrics and E1 plans.
See the [field contract, equations and actual JSON](structured-infeasibility-evidence.md)
and [engineering verification/demo report](e2-engineering-readiness.md).
The EE owner approved the shape for Richard's review; final integration review
is pending. No frontend or Meta consumption of E2 is implied.

## Time, power and energy assumptions

A scenario is one abstract 24-hour day in building-local time, with no calendar,
timezone, DST or overnight windows yet. Index h describes [h:00, (h+1):00).
End hours/deadlines are exclusive: a deadline of 17 permits interval 16 but not 17.
For each one-hour interval, average kW × 1 hour = kWh. Daily energy is the sum
of those interval energies. Cost is sum(kW × 1 hour × USD/kWh).

Fixed demand is authoritative and applies even outside building operating hours.
Operating hours are metadata for future input generation; do not zero supplied
loads outside them. EV and flexible equipment use their own explicitly supplied
windows and are not implicitly restricted to operating hours.

The dashboard can generate this fixed vector from the demo background+HVAC,
custom combined hourly values, or summed named-source hourly values. Custom and
named profiles **replace** the demo. Source names/editor metadata are not part
of Scenario; each source is summed once before submission. Inputs must exclude
EV and flexible equipment modeled separately. An aggregate response cannot
establish optimized allocations among named fixed sources.

Model assumptions: grid-side EV energy, 100% charging efficiency, no discharge,
no solar/batteries/export, continuously adjustable and interruptible flexible
loads. Fixed demand excludes controllable EV/flexible loads; total demand adds
them once. HVAC thermal dynamics and minimum run times are out of scope.
The default mode optimizes EV charging and holds flexible loads at baseline.
Explicit joint mode optimizes both EVs and eligible flexible equipment, preserving
the fixed vector. Every movable item has nonnegative hourly power at or below
its maximum, zero power outside its exclusive window, and exactly its requested
energy. Total power includes all loads once and respects the site cap. Flexible
equipment is interruptible and continuously adjustable: uninterrupted cycles,
startup costs and minimum runtimes are not modeled. HVAC profiles remain fixed;
there is no thermal-comfort model.

## Mode selection

```python
def optimize_scenario(
    scenario: Scenario, *, optimize_flexible: bool = False,
) -> OptimizationResult:
    ...
```

Omitted/False is EV-only; True enables the existing joint solver. HTTP selects
the same mode through `POST /api/optimize?scheduling_mode=ev_only` or
`?scheduling_mode=joint`; omission defaults to EV-only. An unknown mode returns
HTTP 422. The request body remains exactly Scenario; mode is not a body field.
Do not submit the detailed engineering BuildingConfig wrapper to this endpoint.
Mode is retained with frontend submitted snapshots; it is not a new field in
OptimizationResult. Both What-if requests use the selected mode, independently
submitted current/alternative inputs and the same response schema.

## Independent module boundaries

`simulate_baseline(scenario: Scenario) -> BaselineResult` in
`backend/simulator/interface.py` returns `demand_kw` (24 values),
`electricity_cost_usd`, `peak_demand_kw`, and `constraint_violations`.
The EE baseline implements charge-on-arrival scheduling for EV and flexible
loads, with fractional final-hour power. It preserves supplied fixed demand and
reports window-capacity or building-limit violations without silently curtailing
loads. The richer `simulate_building` result adds HVAC, background schedules and
conditional tariff components; it is an engineering-module result, not a
FastAPI response. `POST /api/optimize` calls the existing optimizer adapter.

`optimize_scenario(scenario, *, optimize_flexible=False) -> OptimizationResult` in
`backend/optimizer/interface.py` returns:

| Field | Meaning |
| --- | --- |
| `feasibility_status` | `feasible` or `infeasible` |
| `baseline_electricity_cost_usd` | Baseline daily energy cost, finite; can be negative |
| `optimized_electricity_cost_usd` | Optimized daily energy cost or null |
| `baseline_peak_demand_kw` | Maximum baseline hourly average power |
| `optimized_peak_demand_kw` | Maximum optimized hourly average power or null |
| `baseline_demand_kw` | 24 nonnegative values |
| `optimized_demand_kw` | 24 nonnegative values or null |
| `constraint_violations` | Human-readable violations / infeasibility reasons |

A feasible result requires all optimized values and no violations. An infeasible
result requires at least one reason and all optimized fields null. Baseline
values describe the documented uncontrolled baseline even if it violates capacity.
No zero-filled fallback results are returned. Both feasible and proven infeasible
responses use `OptimizationResult` with HTTP 200. Unresolved or unavailable solver
responses use HTTP 503; internal solver and verification failures use HTTP 500.
Errors use `{"detail":{"code":"...","message":"..."}}` without result fields.

The Python adapter raises `OptimizationUnresolvedError`, `OptimizationSolverError`
or `OptimizationVerificationError` for outcomes the shared feasible/infeasible
schema cannot represent. The detailed engine retains richer solver statuses;
HTTP `feasible` alone is not an optimality proof. Independent solver/evaluator
checks validate item constraints and aggregate arithmetic before success. The
legacy demand fields remain aggregate values. The optional `operating_plan`
extension exposes actual verified components from that same outcome, rather than
an inferred decomposition or another solve; see the contract below.

## Optional device-level operating plan (E1)

`OptimizationResult.operating_plan` defaults to null for older payloads. The real
adapter supplies an object with `scheduling_mode`, `solver_status`,
`primary_status`, `peak_tiebreak_status`, `primary_optimum_usd`,
`verification_status`, `warnings`, `baseline_constraint_violations` and
`device_schedules`. Both EVs and flexible items are represented; EV-only flexible
items are explicitly held at baseline. Proven infeasibility exposes baseline
information but null optimized device arrays/energies. Errors still have no result.

Each device carries its original `(device_type, device_id)`, scheduling role,
required energy, exclusive availability window, maximum power, 24-hour baseline/
optimized power arrays and corresponding delivered-energy totals. No device names
exist in Scenario, so none are invented. Existing fields, units, mode inputs and
their meanings do not change. [The exact candidate schema, solver-generated JSON
and consumer instructions](device-operating-plans.md) require Richard's contract
review before frontend timeline integration. This is locally verified E1 work;
older hosted aggregate acceptance is not proof this extension is deployed.

The primary shared objective is daily energy cost. After a proven optimum, a
separate solve minimizes hourly peak while allowing $1e-7 primary-cost increase.
Established independent comparison tolerances are 1e-6 kW/kWh and $2e-7.
Keep full precision internally; equivalent optimal schedules need not have
identical arrays. Baseline-versus-optimized benefits belong to each scenario.
What-if's between-scenario difference is **alternative minus current**, only
available when both results are feasible; failures do not manufacture savings.

## Demand charges

All costs above are **daily energy-only USD**, excluding demand charges, taxes,
fixed fees, and tariffs not represented by the supplied hourly prices. Actual
monthly demand charges need the utility tariff, billing-period peak history,
measurement interval (often shorter than an hour), ratchets and applicable windows.
A maximum of 24 hourly averages is not a measured billing peak. A one-day example
cannot establish monthly bill savings. The detailed BuildingConfig engine supports
separate conditional incremental demand-charge estimates using an existing
monthly peak. Unknown history with a nonzero rate leaves demand/full operating
costs null; those detailed estimates must not be folded into shared fields.

## Recorded acceptance and current guidance

[Local joint application acceptance](joint-ee-application-acceptance.md) and
[bounded hosted acceptance](hosted-joint-ee-acceptance.md) record real request
bodies/modes/responses and independent numerical checks. Hosted served commits
were not confirmed; do not equate a local reference revision with a deployed SHA.
[README](../README.md) is the current setup/status entry point, and
[the demo walkthrough](demo-walkthrough.md) uses the accepted named-source case.
Older phase reports preserve their historical scope and findings.
