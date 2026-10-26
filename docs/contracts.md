# Preliminary energy contracts (v0.1)

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
future optimization must report it as infeasible. Today all structurally valid
scenarios return 501, including physically infeasible ones.

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

Provisional model: grid-side EV energy, 100% charging efficiency, no discharge,
no solar/batteries/export, continuously adjustable and interruptible flexible
loads. Fixed demand excludes controllable EV/flexible loads; total demand adds
them once. HVAC thermal dynamics and minimum run times are out of scope.
Confirm these assumptions before implementing a solver.

## Independent module boundaries

`simulate_baseline(scenario: Scenario) -> BaselineResult` in
`backend/simulator/interface.py` returns `demand_kw` (24 values),
`electricity_cost_usd`, `peak_demand_kw`, and `constraint_violations`.
The teammate must define and document the uncontrolled scheduling policy first
(e.g. charge on arrival); no policy is implemented yet.

`optimize_scenario(scenario: Scenario) -> OptimizationResult` in
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
No zero-filled fallback results: stubs raise `NotImplementedError`. The HTTP
placeholder returns only `status` and `message`, not `OptimizationResult`.

## Demand charges

All costs above are **daily energy-only USD**, excluding demand charges, taxes,
fixed fees, and tariffs not represented by the supplied hourly prices. Actual
monthly demand charges need the utility tariff, billing-period peak history,
measurement interval (often shorter than an hour), ratchets and applicable windows.
A maximum of 24 hourly averages is not a measured billing peak. A one-day example
cannot establish monthly bill savings. Future illustrative demand-charge estimates
must state their assumptions separately; do not fold them into these fields.
