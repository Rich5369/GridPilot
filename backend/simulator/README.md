# GridPilot engineering engine

A deterministic baseline simulator for a fictional small commercial office.
No hardware, live tariff, AI, HTTP server or optimizer is required. Import from
repository root; the package depends on Pydantic and NumPy, not FastAPI.

## Setup and use

From repository root (Python 3.12+):

```bash
python -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-engineering-lock.txt
backend/.venv/bin/python -m backend.simulator
backend/.venv/bin/python -m backend.simulator sample_data/commercial_office.json
backend/.venv/bin/python -m pytest backend/tests -q
```

The engineering lock captures the verified environment without changing the
CS-owned lockfile. `requirements-engineering.txt` specifies direct ranges for
future upgrades. NumPy, Pydantic, pytest and OR-Tools are installed; pandas and
protobuf are among OR-Tools' transitive requirements. The EV optimizer uses GLOP;
OR-Tools is not imported by baseline simulation. On Windows replace
`backend/.venv/bin/python` with `backend\.venv\Scripts\python.exe`.

```python
import json
from pathlib import Path
from backend.simulator import simulate_building, simulate_baseline
from backend.simulator.building import BuildingConfig
from backend.models.contracts import Scenario

config = BuildingConfig.model_validate_json(
    Path('sample_data/commercial_office.json').read_text())
result = simulate_building(config)  # Also accepts a dictionary
payload = result.model_dump(mode='json')
# Existing shared contract, daily energy-only costs:
shared_result = simulate_baseline(config.scenario)
```

## Input representation and baseline policy

All vectors contain 24 finite hourly averages in kW; each interval lasts one
hour. Index h means [h, h+1), with exclusive end hours and deadlines. A day has
no calendar, DST or overnight windows. Business hours are metadata; supplied
fixed/HVAC profiles remain authoritative outside business hours.

`BuildingConfig` wraps the existing `Scenario` with named background schedules,
a predetermined HVAC schedule and electrical maximum, and a `Tariff`.
Background plus HVAC must equal the shared scenario's fixed demand each hour.
This check prevents counting fixed loads twice. HVAC power must not exceed its
configured maximum. Shared EV/flexible IDs, windows, prices, demand limit and
energy requirements retain their existing semantics.

Each EV starts charging on arrival at its maximum power until its grid-side
energy requirement is met. Fractional final-hour average power is allowed.
Charging efficiency is 100%, with no discharge. Each EV has its own charger;
shared charger assignment is not modeled. Flexible equipment starts at the
beginning of its permitted window, using the same rule. Its equivalent full-power
duration is `energy_required_kwh / max_power_kw`; the sample is 4 kWh / 2 kW =
2 hours. Remove it from the list or set required energy to zero to disable it.
The existing contract supports continuously adjustable, interruptible loads;
minimum run times, integer duration and mandatory contiguous operation would
require an agreed contract extension before optimization.

The baseline does not shift loads to accommodate the building limit. Overloads
are reported without curtailing supplied loads. Energy requests exceeding their
window capacity are reported, with the returned schedule delivering only what
fits. Such results are explicitly infeasible, and their costs describe only the
returned partial schedule. Baseline infeasibility due to overlap is not proof
that optimization cannot find a feasible alternative. Invalid schemas/negative
power/nonfinite inputs raise Pydantic validation errors instead.

## Electricity calculations

Hourly energy is average kW × 1 hour. Hourly charges are kWh × USD/kWh;
energy charges are their sum. Negative prices are supported. Peak demand is the
maximum hourly average kW, which may differ from a utility's shorter billing
measurement interval.

The fixed charge is explicitly allocated to this modeled day, not automatically
prorated from an unspecified monthly fee. For a nonzero USD/kW demand rate,
the incremental demand estimate is:

```text
max(0, modeled_peak_kw - existing_monthly_peak_kw) * demand_charge_usd_per_kw
```

This assumes an all-hour peak tariff, comparable hourly measurements, no ratchet,
and no taxes. It estimates only the additional monthly peak exposure caused by
this day, not the full monthly demand charge. Future days can raise that peak.
When the existing peak is unknown, the demand estimate and full modeled operating
cost are null, with a warning; energy and fixed charges remain available.
A zero demand rate gives zero demand charge without billing history.

Operating cost = daily energy charges + allocated fixed fee + incremental demand
estimate. There are no savings claims, monthly extrapolations or thermal/comfort
models. Costs are unrounded internally; round only for display.

## Hand-checkable sample and verification

The illustrative office is open 08:00–18:00. Background energy is 109 kWh:
lighting 37, office equipment 45.6, networking 14.4 and other loads 12.
HVAC uses 65 kWh (3 kW at 07:00, 6 kW during business hours, 2 kW at 18:00).
Two 7.2 kW chargers deliver 18 and 12 kWh by 17:00; a 2 kW water heater
runs at 10:00 and 11:00 for 4 kWh. The building limit is 40 kW.

| Quantity | Calculated result |
| --- | ---: |
| Total energy | 208 kWh |
| Peak hourly demand (09:00) | 28.5 kW |
| Energy cost | $40.184 |
| Allocated fixed fee | $2 |
| Increment above existing 28 kW peak at $12/kW | $6 |
| Modeled operating cost | $48.184 |

TOU bands are 00–07 at $0.10, 07–16 at $0.18, 16–21 at $0.30,
and 21–24 at $0.10 per kWh. The band energies are respectively 14, 151.8,
36.2 and 6 kWh: charges sum to $40.184. At 09:00, fixed 14.1 kW plus
two 7.2 kW chargers gives 28.5 kW.

Verification: 38 backend tests passed (19 engineering and 19 existing API/contract
tests), all backend modules imported, pip dependency checks passed, and the
OR-Tools native solver solved an empty model successfully. In this managed
workspace the existing FastAPI TestClient suite required execution outside the
sandbox; the 19 engineering tests ran inside it. Python 3.14.2, NumPy 2.5.4,
Pydantic 2.14.1, pytest 9.1.1 and OR-Tools 9.15.6755 were verified.

## Default EV-only optimization and integration

By default the GLOP continuous linear optimizer changes only EV power. Background, HVAC and
flexible-equipment schedules stay fixed, including their contribution to the site
cap. Fixed demand already includes background and HVAC; it is added once. All
24 intervals exist for every EV, with zero upper bounds outside its exclusive
arrival/deadline window. Each EV delivers exactly the requested grid-side energy;
negative prices never permit overcharging. Business hours do not restrict EV
windows or zero supplied fixed demand.

Run four reproducible cases (unchanged office, price shifting, tight site cap,
and an impossible energy/deadline requirement):

```bash
backend/.venv/bin/python -m backend.optimizer
backend/.venv/bin/python -m backend.optimizer --json
backend/.venv/bin/python -m pytest backend/tests -q
```

Shared, energy-only entry point:

```python
from backend.models.contracts import Scenario
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.solver import (
    OptimizationUnresolvedError, OptimizationSolverError, OptimizationVerificationError,
)

scenario = Scenario.model_validate_json(
    Path('sample_data/scenario.demo.json').read_text())
result = optimize_scenario(scenario)
# Check feasibility_status before consuming nullable optimized fields.
# Catch the typed errors above in the future API adapter.
```

Detailed entry point implementing the existing `SchedulingEngine` protocol:

```python
from backend.optimizer.scheduler import ORToolsSchedulingEngine

result = ORToolsSchedulingEngine(time_limit_ms=10000).optimize(config)
print(result.status, result.solver_metadata)
if result.optimized is not None:
    print(result.optimized.equipment_schedules_kw)
    print(result.comparison)
```

Shared models, API routes and frontend types are unchanged. The existing shared
result fields remain daily energy-only. The detailed result is EE-local pending
team agreement; it adds solver metadata, status/failure details and comparisons.
`POST /api/optimize` calls this EV-only adapter; it does not enable the optional
joint mode described below. Older foundation documentation calling the engine or
route a stub is superseded by the implemented integration. For a feasible optimized shared result,
`constraint_violations` is empty even when its uncontrolled baseline exceeded the
cap; call `simulate_baseline` for baseline violations or use the detailed engine,
which preserves baseline compliance independently.

### Objectives and numerical tolerances

`optimize_scenario` minimizes daily energy charges. The detailed engine minimizes
energy charges plus the conditional incremental demand estimate when a nonzero
rate and an existing monthly peak are supplied. With unknown billing history it
minimizes energy only and preserves null demand/operating-cost estimates with
warnings. A zero rate needs no billing history. The allocated fixed fee is
unchanged and excluded from both objectives and savings.

After a proven primary optimum, a separate second solve minimizes maximum hourly
building demand while keeping primary cost within **$0.0000001 (1e-7)** of the
optimum. There is no arbitrary weighted sum of dollars and kW. The reported actual
energy cost may increase by that tolerance to obtain a lower peak; values are not
rounded internally. Solver metadata records the primary optimum (excluding the
fixed fee), objective type, primary status, and peak tie-break status. `optimal`
means the primary objective was proved optimal, with the returned cost within the
documented tolerance; only a separately optimal tie-break proves minimum peak.
Each solve gets its own time limit (10 seconds by default).

GLOP primal/dual feasibility tolerances are set to 1e-9. Independent verification
uses absolute **1e-6 kW** power/cap and **1e-6 kWh** delivered-energy tolerances;
the independent dollar check uses twice the primary objective tolerance. Raw
values are checked before removing only sub-tolerance negative numerical noise.
The actual peak is also checked against a proved secondary optimum.
Fixed component profiles (and held flexible schedules in EV-only mode) must match exactly; aggregation
of shared fixed demand allows 1e-8 kW roundoff, matching BuildingConfig validation.
No meaningful violations are hidden by rounding.

### Independent schedule evaluation

`simulator.interface.evaluate_scenario_schedules(scenario, schedules)` evaluates
supplied shared schedules (`fixed`, `ev:<id>`, `flexible:<id>`).
`simulator.engine.evaluate_building_schedules(config, schedules)` evaluates supplied
named component schedules (`background:<name>`, `hvac`, `ev:<id>`, `flexible:<id>`).
They check keys, vector shapes, finite nonnegative values, fixed preservation,
equipment energy/windows/power and the total cap, then recompute demand, kWh,
hourly charges, actual peak and canonical tariff components. They return violations
for physically invalid schedules; malformed vectors/keys raise validation errors.
The detailed solver does not call the baseline simulator to evaluate optimized
EVs. The historical `SimulationResult.baseline_operating_cost_usd` field means the
operating cost of the supplied schedule, including in `result.optimized`.

Comparisons separate energy-charge reduction from conditional demand-charge
reduction. Unknown billing history leaves total/demand comparisons null. A baseline
cap violation alone does not invalidate an equal-work comparison, but its
noncompliance remains visible. Incomplete baseline energy invalidates savings;
comparison reductions are null with reasons (and physically impossible requests
normally return no optimized result at all).

### Results and failure semantics

- `optimal`: primary optimum proved and returned schedule independently verified.
- `feasible`: independently verified incumbent without primary optimality proof;
  no peak tie-break is attempted.
- `infeasible`: analytic capacity proof or GLOP INFEASIBLE; no optimized schedule,
  cost or comparison. Reasons apply under the selected mode: flexible equipment
  is held in EV-only mode and movable in joint mode.
- `unresolved`: primary solve did not return a solution/proof, including time
  limits. It is not mathematical infeasibility.
- `error`: unavailable solver, native exception, abnormal/unbounded/invalid model,
  or inconsistent secondary failure. No optimized values are returned.
- `verification_failed`: returned solver values or detailed evaluation failed
  independent physical/cost checks; no optimized values are returned.

The shared feasible/infeasible contract cannot carry unresolved/error statuses.
Its adapter raises `OptimizationUnresolvedError`, `OptimizationSolverError` or
`OptimizationVerificationError`, with details on the exception's `outcome`.
The detailed engine returns richer statuses and preserves the baseline on all
solver failures. A secondary NOT_SOLVED retains the verified primary optimum,
with a warning and unresolved tie-break status; a secondary feasible incumbent
is explicitly distinguished from a proved peak optimum.

### Demonstration results

Actual GLOP results, shown to nine decimals where the cost tolerance matters:

| Case | Baseline energy USD | Optimized energy USD | Baseline / optimized peak kW | Outcome |
| --- | ---: | ---: | --- | --- |
| Existing office | 40.184000000 | 40.184000100 | 28.5 / 18.349999896 | Optimal |
| Price shifting | 7.900000000 | 7.300000100 | 3 / 2.999999667 | Optimal |
| Tight cap (3 kW) | 5.600000000 | 5.600000000 | 5 / 3 | Optimal; baseline overloaded |
| Impossible deadline | 6.000000000 | unavailable | 5 / unavailable | Infeasible; baseline incomplete |

The office still uses 208 kWh, delivering 18 and 12 kWh to its EVs. Its energy-only
optimum has no improvement over baseline; the $1e-7 increase is the stated peak
tie-break allowance. Conditional demand increment drops $6 to $0; allocated fee
remains $2, so modeled operating cost changes $48.184 to $42.1840001. This is a
conditional one-day comparison, not a guaranteed monthly utility saving.
The price-shift case delivers 2 kWh by hour 2 with approximately $0.60 less energy
cost. The tight-cap case coordinates two 2 kWh EV requirements by hour 2, meeting
the 3 kW cap without changing energy cost. The infeasible case requests 5 kWh for
one EV in a two-hour 2 kW window, which can deliver at most 4 kWh; no savings are
computed against that partial baseline. Full precision schedules and per-EV
completion data are available with `--json`.

Optional flexible-equipment optimization is available in the detailed engine
as described below. Overnight windows,
charger assignment, losses, solar/storage/export, thermal/comfort optimization,
real tariff billing intervals and live utility integration remain unsupported.
The shared API remains EV-only; no API/frontend or AI change is needed to use
the optional engineering mode locally.

## Optional joint EV and flexible-equipment optimization

Implemented on `feature/joint-flexible-load-optimization`, starting from main
`8180e09aee27c452de9ef32f989243806dc3e3b1` (PR #11). A fresh fetch found no newer
main revision. This is a local detailed-engine capability, not an enabled
dashboard, What-if or AI feature.

Enable it explicitly on the existing engine:

```python
from backend.optimizer.__main__ import joint_demonstration_configs
from backend.optimizer.scheduler import ORToolsSchedulingEngine

config = joint_demonstration_configs()['joint_recovery']
result = ORToolsSchedulingEngine(optimize_flexible=True).optimize(config)
print(result.scheduling_mode, result.status)  # joint, optimal
if result.optimized is not None:
    print(result.optimized.equipment_schedules_kw)
```

`ORToolsSchedulingEngine()` and `optimize_scenario(Scenario)` remain EV-only.
Detailed results identify `scheduling_mode` as `ev_only` or `joint`, including
infeasibility and failure results. The shared HTTP models have no new fields.
The uncontrolled baseline still starts all loads at their earliest availability.

### Model and independent validation

One GLOP solver core supports both modes. Joint mode adds continuous hourly power
variables for every flexible item alongside the EV variables. Each item has
zero power outside its availability window, nonnegative power at or below its
maximum, and an equality enforcing its exact energy requirement. Negative prices
cannot cause extra work or overcharging. All loads count exactly once toward
the site cap. Background/HVAC stay immutable; only those immutable loads are
deducted from available capacity in joint mode. Necessary shared-window
diagnostics include both EV and flexible energy; more complex conflicts are
left to the same LP. An overloaded earliest-start equipment placement alone
does not prove joint infeasibility.

Both independent evaluators accept the explicit keyword `optimize_flexible=True`:

```python
evaluate_scenario_schedules(config.scenario, shared_schedules, optimize_flexible=True)
evaluate_building_schedules(config, detailed_schedules, optimize_flexible=True)
```

Use schedules with the existing shared or detailed keys described above. Joint
evaluation still checks each item's energy, window and power, the site cap,
and fixed-profile preservation. It permits a valid flexible shift; default
evaluation rejects that shift. The detailed scheduler transfers the actual
optimized flexible schedules into its result before independent reevaluation.

The same energy/conditional-demand primary objective, unknown-history nulls,
secondary peak minimization, per-solve time limits, physical/objective tolerances,
and solver-status distinctions documented above apply. Secondary timeout can
return only an independently verified primary optimum, with a warning.

Flexible loads represent **interruptible, continuously adjustable power** over
24 one-hour intervals with exclusive end hours. The mode does not model
uninterrupted machine cycles, startup costs, minimum run times, binary on/off
decisions or HVAC thermal dynamics. No new solver dependency is introduced.

### Reproduce the joint demonstrations

Use the existing environment; no dependency upgrade is required. These commands
run one case at a time and can add `--json` for full-precision schedules:

```bash
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_recovery
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_price_shift
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_infeasible
# Contrast with held equipment using exactly the same inputs:
backend/.venv/bin/python -m backend.optimizer --example joint_recovery
backend/.venv/bin/python -m backend.optimizer --example joint_price_shift
# All seven cases in joint mode; original four cases remain the unflagged default:
backend/.venv/bin/python -m backend.optimizer --optimize-flexible
backend/.venv/bin/python -m backend.optimizer
backend/.venv/bin/python -m pytest backend/tests/test_joint_optimizer.py -q
backend/.venv/bin/python -m pytest backend/tests -q
```

Each new case uses fixed demand 1 kW throughout, site cap 3 kW, and equipment
requiring 2 kWh at at most 2 kW within [0,2). Measured results:

| Case | EV-only outcome / energy cost | Joint outcome / energy cost | Joint energy / peak |
| --- | --- | --- | --- |
| A `joint_recovery` | Infeasible / no optimized cost | Optimal / $5.600000000 | 28 kWh / 3 kW |
| B `joint_price_shift` | Optimal / $7.900000000 | Optimal / $7.300000100 | 26 kWh / 2.999999667 kW |
| C `joint_infeasible` | Infeasible / no optimized cost | Infeasible / no optimized cost | No optimized values |

**A:** Flat $0.20/kWh. The EV requires 2 kWh at maximum 2 kW in [0,1).
The baseline places both items in hour 0: 1 + 2 + 2 = 5 kW, above the cap.
Holding equipment there leaves no EV headroom. Joint scheduling runs EV 2 kW
in hour 0 and equipment 2 kW in hour 1, with all other hours at 1 kW.
Energy is 24 + 2 + 2 = 28 kWh, charge 28 × $0.20 = $5.60, peak 3 kW.

**B:** No EVs. Prices are $0.40 at hour 0, $0.10 at hour 1 and $0.30 otherwise.
Fixed energy costs $0.40 + $0.10 + 22 × $0.30 = $7.10. Earliest-start equipment
adds $0.80; shifting its 2 kWh to hour 1 adds $0.20 instead. The primary optimum
is $7.30; the peak tie-break returns $7.300000100 with equipment power about
0.000000333 at hour 0 and 1.999999667 at hour 1. This is the existing $1e-7
cost allowance, not missing energy: both modes consume 26 kWh and deliver 2 kWh.

**C:** Flat $0.20/kWh. EV energy is 3 kWh, at most 2 kW in [0,2).
Individually both EV and equipment fit their windows, but jointly require
3 + 2 = 5 kWh. Site headroom is (3 − 1) × 2 = 4 kWh. Joint mode reports
that shared-window shortfall with reasons, null optimized result and no
comparison. Baseline delivers 29 kWh at $5.80 but violates the cap; its cost
is not a feasible alternative or a fabricated optimized value.

Verification: **38 new joint tests passed; full backend suite 149 passed**,
with the existing Starlette TestClient deprecation warning. All existing tests
and their assertions were retained. Tests independently reconstruct demand,
cost, peak, item energy/windows/bounds and immutable profiles from returned
schedules, and cover negative prices, zero energy, no EVs, malformed/invalid
schedules, held-placement recovery, analytic and solver-proved infeasibility,
unchanged aggregate with altered named fixed profiles, conditional demand and failure/fallback
semantics. Both flagged and original unflagged CLI runs succeeded. This workspace
used `/tmp/gridpilot-joint-venv` installed from `backend/requirements-lock.txt`;
the full TestClient suite required execution outside the sandbox as before.

Richard would need a separately agreed application mode selector, API mapping,
frontend labeling and mode-aware AI explanations before exposing joint scheduling
to dashboard users. He should preserve the current default and carry mode
provenance through comparisons so an EV-only result is not described as joint.
No frontend, AI, API route, HTTP schema or deployment setting changed here.

### EV milestone verification

Verified on `feature/ev-optimizer`, based on merged PR #3 at main revision
`303ad9c`. The pre-edit baseline was 38 passing backend tests. The final suite is
**78 passed** (40 new optimizer cases), with the existing Starlette/httpx
TestClient deprecation warning. The full suite ran outside the managed sandbox
because of the existing TestClient restriction; focused engineering tests ran
inside it. Both optimizer demo modes and the baseline CLI ran successfully.
All backend modules imported, `python -m pip check` reported no broken requirements,
and `git diff --check` passed. No dependencies or shared schemas changed.

## What-if EE acceptance: cost, power and departure time

These are illustrative modeled scenarios using the actual frontend office defaults,
not measured building data or monthly utility savings. Acceptance used
`test/ee-what-if-validation`, based on current main `ce323ce` (merged PR #9).
The optimizer and frontend were not changed.

### Exact inputs and UI walkthrough

For each pair, start at **Scenario configuration → Reset to Default Scenario**.
Set **Arrival hour = 15** and the current deadline from the table below. Leave
all other defaults unchanged, including the current 25 kW demand limit. Open
**What-if scenarios → Create alternative from current** (or **Reset alternative
from current** if an alternative already exists), then edit only the alternative
fields listed. Click **Compare both scenarios**. Configure and reset the alternative
again for every pair; do not accidentally retain the previous pair's parameters.

| Pair | Current deadline / cap | Alternative deadline / cap | Alternative edits |
| --- | --- | --- | --- |
| A: More charging time | 18:00 / 25 kW | 22:00 / 25 kW | Deadline 22 |
| B: Lower building limit | 22:00 / 25 kW | 22:00 / 15 kW | Limit 15 |
| C: Insufficient capacity | 18:00 / 25 kW | 18:00 / 15 kW | Limit 15 |

All six requests preserve the complete input configuration:

- Operating hours `[8, 18)` are metadata. Explicit EV availability can extend
  beyond closing time without changing the predetermined HVAC profile.
- Two EVs, each requiring 14.4 kWh, each rated 7.2 kW, both arriving at 15:00.
  Only the deadline and site cap vary as listed above. End hours are exclusive.
- Prices: $0.28/kWh during `[14, 20)`, $0.12/kWh otherwise.
- Background: 1.5 kW in all 24 intervals. HVAC hourly kW:
  `[0,0,0,0,0,0,1,2,4,5,5,6,6,6,6,5,5,4,2,1,0,0,0,0]`.
- Therefore `fixed_demand_kw` is
  `[1.5,1.5,1.5,1.5,1.5,1.5,2.5,3.5,5.5,6.5,6.5,7.5,7.5,7.5,7.5,6.5,6.5,5.5,3.5,2.5,1.5,1.5,1.5,1.5]`.
- Fixed flexible equipment `office-equipment`: 6 kWh required, maximum 3 kW,
  available `[10, 16)`. Its baseline schedule remains 3 kW at hours 10 and 11,
  zero otherwise. It is counted once in site demand and energy.
- EV IDs are `office-ev-1` and `office-ev-2`; no demand-charge or fixed-fee fields
  are sent to the shared Scenario endpoint. Only energy charges are compared.

### Measured results and independent calculations

All baselines charge the EVs at 15:00 and 16:00. They deliver all requested energy,
consume 128.8 kWh, cost $25.184 and peak at 20.9 kW. Under a 15 kW site limit,
that uncontrolled baseline violates capacity; this is separate from optimized
feasibility. Unlike the earlier impossible-EV demo, these baselines do not omit work.

| Pair | Optimized current / alternative energy USD | Optimized current / alternative peak kW | Optimized kWh | Feasibility |
| --- | --- | --- | --- | --- |
| A | 25.184 / 20.5760001 | 15.76666666666667 / 15.8999996875 | 128.8 / 128.8 | both feasible |
| B | 20.5760001 / 20.864000100000002 | 15.8999996875 / 14.999999687499997 | 128.8 / 128.8 | both feasible |
| C | 25.184 / null | 15.76666666666667 / null | 128.8 / unavailable | current feasible; alternative infeasible |

The non-EV loads consume 100 kWh: 94 kWh fixed background/HVAC plus 6 kWh
flexible equipment. Of this, 32 kWh occurs at peak prices, giving
`32 × 0.28 + 68 × 0.12 = $17.12`. EV energy is always 28.8 kWh when feasible,
so total building energy is `100 + 28.8 = 128.8 kWh`.

**A — More time enables cheaper charging.** With an 18:00 deadline, all available
charging hours are expensive: `17.12 + 28.8 × 0.28 = $25.184`. The lowest peak
at that cost distributes EV charging over hours 15–17:
`(6.5 + 6.5 + 5.5 + 28.8) / 3 = 15.7666667 kW`.
A 22:00 deadline opens two cheap intervals, hours 20 and 21. The energy optimum
moves all 28.8 kWh there: `17.12 + 28.8 × 0.12 = $20.576`, a $4.608 reduction.
The resulting ideal peak is `1.5 + 28.8 / 2 = 15.9 kW`, slightly higher than
before. Energy cost is the primary objective; minimum peak is a separate tie-break.
Later departure buys operating flexibility, not reduced requested charging service.

**B — A lower power limit has a small energy-price premium.** A 15 kW cap leaves
`15 - 1.5 = 13.5 kW` for EVs in each cheap hour: `13.5 × 2 = 27 kWh`.
The remaining 1.8 kWh must use expensive hours. Cost is
`17.12 + 27 × 0.12 + 1.8 × 0.28 = $20.864`, a $0.288 increase for a lower peak.
Every EV still receives 14.4 kWh by 22:00; the daily energy remains unchanged.

**C — The earlier deadline and lower cap cannot satisfy the requirements.**
Before 18:00, site headroom for charging is `8.5 + 8.5 + 9.5 = 26.5 kWh`, below
28.8 kWh required. Individual charger/window capacity is sufficient, but shared
building capacity is not. The API returns this reason and null optimized demand,
cost and peak. No between-scenario optimized-cost comparison is available.

The proven primary optima were $25.184, $20.576 and $20.864, confirmed through
internal `primary_status=optimal` and `primary_optimum_usd`, not inferred from the
shared API's feasibility flag. Returned costs can be $1e-7 higher because of the
existing peak tie-break allowance. Physical checks use absolute 1e-6 kW/kWh and
cost checks 2e-7 USD. Equivalent optimal schedules need not match hour for hour.
No numerical discrepancy required an engine change.

### Explain the comparison to a facility manager

“Keeping the vehicles until 22:00 lets us deliver the same charging energy for
about $4.61 less that day. If we also restrict the building to 15 kW, the model
still completes charging, for about $0.29 more than the cheaper unconstrained
option. Requiring that same charging by 18:00 under the 15 kW cap is impossible.
We must change a requirement rather than silently undercharge the vehicles.”

Each card's baseline-to-optimized benefit is distinct from the difference between
operating scenarios. Those individual benefits are approximately $0, $4.608 and
$4.32 for the three feasible configurations. The between-scenario convention is
**alternative minus current**: Pair A is about **-$4.61**, **+0.13 kW**, and zero
kWh; Pair B is about **+$0.29**, **-0.90 kW**, and zero kWh. Pair C differences
are unavailable. Reducing the `Energy per EV` input would instead request less
service; do not present that as delivering the same work more efficiently.
Energy-only cost reductions are not monthly demand-charge savings.

### Regression and real-workflow verification

```bash
backend/.venv/bin/python -m pytest backend/tests/test_what_if_acceptance.py -q
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend test -- src/components/dashboard/WhatIf.test.tsx src/data/demoScenario.test.ts
```

The new EE file adds seven focused tests: the three feasible endpoint calculations
with independent physical checks, deadline relaxation, cap tightening (including
infeasibility), and comparison signs/equal service. These reuse the existing
engine and verify primary optimality metadata. The complete backend suite passed
**111 tests**, with the existing TestClient deprecation warning. The existing
What-if/frontend-adapter tests passed **19 tests**. No shared contract changed.

Local Chromium acceptance used the genuine frontend at `http://127.0.0.1:5173`
and API at `http://localhost:8000`. All six complete browser POST bodies matched
Scenarios exported from the actual `toScenario` adapter and the EE test inputs.
Captured responses were compared with independent local engine calls. Energy,
peak, capacity, delivered EV energy/windows/power, held profiles and financial
arithmetic passed. Per-EV schedules were checked in the engine, since the shared
HTTP response exposes only aggregate demand. Displayed costs, peaks, individual
baseline benefits and between-scenario signs matched the genuine responses.
Pair C correctly suppressed optimized values and between-scenario comparisons.
No AI calls, mock solver responses or hosted deployment were needed for this run.

Temporary evidence is in `/tmp/gridpilot-whatif-ee`: `pair-A.json`, `pair-B.json`,
`pair-C.json` contain exact submitted requests, responses and displayed text;
corresponding PNGs show each comparison. `frontend-scenarios.json` records the
actual adapter exports. The focused browser command was:

```bash
NODE_PATH=/tmp/gridpilot-browser/node_modules node /tmp/gridpilot-whatif-ee/browser-acceptance.cjs
```

**Remaining frontend issue for Richard:** Pair B displays `-0.00 kWh` for the
between-scenario consumption difference. The actual response-array subtraction
is `-2.842170943040401e-14 kWh`, numerical roundoff, with both scenarios delivering
128.8 kWh. Reproduce using Pair B's exact UI steps above, then inspect the final
“Optimized consumption difference.” `WhatIf.tsx` formats the raw subtraction
with `.toFixed(2)`. Proposed correction: normalize a difference whose absolute
value is below half the displayed 0.01 kWh unit (0.005 kWh) to zero **for display
only**, retaining full-precision data/calculations, and add a frontend formatting
regression. The browser acceptance script intentionally exits nonzero to flag
this display defect after completing all three numerical comparisons. Numerical
acceptance passed; display acceptance is qualified by this issue. Frontend code
was left unchanged for Richard. This run does not assert hosted What-if acceptance
or authenticated live Meta behavior.

### PR #10 display follow-up: negative zero resolved locally

The historical Pair B finding above was reproduced and corrected on
`fix/what-if-zero-display`, starting from main `4e81623f1947ab081047dbe3e8ee50392f6d149d`.
`WhatIf.tsx` now formats the two between-scenario power/energy differences to
exactly two decimals, then changes only the resulting string `-0.00` to `0.00`.
This preserves alternative-minus-current arithmetic, raw responses and meaningful
negative values, including values that round to `-0.01`. No solver, simulator,
API contract or route changed. The neighboring peak difference uses the same
narrow display-only correction; USD formatting is unchanged.

Twelve new rendered-component cases cover the reported roundoff, signed/ordinary
zero, meaningful positive/negative differences and both sides of the two-decimal
rounding threshold, including the boundary itself. The regression reproduced the
original failure before the fix. All **14 What-if tests** and the frontend
production build passed afterward; the existing timeout/late-result assertions
and engineering acceptance tests were left intact.

The documented Pair B was rerun through local Chromium and genuine FastAPI/GLOP
responses. Complete requests matched the previous Scenario captures. Current and
alternative remained feasible, each consuming 128.8 kWh. Energy charges remained
$20.5760001 / $20.864000100000002, with peaks 15.8999996875 /
14.999999687499997 kW. The between-scenario display correctly showed **$0.29**,
**-0.90 kW**, and **0.00 kWh**. The focused browser check exited successfully,
with no display issues or browser page errors. Local evidence is under
`/tmp/gridpilot-whatif-zero-display` (`pair-B.json`, `pair-B.png`,
`browser-summary.json`); the focused command was:

```bash
NODE_PATH=/tmp/gridpilot-browser/node_modules node /tmp/gridpilot-whatif-zero-display/verify-pair-b.cjs
```

The specific local PR #10 formatting acceptance issue is resolved. This follow-up
does not claim a deployed fix, hosted What-if acceptance or authenticated Meta
verification. The historical defect record above remains unchanged.
