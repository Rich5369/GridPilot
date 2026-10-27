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

## EV-only optimization and integration

The GLOP continuous linear optimizer changes only EV power. Background, HVAC and
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
`POST /api/optimize` still returns the intentional 501 placeholder, even though the
Python engine now works. Older foundation documentation calling the engine a stub
is superseded by this README. For a feasible optimized shared result,
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
Fixed component profiles and flexible schedules must match exactly; aggregation
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
  cost or comparison. Reasons apply under the held fixed/flexible profiles of
  this phase; future flexible optimization might change feasibility.
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

Remaining scope: flexible-equipment optimization is next. Overnight windows,
charger assignment, losses, solar/storage/export, thermal/comfort optimization,
real tariff billing intervals and live utility integration remain unsupported.
The CS teammate can now call the tested Python entry points, handle typed errors,
and agree on an API mapping before replacing the placeholder. No API/frontend or
AI integration is included in this phase.

### EV milestone verification

Verified on `feature/ev-optimizer`, based on merged PR #3 at main revision
`303ad9c`. The pre-edit baseline was 38 passing backend tests. The final suite is
**78 passed** (40 new optimizer cases), with the existing Starlette/httpx
TestClient deprecation warning. The full suite ran outside the managed sandbox
because of the existing TestClient restriction; focused engineering tests ran
inside it. Both optimizer demo modes and the baseline CLI ran successfully.
All backend modules imported, `python -m pip check` reported no broken requirements,
and `git diff --check` passed. No dependencies or shared schemas changed.
