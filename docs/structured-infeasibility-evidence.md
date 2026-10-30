# E2 structured infeasibility evidence — contract proposal

Prepared before shared-contract edits, from main
`904c618602beacc564e686d75c3e2ea4390b1f3b` (PR #36).
The EE owner approved this additive shape for Richard's review. It is implemented
on the E2 feature branch; Richard's final field/presentation review remains pending.
This is not evidence of frontend integration or deployment.

Optional top-level `OptimizationResult.infeasibility_evidence` is a list
of typed evidence objects. Existing aggregate fields, `constraint_violations`,
and the entire E1 `operating_plan` remain unchanged. Old responses may omit the
field (or provide null); feasible new responses use an empty list. Absence means
structured evidence was not supplied, not feasibility or absence of violations.
Errors remain HTTP errors and never carry mathematical infeasibility evidence.
Existing consumers that ignore new fields remain compatible; strict external
schemas need to accept the additive extension before rollout. The current React
consumer ignores unknown aggregate fields; frontend presentation belongs to Richard.

Each object has:

| Field | Meaning |
| --- | --- |
| `code` | Stable reason code below |
| `message` | Deterministic explanation, not parsed by consumers |
| `proof_source` | `analytical_necessary_condition` or `solver_infeasible` |
| `devices` | Ordered `{device_type: ev\|flexible, device_id: string}` references; identity is the pair |
| `window` | `{start_hour, end_hour}`, exclusive end; null for solver-only proof |
| `required`, `available` | Unrounded nonnegative quantities, or null for solver-only proof |
| `unit` | `kW`, `kWh`, or null for solver-only proof |
| `context` | Typed numerical context and `scheduling_mode`; see below |

Context fields: `scheduling_mode` (EV-only or joint), `tolerance` (absolute units
of this item's comparison; null for solver-only proof), optional `site_limit_kw`, `max_power_kw`,
`immutable_fixed_power_kw`, `held_flexible_power_kw`,
`immutable_fixed_energy_kwh`, and `held_flexible_energy_kwh`. Unused numerical
context fields are null. Context does not allocate fixed demand among named
sources; the submitted Scenario only contains their aggregate.

## Codes and calculations

- `device_window_capacity`: required device kWh > max kW × (end − start) hours
  + 1e-8 kWh. Includes flexible devices in EV-only mode: their held baseline
  cannot deliver an intrinsically impossible requirement either.
- `fixed_demand_above_site_limit`: fixed/held kW > site kW + 1e-6 kW at a
  particular hour. Joint uses only submitted fixed demand; EV-only includes
  flexible loads at their deterministic baseline. Devices identify contributing
  positive held flexible loads, not movable EVs or inferred fixed-source devices.
- `shared_window_capacity`: required kWh summed over movable devices whose
  **whole** availability is inside [start,end), compared with
  Σ max(0,site_limit − immutable_fixed[h] − held_flexible[h]) × 1 hour,
  with 1e-6 kWh comparison tolerance. Joint includes EVs and flexible loads;
  EV-only includes only EV requirements, subtracting held flexible power once.
  Wider/partially overlapping devices are not charged their full energy to a
  narrower interval. This is a necessary capacity bound, not an allocation or
  a unique/exhaustive root cause.
- `solver_infeasible`: actual primary GLOP INFEASIBLE result without an isolated
  analytical certificate. No devices, interval, quantities or unit are invented.
  This does not identify a particular responsible constraint.

Candidate intervals use 0, 24 and movable availability endpoints (at most 300
intervals). For repeated shared certificates with exactly the same device set,
retain the lowest available capacity, then shortest interval, then earliest
start. Retain all individual-device and hourly fixed/held violations. This
bounds redundant shared cards without hiding distinct device sets or hours.
Legacy text retains all original diagnostics in their original order.

No extra optimization runs, repair suggestions, inferred unique causes, changes
to solver mathematics, or E1 schedule reconstruction are part of E2.

## Representative actual JSON

The following objects are copied from the real local HTTP records, not fabricated
illustrations. The complete Scenario bodies, mode, responses, null optimized
fields, E1 plans and arithmetic checks are in
[the local HTTP evidence](verification/e2-local-http.json). New feasible responses
contain `"infeasibility_evidence": []`; old responses may omit it or use null.

Joint `joint_infeasible` returns this item:

```json
{
  "code": "shared_window_capacity",
  "message": "Window [0, 2): EVs and flexible equipment require 5 kWh but shared capacity is at most 4 kWh",
  "proof_source": "analytical_necessary_condition",
  "devices": [
    {
      "device_type": "ev",
      "device_id": "a"
    },
    {
      "device_type": "flexible",
      "device_id": "pump"
    }
  ],
  "window": {
    "start_hour": 0,
    "end_hour": 2
  },
  "required": 5.0,
  "available": 4.0,
  "unit": "kWh",
  "context": {
    "scheduling_mode": "joint",
    "tolerance": 1e-06,
    "site_limit_kw": 3.0,
    "max_power_kw": null,
    "immutable_fixed_power_kw": null,
    "held_flexible_power_kw": null,
    "immutable_fixed_energy_kwh": 2.0,
    "held_flexible_energy_kwh": 0.0
  }
}
```

The real solver-only case returns this item, without an invented numerical cause:

```json
{
  "code": "solver_infeasible",
  "message": "GLOP proved the submitted constraints infeasible; no specific analytical certificate is available.",
  "proof_source": "solver_infeasible",
  "devices": [],
  "window": null,
  "required": null,
  "available": null,
  "unit": null,
  "context": {
    "scheduling_mode": "joint",
    "tolerance": null,
    "site_limit_kw": null,
    "max_power_kw": null,
    "immutable_fixed_power_kw": null,
    "held_flexible_power_kw": null,
    "immutable_fixed_energy_kwh": null,
    "held_flexible_energy_kwh": null
  }
}
```

## Frontend / advisor consumption

Render cards from `code`, `devices`, `window`, the quantity pair and `unit`; use
`message` as a complete fallback. Display [start,end) with an exclusive deadline.
Format copies for display only. Preserve raw kW/kWh in exported evidence. Treat
`solver_infeasible` as a proof of the complete model, with no localized cause.
Treat the analytical codes as verified violations of necessary bounds; do not
say that fixing one card guarantees feasibility. Multiple cards can overlap and
must not be added into one total shortage. Held flexible loads are context for
EV-only headroom, not a second independently movable energy requirement.

Keep `constraint_violations` for older consumers. E2 does not remove repetitive
legacy text; grouping applies to the new cards only. No frontend or Meta code
is changed here, so explanation cards and advisor consumption remain Richard's
integration work. Do not claim the advisor already uses these objects.

Before merge, Richard should review the exact field names and strict-client
compatibility. Hosted E2 acceptance is separate from local verification.
