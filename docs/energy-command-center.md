# Energy Command Center redesign

## Scope and audit

Implemented on `feature/energy-command-center`, based on fetched `origin/main` at
`1390af2` (PR #33, conversational advisor). GitHub reported no open PRs at audit.
The original `/workspaces/GridPilot` checkout has unrelated uncommitted Meta
diagnostics, frontend CSS and ignore-file changes. These were left untouched.
Because its Git metadata is read-only in this session, development used an
independent local clone in `/tmp/gridpilot-command-center` rather than altering
that checkout or its registered worktrees.

Advisor polish `ca0b207` exists locally on `feature/energy-advisor-ui-polish` and
was not an ancestor of latest main. Its previous `/tmp` worktree was prunable.
The commit was cherry-picked intact before the redesign. This PR therefore
includes that previously unmerged work and its evidence. No backend files,
Meta configuration, credentials, solver calculations or scenario schemas changed.

Reviewed R1/R1.1 workflow and submitted-snapshot handling, R2 deterministic
insights, aggregate Recharts and the conversational advisor. E1 device schedules
exist in engineering work, but are absent from the integrated frontend
`OptimizationResult` and current HTTP route. No device timeline is inferred.

## Design and architecture

- Retains the existing navigation state and every functional destination. Adds
  Electricity markets, with no accounts, fictional sites or search.
- Shared deep navy surfaces, slate borders, emerald actions and restrained
  blue/purple/amber data colors. Explicit dark controls irrespective of OS theme.
- Four submitted-result cards sit above the map and integrated advisor. Empty
  cards show em dashes; infeasible outcomes never receive invented optimized values.
- Sidebar and compact topbar identify a single-day scenario workspace. Backend
  connectivity is separate from advisor reply provenance and market availability.
- Advisor remains a single mounted component across destinations, preserving
  multi-turn state, business-profile editing and Apply/Compare. Native disclosure
  collapses it; at <=1150px it stacks below the main workspace. Full advisor
  destination retains all suggested questions; overview shows two to reduce noise.
- Market explorer is a self-contained static component. Network requests are not
  made from rendering. No runtime map library or application dependency was added.
- Uses step-after demand and tariff profiles because each value is a full hourly
  interval. No smoothing invents intermediate observations. Baseline uses slate
  dashes, optimized emerald, fixed building demand blue, power cap amber.
- Tariff and demand provide native hourly-table alternatives. Cost chart repeats
  backend monetary totals in text. Map buttons provide a non-map alternative.
  Decorative sparklines explicitly disable the Recharts accessibility layer.

### Data contracts

`Scenario` and `OptimizationResult` remain in `frontend/src/types/api.ts`.
`resultScenario` is captured from submitted inputs, never the current draft.

| Display | Contract / calculation | Units and interpretation |
| --- | --- | --- |
| Modeled daily energy cost | `optimized_electricity_cost_usd`; baseline context from `baseline_electricity_cost_usd` | USD, one modeled day; no fixed/demand charges |
| Cost sparkline | returned `optimized_demand_kw[h] * submitted electricity_prices_usd_per_kwh[h] * 1 hour` | Hourly expenditure, not a historical trend |
| Peak building demand | `optimized_peak_demand_kw`; baseline context from `baseline_peak_demand_kw` | kW, hourly average peak |
| Peak sparkline | `optimized_demand_kw` | 24 hourly kW values |
| Daily cost difference | backend baseline cost minus backend optimized cost | USD/day; negative means increased cost |
| Difference sparkline | `(baseline_demand_kw[h] - optimized_demand_kw[h]) * submitted tariff[h] * 1 hour` | Hourly difference; signed values preserved |
| Remaining peak capacity | submitted `building_max_demand_kw - optimized_peak_demand_kw` | kW, not utility-billing demand |
| Capacity sparkline | submitted cap minus returned optimized hourly demand | kW available in each modeled hour |
| Aggregate demand chart | returned `baseline_demand_kw`, `optimized_demand_kw`; submitted `fixed_demand_kw` and cap | Fixed component is included in totals, not added again |
| Tariff chart/table | submitted `electricity_prices_usd_per_kwh`; draft only before a submitted result, explicitly labeled | USD/kWh, scenario inputs; not wholesale prices |
| Cost bars | returned baseline and optimized daily costs | USD; null optimized cost is unavailable |
| Draft demand | existing `fixedDemand(editor)` | Fixed demand only, no claimed optimized schedule |
| R2 insights | existing `deriveEnergyInsights(resultScenario, result)` | Existing reconciliation rules unchanged |
| Market directory | static operator labels, approximate schematic positions, official portal URLs | No pricing observations, market type, timestamps or coverage claims |

All submitted values remain visible and labeled as previous when the draft is
stale. Mode changes clear results. Provider status is based on actual replies or
errors; no hosted Meta acceptance is claimed by these visual tests.

## Market data assessment

Research checked official sources on October 30, 2026. Discovery is not provider
acceptance or permission to redistribute. No price-provider credentials were
configured or altered. The production price integration is deliberately deferred
into a separate adapter PR. No fixture prices are displayed.

| Candidate | Coverage / observations | Access, refresh and limitations |
| --- | --- | --- |
| [Grid Status open-source integrations](https://github.com/gridstatus/gridstatus) | ISO-specific extraction; source support varies | Separate software and underlying data rights. Not an entitlement to hosted data or geographic datasets. Requires resilient scheduled ingestion and source-specific testing. |
| [Grid Status hosted API](https://docs.gridstatus.io/developers) | Dataset-dependent ISO pricing and history | API key required. [Usage endpoint](https://docs.gridstatus.io/developers/api-reference/api-usage) and plan-specific limits; quota and redistribution rights must be confirmed for the actual account. No free national feed assumed. [Terms](https://www.gridstatus.io/legal/terms_of_use.pdf) apply separately from OSS. |
| [NYISO public reports](https://www.nyiso.com/energy-market-operational-data) | Day-ahead and real-time zonal / generator LBMP, plus archives | Public downloadable reports; [real-time generator index](https://mis.nyiso.com/public/P-24Blist.htm) exposes update timestamps. Most promising narrow first adapter. Needs explicit timezone/DST and revision handling. Price locations do not automatically include licensed coordinates. No guaranteed SLA or unlimited API allowance established. |
| [CAISO OASIS](https://www.caiso.com/documents/oasis-interfacespecification_v5_1_1clean_fall2017release.pdf) | Nodal/aggregate-node prices by market interval | Official API specification documents LMP report families. Needs bounded queries, cache, retries and current interface verification. Public reports do not by themselves grant rights to a competitor's node map. |
| [ISO New England web services](https://www.iso-ne.com/participate/support/web-services-data) | Real-time, historical and day-ahead LMP, location-specific | Automated access application required; XML/JSON supported. Report documentation describes location parameters. Credentials must remain server-side. |
| [EIA Open Data](https://www.eia.gov/opendata/) | Broad balancing-authority demand, generation and flows; retail series separately | Free registered key and throttling described in [API documentation](https://www.eia.gov/opendata/documentation.php). These hourly operating series are not a national current nodal-price feed. |
| ERCOT / SPP / MISO / PJM official portals | Operator-specific reports linked directly from the UI | Discovery links only in this MVP. Authentication, interval cadence, quotas, historical availability, commercial redistribution and coordinate availability have not been provider-tested. Treat these as integration candidates, not connected coverage. |

### Geographic asset

State outlines derive from [`us-atlas@3` states-albers-10m](https://github.com/topojson/us-atlas),
which documents U.S. Census source geography. The ISC license is retained at
`frontend/public/us-atlas-LICENSE.txt`. Projected arcs were decoded into rounded
SVG path coordinates; no external map service is contacted. Approximate operator
markers are authored schematic positions, not nodes, state prices or service-area
polygons. No state or territory is colored by a fictional price.

### Follow-up adapter boundary

Recommended separate backend `GET /api/markets` with normalized observations:
`operator`, `location_id`, `location_name`, `location_type` (node/zone/hub),
`market` (RT/DA), `price_usd_per_mwh`, `interval_start`, `interval_end`,
`published_at`, `fetched_at`, `source_url`, and independently authorized optional
coordinates. Return explicit unavailable/stale reasons and coverage metadata.
Reject malformed timestamps, future observations, nonfinite prices and invalid
intervals. Negative prices are valid and must not be clamped. Use a diverging
scale around zero, identify outliers, and never infer state-wide prices.

Start with one NYISO zonal report, not national nodes. Establish terms and location
mapping first; then cache scheduled ingestion at the source's observed cadence,
add timeout/backoff, request deduplication and source revision reconciliation.
Persist the last successful observation; declare stale from observation time
according to the selected market's cadence, never from fetch time alone. Keep
server credentials out of the frontend. Test live/stale/missing/partial data and
DST transitions with recorded provenance. A data-source outage must not affect
optimization. Wholesale prices must never replace retail tariff inputs implicitly.

## Verification and screenshots

Evidence is in `artifacts/command-center`. Before is latest main plus retained
advisor polish, before command-center edits. `after/overview-{1440,1024,768,390}.png`
shows real local joint-solver outcomes; `desktop-ev_only.png` shows EV-only.
`desktop-draft.png` has no submitted result. Mobile screenshots cover infeasible
results and advisor unavailable state. Existing advisor regression captures also
exercise conversation, clarification, profile editing and proposal actions using
explicit presentation mocks, not hosted inference.

Compared directly with the supplied reference: the implementation adopts its dark
shell, compact navigation, four-card KPI row, prominent U.S. geography, right-side
advisor and disciplined chart colors. It intentionally has no dense invented node
cloud, live badge, historical comparison, fictional business profile or monthly
savings. Its result evidence and scenario disclosures require additional vertical
space; the Optimization destination makes results directly accessible without the
map. Mobile content stacks with horizontally scrollable navigation and tables.

Checks and exact results are recorded in `artifacts/command-center/README.md`.
