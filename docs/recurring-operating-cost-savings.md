# Documented recurring operating-cost savings

Implemented from verified main `64d761cca501409252ae4c2b1d95256eb2442a50` (PR #52), after reviewing the merged savings engine and advisor PRs #48–#52. This is an additive backend change on `feature/documented-operating-cost-savings`. No frontend, optimizer, energy equations, Meta prompts, dependencies or external providers change. No paid inference, merge or deployment is part of this work.

## Financial contract

Each existing `Measure` optionally accepts:

| Field | Meaning |
| --- | --- |
| `annual_operating_cost_savings_usd` | Nonnegative finite annual recurring **non-energy** expense reduction, using the existing financial input upper bound of $1e12/year. Omitted/null means not included, not zero actual benefit. Explicit zero is accepted. |
| `operating_cost_savings_reference` | Caller-provided source and basis, 1–500 characters, not whitespace-only. Required for every positive benefit; existing general `evidence_reference` does not substitute for this financial attribution. |

Examples include reduced lamp replacements, servicing or maintenance costs. The source should identify comparable before/after annual costs and any assumptions. A customer estimate is allowed but is not independently verified. Neither business type nor AI output supplies a benefit.

Exclude electricity energy-charge savings already calculated by GridPilot, demand-charge savings, one-time rebates/incentives, and any benefit counted elsewhere. Do not net the same reduction into `annual_incremental_cost_usd` and also submit it as operating-cost savings. The API validates amount and reference presence, not the truth/content of the evidence; the caller must confirm classification and independence.

The six existing energy equations remain unchanged. Once their evidence gates and a current applicable flat energy rate pass:

```text
gross = annual_kwh_saved * customer_usd_per_kwh
net = gross + supplied_annual_operating_cost_savings - explicit_annual_incremental_cost
payback = upfront / net                 when net > 0 and upfront is known
annual_simple_roi_percent = net / upfront * 100    when upfront > 0
```

An omitted benefit is excluded from the estimate without blocking the previous calculation. Unknown incremental expenses are **never** assumed zero: net, payback and ROI remain null. Unknown/ineligible rates also leave gross/net/payback/ROI null even when a recurring benefit is supplied. This does not create a standalone non-energy calculator. Missing upfront cost leaves net available but payback/ROI unknown. Nonpositive net has no payback; negative ROI remains visible for positive upfront cost. Positive net with zero upfront cost retains zero payback and null ROI.

All additions and ratios use unrounded Decimal intermediates; monetary response amounts round half-up to cents. Rounded components need not sum exactly to the rounded total. Payback/ROI must not be reconstructed from rounded displayed dollars.

## Optional frontend integration

Existing payloads remain valid on all three routes:

- `GET /api/savings/catalog`: same 16 categories/version; optional-input lists include the two fields.
- `POST /api/savings/recommendations`: add the fields inside any applicable existing measure.
- `POST /api/ai/savings/conversation`: use the same measure inside `evidence.measures`; Meta still selects category IDs only.

Do not default an unanswered recurring-benefit field to zero. Positive amounts need a source input; display HTTP 422 validation errors without discarding form state. Values are annual and recurring; do not offer one-time incentives under this label.

Complete **fictional** acceptance request:

```json
{
  "measures": [{
    "id": "fictional-led", "category": "led", "load_id": "fictional-lighting",
    "evidence_kind": "synthetic", "evidence_reference": "Fictional financial acceptance example",
    "fixture_count": 100, "old_watts": 60, "new_watts": 10,
    "hours_per_day": 10, "days_per_year": 250,
    "equivalent_service_confirmed": true,
    "rate": {
      "usd_per_kwh": 0.20, "source": "Fictional confirmed flat energy rate",
      "valid_from": "2026-01-01", "valid_through": "2026-12-31",
      "customer_applicability_confirmed": true,
      "flat_avoidable_energy_rate_confirmed": true
    },
    "annual_operating_cost_savings_usd": 300,
    "operating_cost_savings_reference": "Fictional customer maintenance estimate: $400/year before, $100/year after; excludes energy and incentives",
    "annual_incremental_cost_usd": 100,
    "installation_cost_usd": 2700
  }]
}
```

The rate dates are part of the fictional scenario; replay with a calculation date in that range or supply a current documented rate.

Recommendation excerpt:

```json
{
  "annual_kwh_saved": 12500.0,
  "annual_energy_charge_savings_usd": 2500.0,
  "annual_operating_cost_savings_usd": 300.0,
  "annual_net_savings_usd": 2700.0,
  "upfront_cost_usd": 2700.0,
  "simple_payback_years": 1.0,
  "annual_simple_roi_percent": 100.0
}
```

Hand check: 100 × (60−10)/1000 × 10 × 250 = 12,500 kWh; × $0.20 = $2,500 gross. $2,500 + $300 − $100 = $2,700 net. $2,700/$2,700 = one year; $2,700/$2,700 × 100 = 100% simple annual ROI.

The additive response `annual_operating_cost_savings_usd` echoes the supplied benefit rounded to cents after category energy eligibility passes, even if rate or expense data is missing. It does **not** establish complete net savings. It stays null for omitted benefits, excluded measures, missing energy evidence and unsupported categories. Explicit zero remains zero for an eligible calculation.

`inputs_used` preserves the supplied unrounded amount, its reference and incremental expenses. `provenance.operating_cost_savings_reference` preserves the source separately from equipment evidence. Assumptions and calculation-method text describe inclusion/exclusion, caller attribution and the net formula. The existing `quantified`/`scenario_estimate` status still describes energy evidence, not independent verification of maintenance benefits. Advisor facts show the additional benefit/source and incremental expenses on both normal and fallback paths.

The response `annual_net_savings_usd` remains annual recurring net benefit; it now explicitly includes documented non-energy benefits when supplied. Gross energy-charge savings and annual kWh retain their original meanings. Clients that want to show only electricity savings must use the gross energy-charge field rather than relabeling net savings as electricity savings. Existing clients accepting additive response fields continue to work; exact prose/snapshot consumers need to allow the explanatory additions.

## Verification and remaining limits

Focused offline regression commands (startup inference disabled):

```bash
PYTHONDONTWRITEBYTECODE=1 MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 \
  /workspaces/GridPilot/backend/.venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_operating_cost_savings.py backend/tests/test_savings.py \
  backend/tests/test_savings_advisor.py backend/tests/test_savings_reasoning.py \
  backend/tests/test_savings_responsiveness.py backend/tests/test_eia_retail.py
git diff --check
```

Coverage includes the hand-checked acceptance example, all six unchanged kWh equations, omitted/null/zero benefits, unknown rates and expenses, invalid/nonfinite amounts, missing/blank evidence, negative net, zero upfront cost, rounding, HTTP/OpenAPI compatibility, caller provenance, AI schema rejection, fallback, EIA separation and overlap protection.

Review result: **146 passed in 3.09 seconds**, including **40 recurring-benefit cases** and 106 existing focused checks. This reruns the original 145 cases and adds the mocked successful-Meta path, confirming identical deterministic results for legacy and recurring-benefit requests on both successful-selection and fallback paths. No production-code defect was found during review. GitHub main remained `64d761cca501409252ae4c2b1d95256eb2442a50`, identical to the original base, so there were no intervening main changes to reconcile. One existing Starlette/httpx test-client deprecation warning occurred. `git diff --check` passed. A separate exact `Fraction` calculation confirmed the actual backend outputs: 12,500 kWh, $2,500 gross, $300 recurring benefit, $2,700 net, $2,700 upfront, one-year payback and 100% annual simple ROI. No full-system optimizer audit was repeated.

The implementation does not authenticate maintenance records, infer future maintenance, model equipment life, escalate costs, discount cash flows, calculate incentives, or support new tariffs/demand savings. Existing standalone overlap warnings and null portfolio totals remain. No production acceptance or deployment is claimed.
