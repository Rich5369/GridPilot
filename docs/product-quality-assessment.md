# Product quality assessment — October 29, 2026

## Scope and evidence

Reviewed main at `0059f32`, including merged PR #19 (What-if restoration, responsive layout and browser verification) and #18 (joint application integration). Feature work uses an isolated worktree; existing Meta diagnostic changes remain untouched. No engine, API contract, deployment settings or Meta changes.

## Backend capability assessment

**Verdict:** a credible, verified single-day scheduling engine with a narrow application interface; not yet a calibrated business energy planning product. Automated correctness is valuable but does not establish savings for a real site.

- `backend/optimizer/solver.py`: OR-Tools GLOP continuous LP minimizes hourly energy cost; exact required kWh, per-device kW bounds, availability windows and shared site cap are enforced. A second solve minimizes peak while holding primary cost within $1e-7. Power/energy verification tolerance is 1e-6; schedules and objective are independently recomputed before return. No solver rewrite is justified by this review.
- `backend/optimizer/interface.py`: HTTP adapter exposes verified EV-only aggregate results. `backend/api/routes.py` explicitly returns 503 for joint mode until the adapter accepts `optimize_flexible`; the solver already supports joint flexible loads internally. This is a known integration dependency, not missing solver mathematics.
- `backend/simulator/interface.py`: baseline charges on arrival/earliest availability with a fractional final-hour average; baseline can exceed the site cap. Costs are calculated from actual demand and submitted prices. Optimized differences come from the returned solver output, not assumed savings. This baseline is a defined uncontrolled counterfactual, not measured historical use.
- `backend/models/contracts.py`: strict 24-value profiles, finite values, ordered same-day windows, positive power, unique IDs and forbidden extra fields. Feasible results require complete optimized metrics and no violations; infeasible results require reasons and null optimized metrics. Negative tariffs are allowed by the API, while the UI accepts only nonnegative tariffs.
- `backend/api/routes.py`: sync endpoint uses FastAPI worker threads; unresolved/unavailable return 503, verification/internal failures return sanitized 500, invalid input returns 422. Health reports application availability, not solver readiness. Solver permits two 10-second solves; frontend allows 45 seconds (`frontend/src/services/api.ts`). A client timeout does not cancel backend work.
- `backend/simulator/engine.py`, `building.py`, `hvac.py`, `tariff.py`: richer internal modeling includes named background loads, HVAC profiles and incremental monthly demand exposure. The application API does not expose this whole model. HVAC has no thermal physics; fixed schedules remain authoritative outside operating hours.

### Useful business problems

Offices, workplace charging sites and small commercial premises with known hourly background demand can explore whether deferring EV charging meets departure energy needs, lowers time-of-use charges and avoids a site cap. Internal joint scheduling can support genuinely interruptible equipment. Flat tariffs may yield little energy-cost reduction; peak tie-breaking can still change demand. Continuous fractional-hour power is appropriate only where devices can actually modulate.

### Modeling limitations, distinct from defects

24 one-hour intervals, same-day windows, no DST or overnight sessions; hourly average peak is not a utility's subhourly billing peak. No multi-day/monthly forecasting, thermal comfort dynamics, equipment start/stop cycles, minimum run times, ramp rates, charger contention/assignment, battery state of charge, efficiency losses, solar/storage/export or uncertainty model. Opening hours are metadata in the shared scenario. The UI sends fixed 1.5 kW background plus a predetermined HVAC vector regardless of hours (`frontend/src/data/demoScenario.ts`). Defaults are illustrative and have no measured calibration.

A real business must supply representative interval demand, applicable hourly tariff, safe site cap, arrival/departure windows, device power limits and grid-side energy requirements. Meter import needs timestamps/timezone/DST rules, interval and unit validation, missing-data handling, source provenance, and a way to avoid counting existing charging twice. Monthly bill forecasts require billing-period demand history and actual utility tariff rules.

### Confirmed gaps and risks

No newly proven mathematical defect. The response drops per-device schedules, solver optimality status and warnings available in `SolveOutcome`; users cannot execute equipment-specific decisions or distinguish a verified feasible result from a proved optimum. No request-size/device-count limits in Scenario collections; large inputs and concurrent requests require load testing and admission controls before public scale. No persistence, account/site isolation, meter import or calibrated baseline. These are product/production gaps, not evidence to replace GLOP.

Relevant tests: `test_optimizer.py` (solver correctness/failure handling), `test_joint_optimizer.py` (joint constraints), `test_simulator.py`, `test_energy.py`, `test_tariff.py` (physical/cost evaluation), `test_api.py` (HTTP contract), `test_what_if_acceptance.py` (business tradeoffs). See validation results below.

## Frontend findings and priorities

| Priority | Location / problem | Business impact | Action / owner |
|---|---|---|---|
| P0 dependency | Joint selection is selectable but adapter unavailable (`backend/api/routes.py`) | User can request a mode that cannot yet run | shaJ46 completes adapter; Rich5369 retains explicit unavailable response and integrates contract tests |
| P1 | `Dashboard.tsx`: fictional metrics remain the overview even after solving; warnings formerly appeared on every view | Hard to distinguish fixture, draft and returned result | First slice scopes demo warnings to overview and adds persistent result/input state; later replace overview with a clearly sourced result summary |
| P1 | `Dashboard.tsx`: navigation provides tools without a clear sequence | First-time owners cannot identify next action | First slice adds configuration → results → alternatives entry points |
| P1 | `Dashboard.tsx`, `index.css`: native unstyled mode select and long joint-only explanation shown in EV mode | Large technical paragraph dominates the page | First slice gives select visible boundaries, compact layout and mode-specific explanation |
| P1 | `ScenarioPanel.tsx`: dense numeric fields, exclusive end hours and electrical units | Users can enter plausible but misunderstood inputs | First slice explains hours, kW/kWh and site limit; next group editable settings with examples and inline context |
| P1 | `Comparison.tsx`: empty state asks user to connect FastAPI | Requires implementation knowledge from business users | First slice gives concrete navigation and run instructions |
| P1 | `Comparison.tsx`: feasibility jargon and stale-result warning without a next action | Old result may be applied to new settings | First slice adds rerun instruction, global changed-input status and feasibility interpretation |
| P1 | `Comparison.tsx`: result chart lacks a tabular alternative; aggregate output offers no device instructions | Low utility for keyboard users and actionable scheduling | Add accessible result table; device schedule presentation depends on API extension |
| P1 | `Dashboard.tsx`: no skip link; scheduling select lacks explicit focus style | Keyboard navigation effort and inconsistent focus | First slice adds skip link and select focus ring |
| P1 | `CostBreakdown.tsx`: billing inputs apply to fixture, independently of optimized energy-only results | Risk of interpreting separate cost models as one bill | Keep source labels; later align billing and result scope without claiming solver optimized demand charges |
| P2 | `Dashboard.tsx`: view state is not encoded in URL | Refresh/deep links lose context | Rich5369 adds URL navigation in a separate slice |
| P2 | `index.css`: small 9–12px secondary text, oversized sidebar filler, accumulated CSS overrides | Reading effort and maintenance cost | Rich5369 consolidates styles and raises secondary type sizes after workflow validation |

Desktop/tablet/mobile Chromium captures are under `artifacts/product-review`. Existing UI has a coherent palette and panels, but the competing data sources and technical instructions make it feel like several demonstrations. PR #19 already solved What-if restore and narrow-layout regressions; do not reimplement them.

## First slice: intended experience and implementation

Frontend-only workflow guidance, source-scoped warnings, mode-specific help, plain-language field guidance and result interpretation. Existing default values, request construction, numerical metrics, chart arrays, What-if, joint selection and request guards remain intact. No new business metric. Visible status always compares current inputs with the submitted snapshot. Earlier results remain explicitly marked when inputs change.

Files: `Dashboard.tsx`, `ScenarioPanel.tsx`, `Comparison.tsx`, `index.css`, `Dashboard.test.tsx`. Component regression verifies guided navigation, scoped demo banner, actual edited request payload, successful result state and changed-input state.

## Remaining ownership and roadmap

1. **Rich5369, P1:** configurable/imported fixed-demand profiles; scenario provenance; saved scenarios; accessible result table; consolidate overview around a selected data source. These can proceed independently of joint mathematics.
2. **Rich5369, API P1:** versioned response extension for device schedules, optimality/warnings and assumptions; bounded workload, readiness, operational telemetry and capacity testing. Coordinate schema with shaJ46; do not silently change existing semantics.
3. **shaJ46, dependency:** finish joint adapter and verify held versus movable equipment across adapter boundaries. No implementation changes made here.
4. **shaJ46, engineering planning:** evaluate real charger modulation, energy efficiency, subhourly demand, overnight/multiday windows and machine cycle constraints against target customer requirements before extending mathematics.
5. **Shared:** choose one target business and measured data set; agree on uncontrolled baseline and tariff scope, validate predictions against utility intervals. Only then assess business savings. Optional later capabilities include PV/storage and uncertainty analysis.

## Validation

Results recorded after implementation below. Screenshots compare deployed/current baseline with the isolated feature implementation; they do not imply production was updated. No deployment or automatic merge is authorized by this PR.

- Frontend unit/component suite: **57 passed**, one opt-in integration test skipped in default run. New guided-workflow regression passed.
- Opt-in real HTTP frontend integration: **1 passed**, genuine feasible/infeasible FastAPI responses.
- TypeScript and production build: passed. Lint: passed with two pre-existing Fast Refresh export warnings in `CostBreakdown.tsx`.
- Backend targeted engineering/API suite: **137 passed**; one dependency deprecation warning.
- Chromium `browser-qa.cjs`: passed genuine feasible/infeasible runs, exact submitted edits, independently recomputed chart costs, stale indication, six-second loading, duplicate guard, 422/503/500/network errors, native 45-second timeout and recovery; no page errors or horizontal overflow at 390/768/1024 pixels.
- Chromium What-if suite: passed real paired results, submitted scenarios/returned costs, infeasibility/null output, stale invalidation, apply/restore, validation, sequential requests/loading/503 and mobile overflow.
- Chromium joint suite: passed direct-engine/API EV-only numerical equality, mode invalidation, explicit `joint_adapter_unavailable` and What-if mode propagation.
- Real edited scenario: baseline $21.44 and 23.9 kW; optimized $21.440000100000002 and 15.499999875 kW. The $1e-7 objective tolerance is expected; displayed savings $0.00 and peak reduction 8.40 kW are consistent. Peak reduction must not be sold as energy savings.
- QA used isolated frontend :5174 and backend :8001 (temporary local API URL and CORS settings only). Frontend tests were run with their expected default API URL; the QA URL initially caused two hardcoded-URL test assertions to fail, resolved by using the expected test environment. No application workaround was introduced.
- Existing scripts were executed through temporary copies substituting the isolated frontend port (and the existing Python environment for the joint direct-engine check). Temporary scripts and environment files are excluded from the commit.

Screenshot index: `live-*` captures the deployed baseline after charts load; `after-*` captures updated overview/configuration/empty results. `after/desktop-feasible.png`, `after/desktop-infeasible.png`, `after/loading.png`, `after/timeout.png` and width-specific captures show real workflow states. `after/real-result.json` preserves the verified scenario and backend output.

Final screenshot review caught inherited negative help-text margins colliding with the result-mode line on mobile. The slice replaces those margins with normal flow spacing; refreshed `after-*` and `after/390-Optimization.png` capture the corrected layout. A keyboard skip link is hidden above the viewport until focused.
