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
protobuf are among OR-Tools' transitive requirements. OR-Tools is reserved for the
next milestone and is not imported by simulation. On Windows replace
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

## Integration decisions and future optimizer

Shared models, routes and frontend types are unchanged. The existing
`simulate_baseline(Scenario) -> BaselineResult` boundary is implemented. Its
`electricity_cost_usd` remains energy-only; always inspect `constraint_violations`.
The detailed `SimulationResult` is an EE-local proposed contract, not yet an HTTP
response. It adds feasibility, 24-point equipment schedules and hourly charges,
kWh, explicit tariff components, nullable operating cost, assumptions and warnings.
Equipment keys use `background:`, `ev:` and `flexible:` prefixes plus `hvac`.

The CS teammate should agree on any shared schema extension before wiring the
detailed result into routes or TypeScript. `POST /api/optimize` intentionally
remains 501; `optimize_scenario` still raises `NotImplementedError`. Older
foundation documentation describing the simulator as a stub is superseded here.

`optimizer/scheduler.py` proposes a `SchedulingEngine` protocol, structured result,
comparison, constraint-satisfaction flag and infeasibility reasons. Feasible
solver outputs must supply schedules and comparisons; unavailable optimization
must not fabricate optimized values. `optimizer/constraints.py` checks individual
window capacity and aggregate baseline limits. The protocol is not a solver.

Next implement OR-Tools EV scheduling with continuous hourly power, exact required
energy, deadline/windows, charger limits and the total building demand cap. Verify
solver infeasibility and independently check returned schedules. Preserve HVAC and
background loads. Compare equivalent feasible scenarios under identical tariff
assumptions. Then add flexible equipment; joint HVAC thermal optimization remains
out of scope.
