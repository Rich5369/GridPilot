# GridPilot Backend Accuracy, Optimization & Energy Data Engineering Review

Audit date: October 30, 2026, America/New_York (captures run into October 31 UTC). All scenario inputs in this audit are synthetic, not measured commercial consumption. No paid Meta inference, deployment or frontend modification was performed.

## 1. Revision, scope and conclusion

Fetched `origin/main`: `0f23b56be9a5c47b049ace8ab96ec16c54753b6c` (PR #42 merge). Work is isolated on `backend/accuracy-engineering-audit` in `.backend-accuracy-audit/`. The root checkout remains on main, with all its existing dirty files and artifacts preserved. No open PR or PR newer than #42 was returned at the refresh.

**Conclusion:** the tested energy-only EV/joint LP agrees with an independent exhaustive primary-objective oracle across 200 small scenarios. Raw schedule checks, analytical peak examples, conditional-demand examples, API regression tests and bounded local HTTP checks support the reported arithmetic. No demonstrated P0 optimizer defect or objective/physical-constraint change was warranted. This is bounded evidence, not proof for every floating-point input or deployment.

Three reproduced P1 backend defects were corrected: numeric substring acceptance in employee evidence, loss of valid EIA responses when a fallback asset is unavailable, and serialization failure turning intended nonfinite-input 422 responses into 500 errors. The public OpenAPI document is byte-equivalent after canonical JSON serialization; its SHA-256 remains `6cba7d58ba115fae82d27637970f6c0f3ae2ef9d9536c9d26e5a30fd199d65f8`.

## 2. Relevant PR history and why its decisions remain

GitHub statuses were refreshed rather than inferred from historical “not merged” statements. All PRs below are merged and contained in the reviewed main. Their descriptions, changed-file lists and engineering documents were reviewed; there were no submitted reviews or inline review threads in the previously collected #29–#42 metadata. No new PR changes superseded that reviewed revision.

| PR | Engineering decision and audit implication |
| --- | --- |
| [#30](https://github.com/Rich5369/GridPilot/pull/30) | E1 exposes actual device arrays from the **same** SolveOutcome and checks their reconciliation; it must not create another solve or decompose aggregate demand heuristically. |
| [#32](https://github.com/Rich5369/GridPilot/pull/32) | Deterministic hourly costs/peak/headroom are derived from submitted inputs, not free-form model numbers. Its insight implementation is frontend-owned and was inspected read-only. |
| [#33](https://github.com/Rich5369/GridPilot/pull/33) | Bounded conversation/profile and a 64-entry process-local solver-result cache. Informational requests do not solve; profile background is not an engineering input. |
| [#35](https://github.com/Rich5369/GridPilot/pull/35) | Monthly EIA commercial retail benchmarks are explicitly separate from optimizer tariffs. Saved original-date fallback, bounded retrieval and withheld wholesale observations are preserved. |
| [#36](https://github.com/Rich5369/GridPilot/pull/36) | Frontend consumes same-solve E1 plans with runtime validation and exact exports. No frontend changes are included here. |
| [#39](https://github.com/Rich5369/GridPilot/pull/39) | E2 adds necessary-condition certificates and a non-localized solver proof alongside legacy reasons, without changing the LP. Certificates are checked independently here. |
| [#40](https://github.com/Rich5369/GridPilot/pull/40) | UUID execution IDs bind explanations to exact inputs, mode and solve, avoiding silent recomputation or replacement with another matching solve. |
| [#41](https://github.com/Rich5369/GridPilot/pull/41) | Content-free completion diagnostics and conservative cost explanations prevent false device-causality claims; retain errors and explicit review/apply. |
| [#42](https://github.com/Rich5369/GridPilot/pull/42) | Selection uses low reasoning effort, 5,000 completion tokens/50 seconds, strict parsing, no retries and explicit truncation failure. Local injected success does not establish hosted Meta acceptance. No inference settings changed in this audit. |

Earlier #4/#12/#23 established EV/joint optimization and the shared adapter; #25–#28 recorded bounded engineering/hosted evidence. Those historical runs do not identify the currently served revisions. Current code supersedes README's stale claim that joint-mode AI is disabled and its earlier pending E1 frontend notes.

## 3. Backend architecture and contracts

- `backend/models/contracts.py`: finite, nonnegative hourly power/energy, finite signed prices, exclusive same-day windows, per-type unique IDs; 24-element arrays. Extra fields are forbidden. Physically impossible energy is allowed as valid input and reported as infeasibility, not disguised as a schema error.
- `backend/simulator/interface.py`: independent deterministic arrival baseline, aggregate evaluator; `energy.py` and `tariff.py` provide electrical and billing arithmetic.
- `backend/simulator/building.py`, `engine.py`, `hvac.py`: detailed engineering wrapper with named background/HVAC profiles and optional conditional demand charges. HVAC is predetermined electrical demand, not a thermal state model.
- `backend/optimizer/solver.py`: GLOP LP, primary cost solve and secondary peak solve, status handling and schedule/objective verification.
- `constraints.py`, `infeasibility.py`: electrical checks and E2 certificates; `operating_plan.py`: exact same-outcome E1 serialization and reconciliation; `interface.py`: public energy-only adapter.
- `backend/api/routes.py`: health, optimization and EIA routes; optimization adds an execution ID and retains a deep copy. Solver unavailable/unresolved maps to 503; solver/verification failures to sanitized 500; actual infeasibility is 200 with reasons and null optimized fields.
- `backend/eia/retail.py`: bounded monthly benchmark retrieval, date/unit/sector checks, cache and saved fallback.
- `backend/ai/`: proposal validation, strict conversation schemas, exact-result lookup, deterministic numerical facts, cost accounting and provider diagnostics.

HTTP `POST /api/optimize?scheduling_mode=ev_only|joint` accepts Scenario only, not BuildingConfig, business background or wholesale observations. The HTTP adapter calls `solve_ev_charging` without a detailed Tariff: its costs are **energy-only**. Detailed conditional-demand optimization is available through the engineering Python engine, not silently enabled in the API. Fixed fees are not in either minimization objective because they are constant.

No database, authenticated business/site identity, measured-meter ingestion or equipment-control integration exists in these reviewed paths. There is no maximum device-count constraint in the public Scenario schema; test sizes are measurements, not a documented unlimited-capacity promise.

## 4. Reconstructed mathematical formulation

Let h = 0,…,23 index one-hour intervals `[h,h+1)` and Δt = 1 h. Let f_h be supplied fixed average kW, c_h the submitted USD/kWh rate, L the positive import cap. Every device i has allowed same-day interval W_i, grid-side energy E_i in kWh and maximum average power P_i in kW.

### Baseline and mode

For a device with start a and end b, its uncontrolled arrival baseline is

`b_i,h = min(P_i, max(0, E_i − (h−a)P_iΔt)/Δt)` for h in `[a,b)`, zero otherwise.

This is start-immediately operation, not a schedule optimized against prices or site capacity. Fractional final-hour average power is permitted. If E_i exceeds window capacity, the baseline delivers only what fits and records violations. A baseline overload caused by coincident arrivals does **not** establish optimization infeasibility.

In EV-only mode, movable set M contains EVs and immutable load F_h is f_h plus held flexible baselines. In joint mode, M contains EVs and flexible equipment; F_h = f_h. Fixed load and held flexible load are never added twice.

### Decision variables, equalities and inequalities

For every movable device/hour, x_i,h is a continuous average power:

- `0 ≤ x_i,h ≤ P_i` inside W_i; `x_i,h = 0` outside it.
- `Σ_h x_i,h Δt = E_i` for each device separately.
- Site import `D_h = F_h + Σ_i x_i,h`.
- `D_h ≤ L` for every hour.
- Auxiliary peak p satisfies `D_h ≤ p ≤ L`, p ≥ 0.

There are no binary on/off variables, shared-charger assignment, minimum run lengths, ramping, battery state, export, solar generation, HVAC thermal dynamics, comfort constraints or overnight windows. Equipment can pause and vary power. Operating hours are metadata; supplied loads outside business hours remain authoritative.

### Objective and proof

Public API primary objective: minimize `C = Σ_h c_h D_h Δt`.

Detailed-engine optional objective, only with positive demand rate r and known prior monthly peak H: minimize `C + r z`, where `z ≥ 0` and `z ≥ p−H`. This estimates incremental monthly peak exposure, not full monthly billing demand or a complete tariff. Unknown H with nonzero r leaves demand/full operating cost unavailable and optimizes energy only.

After an OPTIMAL primary solve, constrain primary objective ≤ optimum + USD 1e−7, then minimize p. Therefore secondary schedules may have energy cost up to about USD 1e−7 higher than the primary optimum; this is intentional and should not be reported as a meaningful increase or claimed exact identity. A verified FEASIBLE primary incumbent is not called optimal. Primary NOT_SOLVED is unresolved, not infeasible. Secondary NOT_SOLVED retains the primary schedules with a warning. Other secondary errors fail closed.

GLOP primal/dual tolerances are set to 1e−9; application raw power/energy verification uses absolute 1e−6 kW/kWh and objective reconciliation allows 2e−7 USD. Single-device analytical window checks use 1e−8 kWh; E2 fixed/shared checks use 1e−6 in their respective units. These differ intentionally in code and are not a relative guarantee at arbitrarily huge input magnitudes. Small negative solver noise is inspected before clipping and the cleaned schedule is re-evaluated. Values are never rounded into feasibility.

The implementation matches its documented **continuous single-day scheduling** behavior. It does not support every physical commercial appliance, guaranteed kWh reduction or full utility-bill savings. GLOP is an LP solver; the [official OR-Tools LP guide](https://developers.google.com/optimization/lp/lp_example) describes the variable/constraint/objective approach used here.

## 5. Cost, energy, peak and comparison verification

The independently reconstructed calculations are:

- Interval energy: `e_h = D_h × 1 hour`, in kWh.
- Interval energy charge: `q_h = e_h × c_h`, in USD.
- Daily energy charge: `Σ_h q_h`; daily energy: `Σ_h e_h`.
- Daily modeled peak: `max_h D_h`, in hourly-average kW, not a shorter utility demand measurement.
- Remaining cap: `L − max_h D_h`; a negative baseline value correctly indicates overload.
- Device charge: `Σ_h x_i,h × Δt × c_h`; unchanged fixed demand has the same charge in both comparable schedules.
- Absolute difference: baseline minus optimized; negative values are possible. Never sum overlapping shortage certificates into a total.
- A percentage `100 × (baseline−optimized)/baseline` is interpretable only with a positive baseline and an equal-work comparison. It is undefined at zero; negative baseline credits make ordinary “savings percent” misleading. The reviewed HTTP/AI backend does not publish a general savings-percentage field. The independent audit reports percent only for positive baseline cost.

Comparable feasible schedules preserve total grid-side device energy and fixed demand. The uncontrolled baseline may violate a power cap while doing the same work; this does not invalidate an energy comparison, but must remain disclosed. A physically impossible baseline with incomplete work cannot establish equal-service savings. Detailed `scheduler.py::_comparison` explicitly marks incomplete baseline work invalid. Public infeasible results have no optimized values or computed reduction.

Signed scenario prices are supported. They cannot induce overcharging because each device has an energy equality, not a lower bound. Fixed and each EV/flexible schedule enter aggregate demand exactly once; no source map or EIA benchmark is substituted into c_h.

Representative independent results (floating figures shown to useful precision; full returned arrays/precision retained in evidence):

| Synthetic example | Mode | Baseline USD | Optimized USD | Optimized peak | Outcome |
| --- | --- | --- | --- | --- | --- |
| joint_recovery | EV-only | 5.60 | unavailable | unavailable | Held flexible load prevents EV feasibility. |
| joint_recovery | Joint | 5.60 | 5.60 | 3 kW | Same 28 kWh, feasible rearrangement. |
| joint_price_shift | EV-only | 7.90 | 7.90 | 3 kW | Flexible load held at its baseline. |
| joint_price_shift | Joint | 7.90 | 7.3000001 | ~3 kW | Same 26 kWh, lower energy charges. |
| joint_infeasible | Both | 5.80 | unavailable | unavailable | Shared energy/window shortage. |

For a separate analytic peak check, fixed 1 kW all day plus a 12 kWh EV available all 24 hours requires peak ≥ (24+12)/24 = 1.5 kW. Constant EV power 0.5 kW attains it. Returned peak and cost match this bound for prices −100, 0 and +100 USD/kWh without changing required energy.

Three new detailed-demand examples use fixed 1 kW, a 2 kWh EV in hours 0–1, rates 0.4/0.1 then 0.3 USD/kWh, demand rate 1 USD/kW and allocated fixed fee USD 0.50. If x is EV kW at hour 1, primary variable cost is `7.9−0.3x + max(0,max(3−x,1+x)−H)`. Hand-solving gives x=1 for prior peak H=0 or 1; H=3 gives energy-only x=2. Tests verify both the optimized energy and conditional total cost against this piecewise formula.

## 6. EV, flexible equipment and infeasibility

Each EV has an independent energy equality, charging bound and exclusive window. Flexible equipment obeys the same mathematical shape in joint mode, and the deterministic baseline is held in EV-only mode. Exact input IDs are retained with `(device_type, device_id)` identity, so the same textual ID across types is not an accidental collision. Zero energy is valid; zero/negative maximum power or cap is invalid. Negative energy and reversed/overnight windows are schema errors. Negative prices are valid signed cost coefficients.

Audit coverage includes overlapping and different deadlines, tight caps, hour 0 and hour 23/24 boundaries, fractional energy, zero work, impossible device capacity, combined shortages, equal and negative prices, repeated requests, solver/provider failure regressions and large synthetic device collections.

E2 certificate logic was reconstructed separately:

1. **Device window:** E_i > P_i(b−a) plus declared kWh tolerance.
2. **Fixed/held overload:** f_h + held flexible power > L plus declared kW tolerance. Joint mode does not treat movable flexible power as immutable.
3. **Shared window:** energy of movable devices whose *entire* window lies inside `[a,b)` exceeds `Σ_[a,b) max(0,L−F_h)Δt`. Partially overlapping windows are not charged their entire energy to that interval. Per-device power constraints can still make an instance infeasible when this bound passes.
4. **Solver-only:** actual GLOP INFEASIBLE status, with no invented numerical/device/window cause.

Analytical violations are sufficient certificates of infeasibility because they violate necessary conditions; they are not exhaustive descriptions or unique root causes. Passing analytical checks is not a feasibility proof; the LP and returned schedule checks remain necessary. Correcting one certificate does not guarantee a feasible model. Selection groups repeated shared bounds without changing legacy messages.

The new checker recomputes certificate quantities from original requirements, windows, fixed inputs and independent held baselines. For solver-only evidence it can check structural honesty, not independently prove arbitrary infeasibility. Small oracle cases separately verify infeasibility by exhausting all relevant grid allocations. Solver failure/unavailability/timeout is never accepted as a mathematical infeasibility certificate.

## 7. Electricity and energy data inventory

| Source/category | Organization, coverage, units and retrieval | Refresh/fallback and limits |
| --- | --- | --- |
| Monthly commercial retail benchmarks | EIA Electric Power Monthly Table 5.6.A; 50 states + DC, current month and same month prior year, cents/kWh; bounded HTML table retrieval and validation. | Six-hour worker-local cache; coalesced requests; eight-second total deadline; one-megabyte cap; saved original-date snapshot, delayed label after 62 days. Not a facility tariff or operational hourly signal. |
| Scenario hourly prices | API caller, 24 signed finite USD/kWh coefficients for an abstract local day. No automatic geolocation/utility/provider mapping. | Caller owns provenance. No automatic refresh or EIA substitution. Synthetic demo tariffs must stay labeled fictional. |
| Shared/detailed fixture loads | Repository `sample_data/`, Python demonstration configs; synthetic fixed/EV/flexible/background/HVAC data, kW/kWh. | Deterministic engineering examples, not observed customers or telemetry. |
| Wholesale directory | Frontend-owned geographic/operator links; price observations withheld. | No operational wholesale price adapter in the reviewed backend; local preserved private market work is excluded. |

A fresh unauthenticated source check retrieved August 2026 commercial observations, published October 23, 2026; all 51 current/prior-year area value pairs matched the bundled snapshot, with zero missing current values. Record: `docs/verification/backend-eia-source-check.json`. The [EIA table](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a) confirms month, sector and cents/kWh units. Its monthly data is contextual, not a real-time warehouse tariff.

[EIA reuse guidance](https://www.eia.gov/about/copyrights_reuse.php) permits data reuse with dated acknowledgment; protected third-party material and EIA branding require separate care. This audit adds no market feeds, images or unlicensed redistribution.

Parser checks commercial columns, units, year pairing, release dates, duplicate state rows and row width. Missing/unusable observations remain null, not zero or invented averages. Negative monthly retail cells are unavailable; signed hourly optimization prices are a different contract. Geographic ordering is stable against a canonical state list. Release/source timestamps stay attached to the original data; parse_report validates against the UTC check time. Scenarios have no calendar/timezone/DST mapping and cannot accept raw dated tariff series without an explicit upstream conversion.

Remaining data limitations: HTML layout changes can break parsing; no permanent provider-refresh store exists; cache is per worker; a broken provider **and** unusable packaged snapshot still leave no available dataset. That simultaneous packaging/outage case currently fails rather than fabricating data; an explicit service-unavailable response is a useful separately agreed error-path improvement. A fresh release may replace missing state cells with null rather than splicing older observations into an apparently current month, which is honest. Same-release data revisions cannot be independently authenticated from release dates alone. No production Render-to-EIA connectivity was verified here.

## 8. AI backend numerical grounding

`advisor.py::ConversationRequest` requires the existing Scenario and supports eight optional business fields, bounded history, mode and result ID. Company name, monthly bill parsing, measured-consumption derivation and scenario-free onboarding are not implicitly supported. Empty/N/A/unknown profile strings remain null. Goals and equipment descriptions are background, not solver assignments.

Newly extracted business fields require a supporting user quote found in request/user history; assistant history is excluded. This audit tightens **employee numeric token evidence**, not the business schema or model settings. Evidence matching remains lexical: quoting a phrase does not prove its semantic interpretation or resolve negation/contradiction. Extracted facts should remain user-reviewable; do not claim formal semantic correctness.

Only site cap, all-existing-EV deadline and supported positive-peak two-rate tariff percentage proposals exist. `proposals.py::validate_proposal` produces a separately validated Scenario and does not execute it. Explicit frontend Review/Apply/Compare is still required; that UI belongs to the teammate. No endpoint silently turns bills, employee counts or descriptions into kW profiles.

`api/routes.py` assigns execution UUIDs; `snapshots.py` keeps at most 64 deep copies per process, keyed by exact serialized Scenario/mode/execution. `/explain` returns 409 for absent/mismatched/unavailable retained IDs; conversation responds with truthful unavailable evidence rather than using a substitute solve. Existing tests ensure no explanation triggers another optimization. Worker changes/restarts/eviction can lose retention; browser persistence does not solve this.

`cost_attribution.py` checks same-execution components and totals before describing device cost accounting. Its numbers sum the returned arrays at submitted prices. It deliberately avoids claiming that a device uniquely *caused* aggregate savings: an accounting difference is not a counterfactual attribution. Model text cannot replace solver results; curated fact keys select server-owned evidence. Numerical prose guards and strict schemas fail closed for tested quantities/promises, but a lexical guard is not a proof against every possible unsupported qualitative claim.

PR #42 addresses a documented completion length stop with low reasoning effort and compact output; it does not establish current production quality. The unchanged 5,000-token/50-second Selection stage, strict JSON/Pydantic validation and zero SDK retries remain. All audit AI tests use injected SDK/HTTP responses or missing-provider configuration. No genuine Meta output was newly sampled; hosted onboarding success, served SHAs and live conversational quality remain unverified.

## 9. New independent verification and measured results

New `backend/verification/accuracy.py` intentionally imports **no production evaluator, baseline generator, LP formulation, tariff calculator or OR-Tools solver**. It consumes plain scenario/result JSON. Baselines use a closed-form expression; other checks reconstruct raw per-device bounds/windows/energy, aggregate/site power, daily and hourly costs, device charges, peak, equal-work differences and E2 certificate quantities. Tests deliberately corrupt cost, peak, aggregate, windows and delivered energy to show that the checker detects failures.

The exact oracle enumerates all allocations on a quarter-kW/kWh grid for at most three-hour device windows using `fractions.Fraction`. After scaling by four, the primary constraints form a capacitated device-to-hour bipartite flow with integer supplies/capacities. Its integer optimal vertex means the enumeration contains a continuous-LP **primary** optimum for these fixtures; this is not an arbitrary coarse discretization assumed to approximate the LP. The secondary peak optimum may be off-grid and is not compared to the oracle. Separate analytic bounds test secondary behavior.

Deterministic seeds 0–59 include random feasible/infeasible cases. Seeds 60–99 construct a joint-feasible witness to broaden feasible coverage, then still require the oracle to find the cheapest schedule. Both modes are checked: **200 classifications/cost comparisons: 96 feasible and 104 infeasible, all matching**. This does not independently prove every larger floating-point or conditional-demand LP.

Audit checker tolerance: absolute 1e−6 kW/kWh and 2e−7 USD with 1e−12 relative tolerance for recomputed floating totals. The exhaustive oracle itself uses exact rational costs. Physical required energy is checked before interpreting cost savings. Zero/negative baseline percentages stay unavailable.

`python scripts/audit_backend_accuracy.py --base-url http://127.0.0.1:8027 --output docs/verification/backend-accuracy-audit.json` also records:

- Six representative EV-only/joint results with full original requests, response device arrays and recomputed metrics.
- Six real local HTTP optimization captures, health/OpenAPI checks and four malformed/mode/overflow rejection probes, without any AI endpoint calls.
- Six device-count/mode stress cases. Uniform-price joint schedules attain the independent average-power lower bound; EV-only large cases correctly fail where held flexible baselines consume the cap.
- Source-file SHA-256 fingerprints, Python/solver identity, baseline Git SHA and explicit dirty-worktree provenance; capture revision is **baseline plus the documented uncommitted audit patch**, not a claim that the evidence was generated by pristine main or deployed code.

Illustrative one-run local timings (validation + optimization + serialization, excluding the separate checker):

| EVs + flexible devices | EV-only | Joint | Joint modeled peak |
| --- | --- | --- | --- |
| 10 + 5 | feasible, ~0.04 s | feasible, ~0.04 s | 1.078125 kW |
| 100 + 50 | infeasible, ~0.13 s | feasible, ~0.37 s | 1.78125 kW |
| 300 + 150 | infeasible, ~0.30 s | feasible, ~1.11 s | 3.34375 kW |

Exact rerun timings are in the JSON; these rounded observations are not throughput, latency percentiles, production cold-start behavior or a maximum-size support claim. Public collections remain unbounded and admission/resource limits need separate contract/operational consideration.

## 10. Findings, severity, reproduction and corrections

### P0 — no demonstrated optimizer defect within the tested scope

No incorrect tested primary objective, double-counted returned load, material energy/window/cap violation or false feasibility classification was found. Numerical verification still depends on bounded examples and floating-point tolerances; “no demonstrated P0” is not universal certification.

### P1.1 — employee evidence accepted a substring as a count (fixed)

Before: request “We have 300 employees.” plus injected Selection `employee_count=30`, quote “300 employees” passed `grounded_profile`. The schema permitted an integer and `str(value) in quote` incorrectly treated a substring as exact numerical evidence. This can corrupt user business background, though it does not change solver inputs.

After: new employee counts must appear as a complete numeral, excluding adjacent word/digit characters, decimal/grouped-number fragments and signed fragments. Unsupported counts fail with the existing 502 `ai_invalid_response`; exact 0/30 excerpts and punctuation still pass. Other profile values retain existing evidence matching. No rounding, numeric conversion or model retry was introduced.

Files: `backend/ai/advisor.py`; regression tests in `backend/tests/test_audit_regressions.py`, including an injected-completion HTTP route test. Semantic negation/contradictions remain a limitation; this correction is deliberately narrower.

### P1.2 — valid EIA retrieval depended on a readable fallback (fixed)

Before: valid parsed fresh data on cold start unconditionally read the bundled snapshot for regression comparison. A missing snapshot raised FileNotFoundError; corrupt JSON discarded valid fresh data and failed again while loading the same fallback.

After: optional saved-baseline read errors do not veto an independently validated fresh release. If a readable previous release exists, regression protection remains. Runtime retrieval still does not rewrite packaged files or synthesize missing observations. Existing timeout/source-failure saved/delayed behavior and date provenance are preserved.

Files: `backend/eia/retail.py`; missing/corrupt snapshot regressions. This is not a guarantee of service when both source and all saved data are unavailable.

### P1.3 — nonfinite malformed numeric input escaped as HTTP 500 (fixed)

Before: Pydantic correctly rejected `NaN`, infinity or legal JSON overflow `1e309`, but the default validation response echoed an infinite/NaN float. JSONResponse refused to serialize it; local HTTP returned 500 “Internal Server Error,” contradicting documented 422 invalid-input behavior. The existing unit test checked model rejection only and missed HTTP serialization.

After: an application RequestValidationError handler retains the normal `detail` error list and status 422, converting only nonfinite **diagnostic floats** to strings. Input validation is not relaxed; valid finite data is unaffected. Covers optimize/conversation, signed/nonfinite tokens, legal overflow and a nested erroneous hourly array. No new public fields or schema changes.

Files: `backend/api/validation.py`, registration in `backend/main.py`, regression tests.

The first 13 defect regression cases run against pre-fix code produced **8 failures and 5 passes**: six false employee extractions and two lost-fresh-EIA cases. Separately reproduced nonfinite inputs returned 500 before the handler; after it, all ten token/endpoint combinations and the nested case return valid JSON 422. No numerical optimizer output changed because the LP/evaluator was not edited.

### Deferred P1/P2 and frontend handoff

- **P1 release verification:** exact deployed frontend/backend revisions and a separately authorized bounded real Meta acceptance test remain outstanding. No paid inference or deployment is authorized/performed by this audit.
- **P1 operational sizing:** device arrays have no declared size cap; bounded local measurements are acceptable for the tested sizes but not evidence against denial-of-service or very large numeric conditioning. Admission limits would change accepted input behavior and need explicit agreement.
- **P2 data operations:** validate packaged snapshot health in CI/deployment; agree on a structured 503 path if no provider/cache/snapshot is available. No new dataset/platform needed.
- **P2 data validation:** richer snapshot semantic/date/state validation and drift monitoring would improve tamper/packaging robustness, but the current committed snapshot matched the public source. Do not invent an incident requiring a broader schema rewrite.
- **P2 modeling:** batteries, solar, efficiency curves, overnight/DST, uninterrupted cycles, ratchets and detailed utility tariffs require new assumptions/contracts, not deadline-driven shortcuts.
- **Frontend teammate:** retain daily energy-only labels, hourly-interpolation disclosures, demo provenance, null infeasible metrics, baseline overload/work completeness, exact execution ID/mode forwarding, user-reviewable extracted business facts and separation from engineering inputs. E2 cards should distinguish necessary bounds from solver-only proof and must not sum overlapping shortages. No frontend code was edited; no frontend PR was open at the status refresh, so unpublished overlap remains possible.

## 11. Files changed and verification commands

Runtime corrections: `backend/ai/advisor.py`, `backend/eia/retail.py`, `backend/main.py`, new `backend/api/validation.py`.

Independent verification: new `backend/verification/__init__.py`, `accuracy.py`, `backend/tests/test_accuracy_audit.py`, `test_audit_regressions.py`, `scripts/audit_backend_accuracy.py`.

Review evidence: this report, `docs/verification/backend-accuracy-audit.json`, `backend-eia-source-check.json`.

Use a configured backend environment from the audit checkout:

```bash
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m pytest backend/tests -q
/workspaces/GridPilot/backend/.venv/bin/python -m compileall -q backend scripts/audit_backend_accuracy.py
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8027
# Separate terminal; optimization/health/schema only, never inference:
MODEL_API_MODE=mock MODEL_API_DIAGNOSTIC_ON_STARTUP=0 /workspaces/GridPilot/backend/.venv/bin/python scripts/audit_backend_accuracy.py --base-url http://127.0.0.1:8027 --output /tmp/backend-accuracy.json
```

Baseline: **404 passed** in 9.18 s. Final suite: **639 passed**, zero skips, in 12.14 s; one pre-existing Starlette/httpx TestClient deprecation warning. Includes API/Pydantic invalid-input checks, actual GLOP, solver-unavailable/unresolved/error injections, E1/E2 proofs, independent oracle/physical/cost checks, provider failures, exact-execution and truncation/grounding regressions. Provider transport tests are injected, not live Meta.

Compileall and `git diff --check` pass. No backend lint/type-check configuration was found, so none was invented; Python syntax compilation and runtime schema/tests were used. Frontend tests/lint/build were not run or modified under the revised backend-only ownership. A restricted-executor TestClient test attempt stalled and was interrupted; the quoted complete suite runs used the executor with local networking/thread support and disabled startup diagnostics. Real local HTTP checks ran separately against uvicorn.

## 12. Remaining limits and next priorities

Review and merge the focused backend correction/verification PR through normal review; do not deploy automatically. Before the November 4 submission, prioritize release provenance, a deliberate local/demo scenario script, canonical label consistency with the frontend teammate and an explicitly authorized bounded hosted AI acceptance check. Keep synthetic inputs and engineering assumptions visible.

Do not change objective/constraints merely to make an infeasible scenario succeed. Preserve strict validation and nullable unavailable results. Further model expansion, new wholesale feeds, database persistence and throughput tuning should follow evidence and explicit requirements rather than the appearance of complexity.
