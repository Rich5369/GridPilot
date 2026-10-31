# Business savings engine v1 — backend review and integration

Base: latest fetched `origin/main`, **6f4337acc9ffbdfacb23f3b5dfbdede37e0283e1**. Original checkout was **b1faf40a93c06bea9a191f270d976b4499b56c23** with unrelated diagnostic/UI work. Implementation lives on `feature/business-savings-engine` in an isolated worktree. No original checkout edits were moved or overwritten. No merge, deployment, production setting changes, new dependencies or paid inference.

## Architecture findings and prior work

Reviewed merged PRs #35 (dated EIA commercial map), #39 (structured infeasibility), #40 (exact-result grounded advisor), #42 (completion budget), #43 (independent numerical audit), #46 (employee evidence certainty), and latest #47 (frontend-only business analysis). No open PRs were returned at inspection. Latest #47 introduces no new backend savings engine.

Existing `backend/models/contracts.py` supplies forbidden-extra contracts, finite energy units, strict interval bounds and optimizer response conventions. `backend/api/validation.py` safely serializes nonfinite validation errors as 422. New contracts reuse these and add strict input types. No validation was weakened.

`BusinessProfile` in `backend/ai/advisor.py` is reused unchanged. It contains free-text business type, operating hours, bill/consumption descriptions, equipment and restrictions, but no structured geography or validated equipment measurements. New geographic fields and calculation evidence are additive. Free text is never silently converted into watts, hours, rates or eligibility facts. Category applicability is explicitly caller confirmed/excluded or possible; complete equipment evidence confirms calculable applicability. Business type alone cannot establish equipment ownership. Default responses cover ordinary commercial businesses without requiring EVs.

Existing `backend/eia/retail.py` provides a six-hour cache, bounded refresh, parsed Commercial Table 5.6.A data, dated saved release and delayed status after 62 days. It is reused unchanged. This release deliberately uses that existing EIA publication adapter, **not a newly implemented `electricity/retail-sales` API adapter**. The API reference is https://www.eia.gov/opendata/documentation.php; COM is the commercial sector in that API. Both sources describe historical benchmarks, not customer marginal tariffs.

Optimizer daily energy cost remains `sum(hourly average kW * 1 hour * hourly USD/kWh)`. Conditional simulator demand charges remain separate. No changes to OR-Tools, simulator, optimization cost/objective, numerical tolerances, execution IDs, advisor grounding, business-context extraction or Meta request settings. Savings endpoints never call Meta. Existing advisor does not yet consume the new endpoint, so its exact-execution guarantee is preserved.

## Files and API

- `backend/main.py`: registers the additive savings router.
- `backend/savings/__init__.py`, `models.py`, `catalog.py`, `calculators.py`, `service.py`, `routes.py`: strict evidence contracts, 16-category catalog, arithmetic, evidence gates, ranking and API.
- `backend/tests/test_savings.py`: equations, safety, units, invalid data, contract and fallback tests.
- This document and `docs/verification/savings-{request,response}.json`: teammate handoff and complete synthetic examples.
- `docs/verification/savings-optimizer-audit.json`: existing independent numerical audit output for the final implementation before documentation finalization; captures source hashes and dirty-tree status.

`GET /api/savings/catalog` returns `version: "1"` and 16 categories with eligibility, business types, required/optional inputs, method, source, evidence quality, complexity and whether v1 supports numerical savings. `POST /api/savings/recommendations` returns the v1 response. OpenAPI includes the exact schemas. Existing paths and contracts remain intact.

Request top-level fields: optional existing `profile`, optional `location`, and up to 100 `measures`. All new models reject unknown fields, boolean-as-number inputs, strings-as-number inputs and NaN/Infinity. IDs must be unique. ZIPs are strings so leading zeroes survive. State must be one of the 50 full state names or `District of Columbia`; abbreviations fail validation. ZIP is syntax checked only; city, ZIP/state correspondence, utility and rate plan are not externally verified. No exact address, utility, tariff, coordinates or climate is inferred. ZIP alone returns no benchmark. Coordinate input is intentionally deferred until a validation/source workflow exists.

Each measure includes `id`, `category`, `load_id`, `evidence_kind`, `evidence_reference`. Evidence kinds: `user_entered`, `measured`, `synthetic`, `engineering_assumption`. Measured evidence is caller reported, never represented as externally audited. `applicable: false` returns `not_applicable`; omitted eligibility remains possible unless complete usable evidence establishes it.

A rate contains `usd_per_kwh`, source reference, ISO `valid_from`/`valid_through`, `customer_applicability_confirmed`, `flat_avoidable_energy_rate_confirmed`. Both confirmations must be true and the rate must be effective on the calculation date. Expired/future/unconfirmed rates leave money unknown while valid kWh can still be returned. Zero is a valid rate. Complex TOU/tiered tariffs cannot be collapsed into an unverified flat rate. Annual projections explicitly hold the supplied schedule and current rate constant; they do not promise future prices. Actual tiered, seasonal, demand and minimum-charge modeling is deferred.

`annual_incremental_cost_usd` must be explicitly provided, even as zero, to calculate annual net savings. Missing capex leaves payback/ROI null. Provided installation cost is net upfront cost; no incentives, tax benefits or maintenance costs are assumed.

## Functional calculations

| Category | Energy equation (annual kWh) | Gates |
|---|---|---|
| `led` | count × (old W − new W) / 1000 × hours/day × days/year | Equivalent lighting/service confirmation; positive existing/replacement watts; replacement cannot exceed existing watts |
| `lighting_controls` | connected kW × avoidable hours/day × days/year | Existing schedule, avoidable hours no greater than existing, safe control and nonessential-service confirmation |
| `shutdown` | connected kW × avoidable hours/day × days/year | Same schedule and safety gates; no critical refrigeration, security, ventilation or safety equipment |
| `office` | devices × (active W − low-power W) / 1000 × avoidable hours/day × days/year | Same safety and schedule gates, active watts positive, low-power watts no greater than active |
| `motor` | documented before annual kWh − after annual kWh | Equivalent useful work, loading, service and annual conditions confirmed; no nameplate-only consumption inference |
| `refrigeration` | documented before annual kWh − after annual kWh | Equivalent capacity, temperature, service and annual conditions confirmed; not a shutdown recommendation |

Annual hours are bounded by 24 hours/day and 366 days/year. Before/after values must cover equivalent annual service, not arbitrary unequal months. Inputs such as measurements and equivalent-service attestations require caller review; the endpoint does not authenticate bills or equipment specifications.

Gross energy-charge savings = saved kWh × eligible customer USD/kWh. Net annual savings = gross − explicit annual incremental cost. Simple payback = upfront/net only for positive net benefit. Annual simple ROI = net/upfront × 100 only for positive upfront cost; this is not discounted lifetime ROI/IRR. Decimal arithmetic uses submitted decimal representations. USD outputs round once to cents with ROUND_HALF_UP; payback/ROI use unrounded intermediate values. Energy and rates retain their precision. Zero or negative benefits remain visible, with payback null for nonpositive net savings. A zero upfront investment and positive net benefit has zero payback and undefined ROI.

Measured evidence produces `quantified` after energy requirements pass. Other evidence produces `scenario_estimate`. These statuses describe the available energy result; money can still be null. Incomplete input returns `needs_data` and explicit missing information. Unknown values are null, not zero. `inputs_used` includes the applicable category evidence and financial metadata, rather than unrelated optional measurement fields. `provenance` retains kind/reference/load/rate source; `assumptions`, `calculation_method`, sources, next action and priority reason are server owned.

## Investigation categories and dependencies

All 16 catalog categories are supported, but v1 numerical savings are limited to the six above. The remaining categories intentionally request evidence:

- `benchmark`: state and actual bill context. Regional cost difference is not attainable savings.
- `tariff_comparison`: current and alternative verified, effective, eligible tariffs; interval kWh/demand; full fixed, minimum, seasonal, TOU and ratchet rules.
- `demand`: billing-interval demand and actual applicable tariff. Hourly peaks cannot establish 15-minute billing demand.
- `solar`: validated site/roof, capacity/orientation/losses, modeled generation, consumption profile, tariff/export compensation, capex and O&M. No retail net-metering, tax benefit or demand-charge elimination assumed.
- `hvac_setpoints`, `hvac_schedule`, `hvac_maintenance`, `envelope`: occupancy, HVAC/equipment information and audit/measurement or validated engineering model. Comfort, ventilation, humidity, inventory/process temperature, moisture and freeze protection take precedence. No universal thermostat savings percentage.
- `compressed_air`: measured leak flow, compressor performance, runtime and process constraints.
- `scheduling`: existing `POST /api/optimize` with validated Scenario and caller-provided hourly rates. Reuse that endpoint; savings recommendations do not rerun, recreate or annualize the solver. Its result is daily energy-charge savings, not annual electricity reduction or a complete bill.

OpenEI API documentation (https://apps.openei.org/services/doc/rest/util_rates/) was inspected: it requires an API key and exposes utility/rate identity, applicability and structures. Database presence does not verify current customer eligibility. No credential search, new credential configuration or URDB runtime adapter was added. Full verified tariff/demand modeling belongs in the second PR.

Official PVWatts V8 documentation (https://developer.nlr.gov/docs/solar/pvwatts/v8/) was inspected: it requires an API key and system/site parameters. It models production, not customer financial benefits. Integration, bounded error handling/rate limits and financial modeling are deferred together to the second PR; no unavailable provider can block v1 calculations. Tests establish absence of advanced provider calls, rather than claiming coverage of an adapter that does not exist.

NOAA climate normals (https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals) were inspected as a future authoritative degree-day source. Station/geographic matching, provenance and validated weather ingestion are not implemented in v1. State or ZIP alone does not generate a climate or building savings claim. HVAC remains useful audit guidance. Category links to DOE/FEMP are further assessment references, not the provenance of invented percentages.

Benchmark response includes state, COM sector, USD/kWh, reporting period, source URL, original source check/release date and upstream freshness. Cents/kWh converts by dividing by 100. `available` means a fetched release, `saved` means refresh failure with retained dates, `delayed` means release age over 62 days. Reporting-month lag remains explicit. Missing observations and complete EIA/snapshot failure leave price null/benchmark unavailable while calculators continue. The benchmark is never passed to calculators.

## Ranking and overlapping measures

Ordinal groups are financial, energy-only, investigation, not-applicable. Positive net financial opportunities rank by measured evidence before scenarios, then descending annual net savings, then payback and stable ID ties. Confidence and financial benefit are defensible; no invented composite score is used. Complexity is visible in the catalog and category-specific safety/eligibility gates apply before calculation. V1 does not claim to optimize investments under operational risk or capital constraints. Unquantified high-potential opportunities stay in investigation with the required evidence.

Every response withholds portfolio savings (`portfolio_savings_usd: null`). Measures sharing a `load_id` receive an overlap warning. Treat LED and occupancy estimates as standalone alternatives against the supplied baseline. To model their combination later, controls must use the post-LED load and documented sequence. Different load IDs are caller assertions, not proof of independence; never sum automatically. No combined-benefit capability is claimed in v1.

## Frontend integration and synthetic examples

Use the existing backend base URL and submit JSON; frontend edits are intentionally excluded. See complete [request](verification/savings-request.json) and [response](verification/savings-response.json). The response was generated offline with the existing EIA snapshot on 2026-10-30; it is a synthetic integration fixture, not a live customer claim. Dates/rate attestations are part of that fictional scenario. The live API will reject stale financial evidence by leaving money null after expiration.

```json
{
  "location": {"state": "California"},
  "measures": [{
    "id": "lighting-1", "category": "led", "load_id": "main-lighting",
    "evidence_kind": "synthetic", "evidence_reference": "Fictional integration example",
    "fixture_count": 100, "old_watts": 60, "new_watts": 10,
    "hours_per_day": 10, "days_per_year": 250,
    "equivalent_service_confirmed": true,
    "installation_cost_usd": 2500, "annual_incremental_cost_usd": 0
  }]
}
```

That request reports **12,500 kWh**, null financial savings/payback and a request for the customer rate. Adding the fictional .20 USD/kWh rate shown in the complete fixture yields **$2,500/year**, **1-year payback**, **100% annual simple ROI**, labeled `scenario_estimate`. Benchmark is separate.

Render null as unknown and surface `missing_information`/`next_action`. Keep scenario/measured/public provenance visible. Show benchmark period and original retrieval date. Display positive financial opportunities separately from investigations. Never hide safety requirements, imply solar/HVAC estimates exist, present gross energy savings as net benefit, or sum standalone estimates. A response includes multiple recommendations of the same category when multiple equipment measures are submitted, and one guidance recommendation for each unsubmitted category. HTTP malformed input is 422 using the existing handler; no paid AI is needed.

## Verification

Manual expected values (synthetic; independently expanded in tests):

- LED: 100 × 50 W / 1000 × 10 h/day × 250 days = 12,500 kWh. At .20 USD/kWh, $2,500 gross/net with explicitly zero annual cost; $2,500 / $2,500 = 1 year.
- Shutdown: 2 kW × 4 h/day × 250 days = 2,000 kWh; $400 at .20.
- Controls: 5 kW × 2 h/day × 250 days = 2,500 kWh; $500 at .20.
- Office: 20 × 95 W / 1000 × 8 h/day × 250 days = 3,800 kWh; $760 at .20.
- Motor: 5,000 − 4,000 = 1,000 kWh; $200 at .20.
- Refrigeration: 1,500 − 900 = 600 kWh; $120 at .20. A reversed 100→200 comparison retains −100 kWh and −$20, with no positive-benefit claim.
- Precision: 1 kWh × .005 USD/kWh = .005 raw USD, displayed .01; $1/.005 = 200 years using unrounded arithmetic.

Commands from this branch, using the existing shared environment:

```bash
MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests -q
/workspaces/GridPilot/backend/.venv/bin/python scripts/audit_backend_accuracy.py --output /tmp/gridpilot-savings-audit.json
/workspaces/GridPilot/backend/.venv/bin/python -m compileall -q backend/savings backend/tests/test_savings.py
git diff --check
```

The final full regression passed **710 tests** in 15.34 seconds, including **56 savings tests**, with one pre-existing Starlette/httpx deprecation warning. Compilation and `git diff --check` passed. The independent audit passed **200 exact rational oracle cases: 96 feasible, 104 infeasible**, plus six representative and six stress cases. No HTTP audit mode was requested; contract tests exercise the application via TestClient. No production or live Meta acceptance is claimed. A restricted TestClient run stalled; successful complete runs used local thread/network support with startup diagnostics disabled.

Coverage includes six functional equations, cents-to-dollars, null consumption/rates/costs, invalid/nonfinite/location fields, expired/future/unconfirmed rates, EIA saved/complete failure, safety, scenario provenance, equal alternatives, negative/zero savings, overlap protection, advanced-source independence, catalog and HTTP/OpenAPI contracts. Existing backend and numerical regressions protect optimizer compatibility. Deferred demand, tariff and solar algorithms are not presented as implemented/tested. No test uses paid Meta calls or provider credentials.
