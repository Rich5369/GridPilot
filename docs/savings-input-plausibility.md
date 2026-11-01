# Savings input plausibility and frontend handoff

## Investigation and scope

Branch `feature/savings-input-plausibility` starts at main `911f381006ebf1ec597b86e19de29e74da0b205a`, the merge of PR #53. GitHub confirmed that PR is merged. Production's public OpenAPI exposes both recurring-benefit fields, and a fictional request to the deterministic endpoint returned 12,500 kWh, $2,500 gross, $300 recurring benefit, $2,700 net, one-year payback and 100% annual simple ROI. This verifies deployed behavior, not Render's exact commit identity. No deployment or paid inference was performed. The original checkout and its unrelated uncommitted backend/frontend work were preserved; implementation uses `/tmp/gridpilot-input-plausibility`.

Confirmed source findings:

| Source/function | Finding and treatment |
| --- | --- |
| `backend/savings/models.py`: `Number`, `Measure.physical_bounds` | Finite nonnegative numbers up to 1e12 accept extraordinary equipment power. Counts up to ten million are accepted. Previously no unit-review warning. Strict type checks, positive replacement lighting, before/after watt ordering, daily/annual bounds and avoidable-hours bounds already work and remain unchanged. |
| `backend/savings/calculators.py`: `energy` | LED wattages are per fixture; office wattages per device; controls/shutdown load is aggregate kW. Multiplication can magnify wrong units, total-instead-of-per-device entries or incorrect hours. Added scoped advisory checks; no equation changes. These mistakes are possible risks, not detected proof of an error. |
| `backend/savings/service.py`: `recommend_measure` | Already gates missing inputs, equivalent service, switching safety, rates and expenses; preserves nulls and caller provenance. It lacked specific evidence about existing controls, average avoidable power and comparable annual conditions. Added optional attestations, actionable limitations and category-specific assumptions. |
| `backend/savings/service.py`: `build_recommendations` | Already provides global warnings, overlapping-load guidance, null portfolio total and deterministic ranking. Reused global warnings with measure IDs; added per-recommendation warnings for display beside results. |
| `backend/savings/catalog.py`: `CATALOG` | Already requests baseline periods and no nameplate-only claims. Optional evidence confirmations are now discoverable per applicable category. |
| `backend/ai/savings.py`: `savings_conversation` | Already computes from structured caller evidence before Meta category selection; AI cannot invent equipment inputs. Nested savings response carries new warnings unchanged. No AI implementation change. |

All six calculators remain in scope: LED has unit/runtime assumptions; lighting controls, shutdown and office have unit checks and operating-baseline limitations; motor and refrigeration have comparison-condition limitations. No count/annual-kWh/dollar/payback ceiling or industry-average rating was introduced.

## Warning contract

HTTP 422 remains reserved for existing validation failures (including impossible schedules). Advisory warnings never block, rescale, clamp, normalize or change inputs, energy, money, status, confidence, missing-information gates or ranking.

New additive field: `recommendations[].warnings`, a default-empty list of strings. Each warning is also copied to the existing response `warnings` list as `<measure id>: <message>`. Use per-measure warnings near financial results, or the top-level copy for a legacy warning panel; avoid displaying duplicates. `Plausibility:` means review an entered value, not a confirmed error. `Evidence limitation:` means a specific caller confirmation is absent or false. Do not show either as a hard validation error or a verified correction. The existing global overlap/API notices remain even when a measure has no warnings.

Deterministic triggers:

- LED `old_watts`/`new_watts` and office `active_watts`/`low_power_watts` at **1,000 W or more per fixture/device**: confirm W versus kW and per-unit versus inventory totals.
- Controls/shutdown `connected_load_kw` at **1,000 kW or more aggregate**: confirm kW versus W and equipment scope. Large legitimate loads remain accepted, with the same review notice.
- Controls/shutdown/office with positive supplied avoidable hours and `operating_baseline_confirmed` not explicitly true: confirm actual equipment runtime, incremental avoidable hours and average avoidable power after existing occupancy controls, sleep/standby, shutdown, cycling and partial load.
- Motor/refrigeration with both annual consumptions supplied and `comparison_conditions_confirmed` not explicitly true: confirm comparable annual periods, runtime, capacity and service; motor output/load or refrigeration temperatures/ambient conditions. Identify specifications versus site measurements in `evidence_reference`.

The round 1,000 thresholds are **unit-conversion review boundaries**, not verified industry maxima, typical equipment ratings, probability estimates or safety limits. They intentionally favor simple unit review; they can flag legitimate industrial equipment and miss smaller mistakes. Counts alone do not trigger warnings. Unit warnings remain visible even when evidence confirmations are true. There is no inferred business-size classification.

New optional nullable strict booleans default to null:

| Request field | Applicable categories | What true attests |
| --- | --- | --- |
| `operating_baseline_confirmed` | `office`, `shutdown`, `lighting_controls` | Submitted average avoidable load and incremental hours account for existing behavior and actual equipment runtime. |
| `comparison_conditions_confirmed` | `motor`, `refrigeration` | Annual comparisons cover comparable conditions; specification projections are identified in the evidence reference. |

False/null/omitted confirmations add guidance without blocking calculations. Do not preselect true or infer it from business type, a measured inventory, `evidence_kind`, or `equivalent_service_confirmed`. Confirmations never replace existing safety/service gates. Supplied confirmations are echoed in `inputs_used`. All existing requests remain valid, version stays `1`, and the catalog exposes these optional fields. They can also be supplied in the AI conversation's `evidence.measures`; warnings are returned within `savings` on both normal and fallback paths. No generic warning was added to every calculation or empty catalog placeholder. Excluded measures receive no new warnings.

## Financial and evidence integrity

`backend/savings/calculators.py` is unchanged, preserving all six energy equations and PR #53's financial arithmetic/attribution, Decimal precision, rounding and unknown/null behavior. Gross and net retain their existing meanings. Warnings do not affect annual kWh, energy-charge savings, recurring benefits, incremental expenses, net, payback, ROI or ordering. No savings percentage or equipment physics is inferred.

The existing `quantified` status and measured confidence string describe caller-reported evidence, not independent verification of every input. One measure-wide evidence tag cannot describe mixed measured/estimated inputs in detail. Per-input evidence classification is deferred to a separate API design; this change does not upgrade certainty or claim to solve mixed evidence. Existing assumptions continue to state that evidence is not independently audited.

## Verification

Exact focused command, from the feature worktree:

```bash
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 PYTHONDONTWRITEBYTECODE=1 \
/workspaces/GridPilot/backend/.venv/bin/python -m pytest -q -p no:cacheprovider \
backend/tests/test_savings_plausibility.py backend/tests/test_savings.py \
backend/tests/test_operating_cost_savings.py backend/tests/test_savings_advisor.py \
backend/tests/test_savings_reasoning.py backend/tests/test_savings_responsiveness.py \
backend/tests/test_eia_retail.py
git diff --check
```

Result: **182 passed**, comprising **36 new cases and 146 existing focused cases**, with one existing Starlette/httpx deprecation warning. FastAPI TestClient requires local thread/network support in this environment; restricted runs stalled, and the completed run used that support with all AI mocked. Initial new-test ROI assertions used binary-float exact expected values and failed twice; corrected to approximate the independently calculated expected ratio while retaining exact equality between before/after outputs. Final run has no failures or identified regressions. No broad optimizer audit was repeated.

New coverage includes normal office, 20,000-fixture warehouse, threshold boundaries for every power field, 5 MW industrial load, existing occupancy controls with measured inventory, motor/refrigeration comparability, missing inputs, excluded measures, empty catalog, strict confirmation types, unchanged safety/schedule gates, recurring-benefit arithmetic across all six equations, unchanged ranking, HTTP legacy compatibility/determinism and mocked advisor warning propagation.

Changed files: `models.py` adds optional confirmations and per-measure warnings; `catalog.py` exposes optional fields; `plausibility.py` holds the small deterministic advisory helper; `service.py` attaches warnings/assumptions without changing calculation or ranking; `test_savings_plausibility.py` adds focused regressions; this document provides investigation, verification and frontend handoff. No frontend files changed.

## Remaining limitations

Measurements are still needed to establish actual average avoidable load, fixture/device power, standby behavior, equipment schedules and annual consumption. Confirmation flags do not authenticate records. Detailed runtime, capacity/output, refrigeration temperatures, ambient conditions and comparable periods must come from the business. External verification of tariffs, maintenance benefits, specifications and operating records remains outside this feature. Partial load, weather and cycling simulation would require future engineering models; no adjustment factors are invented. Low-magnitude W/kW mistakes, plausible but wrong counts, contradictory free text and overstated prices/cost benefits can escape these checks. No unit-warning trigger proves input error, and absence of warnings does not certify financial outcomes.

## Fictional API examples

These are deterministic recommendation excerpts, not complete responses. Other catalog investigations and existing top-level notices still appear. Omitted rates keep financial results null; no rate is invented. All requests use the existing `POST /api/savings/recommendations` route.

### Normal office lighting: no measure warnings

Request:

```json
{
  "measures": [
    {
      "id": "fictional",
      "category": "led",
      "load_id": "lights",
      "evidence_kind": "synthetic",
      "evidence_reference": "Fictional example only",
      "fixture_count": 100,
      "old_watts": 60.0,
      "new_watts": 10.0,
      "hours_per_day": 10.0,
      "days_per_year": 250,
      "equivalent_service_confirmed": true
    }
  ]
}
```

Recommendation excerpt:

```json
{
  "id": "fictional",
  "calculation_status": "scenario_estimate",
  "annual_kwh_saved": 12500.0,
  "annual_energy_charge_savings_usd": null,
  "annual_net_savings_usd": null,
  "warnings": []
}
```

### Potential units/inventory mistake: value retained

Request:

```json
{
  "measures": [
    {
      "id": "fictional",
      "category": "led",
      "load_id": "lights",
      "evidence_kind": "synthetic",
      "evidence_reference": "Fictional example only",
      "fixture_count": 100,
      "old_watts": 5000.0,
      "new_watts": 10.0,
      "hours_per_day": 10.0,
      "days_per_year": 250,
      "equivalent_service_confirmed": true
    }
  ]
}
```

Recommendation excerpt:

```json
{
  "id": "fictional",
  "calculation_status": "scenario_estimate",
  "annual_kwh_saved": 1247500.0,
  "annual_energy_charge_savings_usd": null,
  "annual_net_savings_usd": null,
  "warnings": [
    "Plausibility: old_watts reaches a unit-review trigger (1000). Confirm watts per fixture/device, not kilowatts or the total inventory load. Large equipment can be valid; no value has been changed."
  ]
}
```

### Legitimate 5 MW industrial load: accepted with unit review

Request:

```json
{
  "measures": [
    {
      "id": "industrial",
      "category": "shutdown",
      "load_id": "industrial-load",
      "evidence_kind": "synthetic",
      "evidence_reference": "Fictional documented 5 MW aggregate avoidable load",
      "connected_load_kw": 5000.0,
      "existing_hours_per_day": 12.0,
      "avoidable_hours_per_day": 4.0,
      "days_per_year": 250,
      "safe_to_switch_off": true,
      "essential_service": false,
      "operating_baseline_confirmed": true
    }
  ]
}
```

Recommendation excerpt:

```json
{
  "id": "industrial",
  "calculation_status": "scenario_estimate",
  "annual_kwh_saved": 5000000.0,
  "annual_energy_charge_savings_usd": null,
  "annual_net_savings_usd": null,
  "warnings": [
    "Plausibility: connected_load_kw reaches a unit-review trigger (1000). Confirm aggregate avoidable load in kilowatts, not watts or unrelated facility load. Large equipment can be valid; no value has been changed."
  ]
}
```
