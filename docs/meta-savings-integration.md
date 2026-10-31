# Savings Advisor backend handoff

## Release assessment

PR #48 was OPEN at review on October 30, 2026 (America/New_York), head `67537a0`. Latest fetched main was `6f4337a`. Reported checks: Vercel Preview Comments, gridpilot preview, and gridpilot-frontend preview all successful. No backend CI check was reported. Recommendation: merge only after reviewing the offline backend and independent numerical validation and accepting the limitations below. Do not treat preview success as backend production acceptance.

Reviewed all savings contracts, six calculator branches, evidence/rate/safety gates, ranking, catalog, API registration and hand-checked tests. Decimal calculations retain unrounded net for payback; money is rounded to cents for presentation. Missing rate, annual incremental expense, or upfront expense correctly leaves the dependent values null. Negative savings remain negative; nonpositive net has no payback. No blocking arithmetic defect identified within the supported standalone models.

Review caveats: overlap warnings only detect shared caller-supplied load IDs. Different IDs do not establish independence, especially for LED replacements and lighting controls on the same fixtures. All estimates remain standalone, and portfolio total stays null. Very small positive net can round to zero cents while payback uses positive unrounded net; do not reconstruct payback from displayed cents. Caller-attested measured evidence can be labeled quantified, but is never independently audited. Six calculator categories are supported; solar, HVAC, demand tariffs and other catalog entries remain investigations.

PR #48 is unmerged, so approved-deployment acceptance is pending. Render serving revision has not been verified. No deployment/restart or production acceptance claim is made. After an approved merge/deployment, inspect the Render deployment commit against the merge SHA, then check catalog, the synthetic recommendations fixture, missing-rate/cost variants, and original optimizer HTTP endpoints. Do not infer serving revision from frontend preview status. No paid inference was performed.

## Additive Advisor endpoint

`POST /api/ai/savings/conversation` accepts:

- `request`: required user text, 1–2000 characters.
- `history`: optional, up to 12 existing user/assistant turns (each 1–3000 characters).
- `evidence`: optional existing `SavingsRequest`: `profile`, `location`, and up to 100 `measures`.

Existing `/api/ai/conversation`, `/api/ai/interpret`, `/api/ai/explain`, and optimizer paths are unchanged. Use the savings conversation endpoint for business opportunities without requiring an optimizer Scenario. Continue to use the existing exact-result conversation for scheduling outcomes; never turn standalone annual estimates into explanations of a retained daily execution.

Meta receives the question, history, profile and catalog, and returns only validated category identifiers. Category selection is a possible investigation, not equipment ownership or confirmed applicability. Caller measures are always included even if Meta omits their category. It cannot submit numeric inputs, change evidence, write financial prose, or supply results. Validated measures feed the existing engine directly, once per request. Provider/configuration/invalid-output HTTP errors fall back to caller measures or a labeled starting list; no retry or inference result is fabricated. Existing Meta configuration is reused unchanged.

No free-text quantities are automatically extracted. A conversational answer such as “we have lamps running all day” must be collected/confirmed in structured fields before calculation. This deliberate boundary avoids invented inputs and assistant-history laundering. The existing Advisor business-profile extraction and quote safeguards remain unchanged; callers can reuse that returned profile here.

Example request (synthetic):

```json
{
  "request": "How could our office reduce electricity costs?",
  "evidence": {
    "profile": {"business_type": "office", "equipment": "lighting"},
    "measures": [{
      "id": "lights", "category": "led", "load_id": "office-lighting",
      "evidence_kind": "synthetic", "evidence_reference": "fictional handoff fixture",
      "fixture_count": 100, "old_watts": 60, "new_watts": 10,
      "hours_per_day": 10, "days_per_year": 250,
      "equivalent_service_confirmed": true,
      "installation_cost_usd": 2500, "annual_incremental_cost_usd": 0
    }]
  }
}
```

Response shape (excerpt; selected categories depend on Meta, explicit measures are always included):

```json
{
  "source": "meta",
  "selected_categories": ["led"],
  "facts": ["lights [scenario_estimate; unverified caller scenario]: annual energy reduction 12500.0 kWh/year; annual gross energy-charge savings unknown; annual net savings unknown; upfront cost 2500.0 USD; simple payback unknown."],
  "follow_up_questions": ["For LED lighting replacement (lights), can you provide or confirm: rate: current customer-specific flat avoidable USD/kWh energy rate?"],
  "savings": {
    "version": "1",
    "portfolio_savings_usd": null,
    "recommendations": []
  }
}
```

The excerpt omits `message` and the full recommendations, benchmark, notices and warnings for brevity. Actual `savings.recommendations` includes the supplied measure and guidance for every other category. `selected_categories` identifies which are relevant to the conversation; `facts` and questions cover those categories. `source: deterministic_fallback` means Meta was unavailable; calculations still come from the same deterministic engine.

Add a customer-attested rate with `usd_per_kwh`, `source`, ISO `valid_from` and `valid_through`, and both `customer_applicability_confirmed` and `flat_avoidable_energy_rate_confirmed` true. If current, a synthetic 0.20 USD/kWh rate gives 2500 USD/year gross, 2500 net, 1 year simple payback. If not effective today or confirmations are absent, monetary values stay unknown. Actual rate evidence must come from the customer tariff; never copy the EIA state average.

## Existing savings API and onboarding reuse

`GET /api/savings/catalog`: version and 16 category descriptors with required/optional inputs, supported models and sources.

`POST /api/savings/recommendations`: accepts the `evidence` object above directly, without Meta. Use this route for calculation forms and retries that should not invoke paid inference. See [complete existing request](verification/savings-request.json), [complete response](verification/savings-response.json), and [engine contract guide](business-savings-engine.md). OpenAPI is authoritative for field types and bounds. Invalid structured input returns 422; correct the fields and resubmit. An unknown benchmark is independent of valid equipment calculations.

Reuse the existing business type, employees, operating-hours description, bill/consumption descriptions, equipment, goals and restrictions as unverified profile context. Do not convert free-text business hours into device runtime, monthly spend into tariff, or optimizer demo equipment into business inventory. Existing profile fields cannot establish structured measurements. Location is separate: full U.S. state name for EIA; ZIP syntax alone is insufficient.

Each measure requires `id`, `category`, `load_id`, `evidence_kind` and `evidence_reference`. Ask for:

| Calculator | Additional evidence |
| --- | --- |
| LED | Fixture count, old/new watts, daily hours, annual days, equivalent service confirmation |
| Lighting controls / shutdown | Connected kW, existing and avoidable daily hours, annual days, safe-to-switch-off true, essential-service false |
| Office | Device count, active/low-power watts, existing and avoidable daily hours, annual days, same safety confirmations |
| Motor / refrigeration | Before/after annual kWh and equivalent service confirmation |

All financial models additionally need a current applicable flat avoidable customer energy rate, explicit annual incremental cost (zero only when asserted), and upfront cost for payback. Ask investigation-specific questions from `missing_information` for unsupported categories; those fields are guidance, not additional accepted Measure properties.

## Display and next actions

Render null as “Unknown — more information needed”, never zero. Display annual kWh, gross energy charges avoided, net annual savings and simple payback separately. Keep original response numbers; do not let generated prose rewrite them. Show `calculation_status`, `confidence`, `provenance`, `assumptions`, `missing_information`, `next_action`, and warnings. `quantified` means caller-reported measured inputs; `scenario_estimate` means a hypothetical/user-entered estimate. Neither guarantees actual future savings. `needs_data` and unsupported solar/HVAC models belong in investigations. `not_applicable` must not be displayed as a recommended investment.

Surface historical benchmark period, source, freshness and notice separately from customer tariff. Ask whether LED and controls concern the same fixtures and use the same load ID when they do. Even different load IDs never authorize automatic summation. Use the safety questions before suggesting switching anything off. Present next actions as validating evidence, collecting bills/runtime data, or seeking an appropriate professional assessment.

This endpoint is additive: the teammate must wire it into the frontend conversation flow. No frontend integration or paid live Meta acceptance is claimed by this backend change.

## Validation for this integration

Offline full backend regression: **720 passed** (one existing Starlette/httpx deprecation warning), including ten new integration cases. Independent optimizer audit: **200 exact rational oracle cases** (96 feasible, 104 infeasible), six representative and six stress cases, all passed. No production HTTP or paid Meta calls. Python compilation and whitespace checks passed. Audit artifact: `/tmp/gridpilot-meta-savings-audit.json` in the review workspace; it is not a production result.
