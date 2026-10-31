# Savings Advisor backend integration and acceptance

The deterministic Savings Engine (#48), savings conversation safeguards (#50), and low reasoning effort for category selection (#51) are on main. This is the canonical backend handoff; all financial calculators and OR-Tools mathematics are unchanged.

October 31, 2026 acceptance update: refreshed main is `89f20fb68aadf65346034bcf6fa25c7e463d2071`; both #51's merge and its implementation commit `e0e66833d215c8b08d5de31cc610c66c8f9924e6` are ancestors, and the actual call passes `reasoning_effort='low'`. The targeted responsiveness correction offloads the synchronous provider call to Starlette's worker pool, retaining one invocation, the existing 25-second SDK timeout and zero retries. It does not shorten provider latency or establish a total end-to-end request deadline; the shared worker pool remains finite. See [verification and release gates](verification/backend-responsiveness/README.md).

Offline acceptance: **747 backend tests passed**, including injected SDK responses and concurrent HTTP requests during provider success/timeout. Independent optimization verification passed 200 oracle cases, six representative and six stress cases. These are local results, not live Meta acceptance. No frontend changes, deployment, restart, production configuration changes or paid inference occurred.

Current user-supplied Render overview evidence identifies service `gridpilot-api`, branch `main`, Live commit `99268894c60e833a814e4d737dcdcd5ac9000f32` (#50). This revision lacks both #51's low reasoning effort and the proposed responsiveness correction. The agent has no independent control-plane access; deployment ID, service ID and deployment timestamp remain unknown. GitHub exposes no Render deployment record. Fresh non-AI production acceptance on that user-identified revision passed **15/15 checks**, including office/warehouse calculations, unknown financial values, EIA separation, exclusions, overlap warnings and independently verified optimizer results. See the linked verification report for timings and evidence. The prior genuine #50 request returned deterministic fallback. The user explicitly prohibits a new genuine test until the fix is confirmed Live; paid inference remains unauthorized. Frontend integration can proceed against this frozen version-1 contract now.

## Endpoint contracts

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/savings/catalog` | None | `version: "1"`, `categories`: 16 category descriptors with eligibility, evidence requirements, methods, sources and numerical support |
| `POST /api/savings/recommendations` | `SavingsRequest`: optional `profile`, `location`, `measures` (max 100) | `SavingsResponse`: `version`, nullable `benchmark`, `location_notice`, `recommendations`, `portfolio_savings_usd: null`, `warnings` |
| `POST /api/ai/savings/conversation` | Required `request` (1–2000 characters); optional `history` (max 12 user/assistant turns, 1–3000 characters each), `evidence: SavingsRequest`, `category_applicability` | `source: "meta" or "deterministic_fallback"`, `message`, `selected_categories`, `facts`, `follow_up_questions`, `savings: SavingsResponse` |

OpenAPI (`GET /openapi.json`) defines exact field types, limits, required fields and recommendation properties. The conversation requires no optimizer Scenario. Existing `/api/ai/conversation`, `/api/ai/interpret`, `/api/ai/explain`, and `/api/optimize` remain available. Use the existing exact-result conversation to discuss retained daily optimization results.

`SavingsRequest` reuses the existing optional BusinessProfile (business type, employee count, hours, bill/consumption descriptions, equipment, goals, restrictions). Location accepts full U.S. state name, ZIP, city, utility and rate-plan metadata. ZIP alone is not geocoded; utility/rate-plan text is not verified. State is needed for the historical EIA benchmark, never for calculating a customer tariff.

Measures require `id`, `category`, `load_id`, `evidence_kind`, `evidence_reference`. IDs must be unique. Evidence kinds: `user_entered`, `measured`, `synthetic`, `engineering_assumption`. Savings contracts reject unknown fields, nonfinite numbers, numeric strings and boolean-as-number values. No model-generated numbers enter measures.

## Equipment relevance

`category_applicability` is an optional map from catalog category identifiers to strict booleans. Set a category false only after the caller confirms it is inapplicable. False categories are excluded from conversation selections, facts and questions, and marked `not_applicable` in nested recommendations. This also applies on deterministic fallback. A category exclusion conflicting with a measure whose `applicable` is not false returns 422; correct/confirm the conflict instead of silently losing financial evidence.

For example, `{"scheduling": false, "refrigeration": false}` means the caller confirms no eligible flexible scheduling equipment and no refrigeration. **No EVs alone is insufficient to exclude scheduling:** confirmed non-EV flexible loads may still qualify. Do not populate false entries merely from business type. A true entry confirms caller-reported applicability only; it supplies no wattage, runtime, rate or safety evidence and cannot create calculated savings.

Unknown applicability may remain selected as an **investigation only**. Its facts and questions explicitly ask for equipment confirmation before action. Free-text statements guide Meta's selection but are not converted into authoritative inventory or measurements; collect explicit exclusions into `category_applicability` for a deterministic exclusion. Business profile and assistant history never establish measured data. If the model selects an irrelevant unknown category anyway, the response still frames it as an unconfirmed investigation, not an investment recommendation.

Caller measures remain included even if Meta omits their category. Measures with `applicable: false` remain unquantified/not applicable; a category consisting only of excluded measures is omitted from selections. One excluded load does not suppress another valid load in the same category. Valid structured calculations and provenance are preserved exactly.

## Example request and expected response

Synthetic conversation request with an explicit absence of scheduling equipment and a separately confirmed lighting scenario:

```json
{
  "request": "How can our fictional warehouse reduce electricity expenses? No EVs or flexible equipment; our tariff is unknown.",
  "category_applicability": {"scheduling": false, "led": true},
  "evidence": {
    "profile": {"business_type": "warehouse", "equipment": "conventional lighting; no EVs or flexible equipment"},
    "measures": [{
      "id": "lights", "category": "led", "load_id": "warehouse-lighting",
      "evidence_kind": "synthetic", "evidence_reference": "fictional handoff fixture",
      "fixture_count": 100, "old_watts": 60, "new_watts": 10,
      "hours_per_day": 10, "days_per_year": 250,
      "equivalent_service_confirmed": true,
      "installation_cost_usd": 2500, "annual_incremental_cost_usd": 0
    }]
  }
}
```

Response excerpt (other categories depend on provider selection):

```json
{
  "source": "meta",
  "selected_categories": ["led"],
  "facts": ["lights [scenario_estimate; unverified caller scenario]: annual energy reduction 12500.0 kWh/year; annual gross energy-charge savings unknown; annual net savings unknown; upfront cost 2500.0 USD; simple payback unknown."],
  "follow_up_questions": ["Investigation only: for LED lighting replacement (lights), provide or confirm: rate: current customer-specific flat avoidable USD/kWh energy rate?"],
  "savings": {"version": "1", "portfolio_savings_usd": null}
}
```

The excerpt omits the full message, recommendations, benchmark, notices and warnings. `savings.recommendations` contains supplied measures and catalog guidance for remaining categories; it is not a personalized recommendation list. Use `selected_categories`, applicability, calculation status and questions together, and hide `not_applicable` from recommended investments.

Adding a current fictional customer rate of .20 USD/kWh produces exactly 12,500 kWh/year, $2,500 gross/net annual energy-charge savings and one-year simple payback. The rate object requires `usd_per_kwh`, `source`, ISO `valid_from` and `valid_through`, `customer_applicability_confirmed: true`, `flat_avoidable_energy_rate_confirmed: true`. An expired/future/unconfirmed rate leaves money null. Never use a state EIA benchmark as this rate. Re-evaluate date validity when replaying fixtures.

For a non-AI form, submit the `evidence` object directly to `/api/savings/recommendations`. `category_applicability` belongs to the conversation request, not the deterministic request. Deterministic-only callers can use per-measure `applicable: false` and should treat catalog-only entries as unconfirmed investigations. Complete existing fixtures: [request](verification/savings-request.json), [response](verification/savings-response.json); calculator details: [engine guide](business-savings-engine.md).

## Missing inputs, status and financial provenance

| Calculator | Required evidence |
| --- | --- |
| LED | Fixture count, old/new watts, daily equipment runtime, annual days, equivalent-service confirmation |
| Lighting controls / shutdown | Connected kW, existing/avoidable daily hours, annual days, safe-to-switch-off true, essential-service false |
| Office | Device count, active/low-power watts, existing/avoidable daily hours, annual days and the same safety confirmations |
| Motor / refrigeration | Comparable before/after annual kWh and equivalent-service confirmation |

Customer rate enables gross monetary savings. Explicit annual incremental cost (zero only if confirmed) enables net savings. Upfront cost enables payback/ROI. Unknowns remain null, never zero. Opening hours do not automatically establish device runtime; monthly spend does not establish USD/kWh. Reuse onboarding context, then ask the caller to confirm each structured measurement, applicability, safety flag, tariff and cost.

`quantified` means complete caller-reported measured energy evidence, not an independent audit. `scenario_estimate` means a hypothetical/user-entered energy scenario. Both can still have unknown financial results. `needs_data` requests missing evidence; `not_applicable` must not be promoted as an investment. Preserve `provenance`, `inputs_used`, `confidence`, assumptions, missing information, next action and warnings.

Meta selects categories only. The server calculates numerical results with the existing deterministic engine. `facts` are formatted from those results; generated prose cannot overwrite them. Gross energy charges avoided, net annual savings and payback are separate quantities. Payback uses unrounded positive net; do not reconstruct it from cents. EIA is historical regional public data, separate from customer rates. No total portfolio savings is returned. Never sum standalone measures, even with distinct IDs; shared load IDs trigger overlap warnings. LED and controls on the same fixtures require combined modeling before claiming a total.

Solar, HVAC, envelope, demand charges, full alternative tariff comparisons and compressed air remain unquantified investigations. Scheduling reuses the existing validated Scenario/optimizer API and hourly customer prices. It does not create annual savings here. No new financial modules or provider integrations are included.

## Provider failures and errors

`source: meta` establishes genuine provider category selection, not model-generated financial advice. `source: deterministic_fallback` means provider/configuration/output failure; the message explicitly begins “Meta unavailable; using deterministic guidance.” Show this prominently. A 200 response alone does not prove genuine Meta success. Valid structured calculations remain available on fallback; provider details are not exposed. No automatic inference retries occur.

Local mock mode previously attempted to construct CategorySelection from a Proposal fixture and raised an uncaught validation error (HTTP 500 on `/api/ai/savings/conversation`). The adapter now rejects conversational CategorySelection in mock mode with the existing 503 unavailable error, which this endpoint converts into labeled deterministic fallback. Render rejects mock mode earlier in configuration validation and follows the same fallback contract; no mock result is presented as Meta. Only the existing HTTPException boundary is caught, not arbitrary application exceptions.

HTTP 422: display field errors, preserve inputs and request correction. Network/5xx: retain form state and show service unavailable. EIA failure may remove a benchmark while valid equipment calculations continue. Retry calculations through the non-AI endpoint; avoid automatic paid AI retries.

## Post-merge production acceptance (requires approval)

1. After approved merge/deployment, read Render's actual **Live** deployment SHA, repository/branch and timestamps. Confirm the serving commit contains both engine and conversation changes; frontend preview success and a configured branch are insufficient.
2. Inspect existing sanitized provider diagnostics and production configuration without triggering probes. Confirm intended live mode, endpoint/model, credential presence and installed versions. Read `MODEL_API_DIAGNOSTIC_ON_STARTUP` before deployment: setting it to 1 invokes an existing inference probe. Do not enable it or change provider settings without approval.
3. Non-AI HTTP checks: health, 16-category catalog and public OpenAPI. POST the fictional LED evidence above with an effective fictional rate: expect 12,500 kWh, $2,500 gross/net and one-year payback. Remove rate: money/payback null; benchmark cannot substitute. Remove runtime/wattage: dependent energy/money null. Invalid/nonfinite inputs must return 422.
4. Replay representative feasible/infeasible original `/api/optimize` requests and independently verify costs/constraints. Compare public contracts to the handoff/OpenAPI.
5. Only with separate explicit authorization, send **one** POST `/api/ai/savings/conversation` using [the prepared fictional warehouse request](verification/meta-savings-acceptance-request.json). No automatic retries. This request has no EV/flexible equipment, no customer rate, partly unknown main lighting and a known separate pilot measure. Expect no scheduling selection, exactly **2,000 kWh/year** for the pilot, unknown main-lighting kWh, null money/payback for both, and missing-data questions. Profile opening hours must not fill unknown device runtime.
6. Require `source: meta`; fallback is a failed genuine-provider acceptance check, even if calculations are correct. Reject invented financial numbers, inferred measurements or unsupported HVAC/solar estimates. Record serving SHA and sanitized request/result evidence. This new post-#51 request has **not** been executed; the earlier #50 attempt returned fallback. Require useful questions for unknown main-lighting watts/runtime, customer rate and project costs. Preserve the exact deterministic pilot result, exclude scheduling/refrigeration/compressed air, and never treat opening hours as measured equipment runtime.
7. On failure, stop without retrying. Retrieve the existing sanitized `Meta API failure` and/or `Meta completion rejected` log record for that request/time from Render. Record only status, exception type, bounded provider code/type/param/request ID, schema, finish reason, completion/reasoning-token counts and configured effort as available. Do not copy credentials, raw provider bodies, prompts or exception messages. If control-plane logs are unavailable, request the sanitized record and leave the exact provider cause unresolved; a fallback HTTP 200 alone cannot identify it.

The backend remains subject to caller evidence quality. Free-text relevance cannot be guaranteed without confirmed applicability; frontend collection/display must honor the rules above. Render serving revision and genuine production Meta acceptance remain pending. No merge or deployment is authorized by this document.
