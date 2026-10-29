# Joint scheduling: final local EE application acceptance

**PASS for application revision `91a95e4b51bfdca57af7bba9645765f47bb4a68c`.**
Frontend and backend both used this exact main revision, including the adapter
merge (#23, `d35b56f`) and chart fix (#24, `91a95e4`). The adapter implementation
is `c1d2758`. This acceptance was performed on
`test/joint-application-ee-acceptance`; the initial working tree was clean and
existing branches were preserved. No optimizer, simulator, adapter, API,
frontend, Meta, dependency or deployment configuration was modified.

These are newly captured application submissions, not the older pre-adapter
screenshots or synthetic CLI demonstration results. Production frontend build
(`VITE_API_BASE_URL=http://127.0.0.1:8007`) was served by Vite preview on
`http://127.0.0.1:5177`; the real FastAPI/OR-Tools backend ran on port 8007.
Only local CORS was supplied and optional Meta startup diagnostics were disabled.
No optimization responses were mocked, intercepted or replaced; no AI requests
were made. The final capture ran October 29, 2026, 17:56:53–17:57:05 CDT.
This is local acceptance, not evidence of a deployed revision or hosted success.

## Evidence and provenance

- [Complete application captures](verification/joint-application-captures.json):
  exact frontend/backend SHAs, production asset SHA-256 hashes, empty product
  source diff, URLs, each request's complete Scenario, `scheduling_mode`, actual
  HTTP status/response, submitted editor snapshots, rendered benefit metrics,
  24-row chart tables, chart geometry, comparison associations and Apply/Restore
  snapshots. All **12 requests** used `scheduling_mode=joint` and returned HTTP
  200: 10 feasible results and two proven-infeasible results.
- [Independent numerical results](verification/joint-application-numerical-checks.json):
  checksum tying this verification to the capture JSON, scalar metrics,
  direct solver status/proofs, direct per-equipment schedules and discrepancies.
  These direct schedules are not an inferred decomposition of the HTTP curve.
- [Browser driver](../scripts/verify_joint_application_browser.cjs) and
  [independent verifier](../scripts/verify_joint_application_captures.py) make the
  checks reproducible without changing product code. Alternatives inherit copied
  non-editable controls from the captured current editor; visible alternative
  controls are captured separately. The actual frontend `toScenario` conversion
  of each snapshot must equal its complete transmitted JSON body.

## Scenarios and numerical results

All cases retain the entered default tariff: $0.28/kWh in [14,20), $0.12
otherwise. EVs each require 14.4 kWh with a 7.2 kW maximum; separately modeled
equipment requires 6 kWh with a 3 kW maximum in [10,16). These requirements and
all remaining input fields are recorded in the capture JSON.

| Submitted case | Fixed input / EV window / cap | Feasibility | Baseline kWh / energy USD / peak kW | Optimized kWh / energy USD / peak kW |
| --- | --- | --- | --- | --- |
| Demo dashboard | Demo background+HVAC / [9,17) / 25 kW | Feasible | 128.8 / 20.576 / 23.9 | 128.8 / 20.576000100 / 14.059999875 |
| Custom dashboard | 2 + 0.25h kW / [9,17) / 25 kW | Feasible | 151.8 / 24.096 / 21.9 | 151.8 / 24.096000100 / 11.709999875 |
| Named sources/current | Lighting 2 + refrigeration 1 kW / [15,22) / 25 kW | Feasible | 106.8 / 20.304 / 17.4 | 106.8 / 15.696000100 / 17.399999688 |
| Named sources/alternative | Same sources and EV window / 15 kW | Feasible | 106.8 / 20.304 / 17.4 | 106.8 / 16.464000100 / 14.999999687 |
| Named sources/infeasible | Same sources and EV window / 2 kW | Infeasible | 106.8 / 20.304 / 17.4 | null / null / null |

Five distinct Scenario bodies were checked. Repeated current/alternative
submissions after Restore and at mobile width are retained individually rather
than collapsed. Baselines remain uncontrolled; the 15 kW case's baseline exceeds
the cap while its optimized schedule is feasible. At 2 kW, the immutable 3 kW
profile itself exceeds the limit; reasons and null optimized fields are preserved
in both the dashboard and What-if. No optimized savings are shown for that case.

Named-source fixed energy is (2 + 1) × 24 = 72 kWh. EVs add 28.8 kWh and equipment
adds 6 kWh, giving 106.8 kWh. Fixed energy charges are $11.52; flexible equipment
can receive 6 kWh at $0.12, adding $0.72. With a 25 kW cap all EV energy can use
[20,22), adding $3.456: primary optimum $15.696. At 15 kW, that cheap window
permits only (15 − 3) × 2 = 24 EV kWh, leaving 4.8 kWh at the higher price.
The extra charge is 4.8 × ($0.28 − $0.12) = **$0.768**.

## Independent engineering checks

For every actual captured body, the existing adapter was invoked with the same
complete Scenario and mode. HTTP classification, baseline demand/cost/peak,
optimized energy-only cost, total energy and peak agree. Hourly demand sums use
24 one-hour intervals; costs are tariff-weighted sums and peaks are actual
maxima. Fixed-demand lower bounds, site caps and required total energy pass.
Infeasible responses satisfy the existing shared schema's reasons/null rules.

The existing joint solver and independent evaluator were separately invoked for
the exact captured inputs. Every EV/flexible item's energy equality, exclusive
window/deadline and power bounds pass, as do total site capacity, expected
schedule keys and preservation of the fixed vector. Background/HVAC in the demo
remain predetermined. The named profiles stay aggregated and immutable; no
optimized allocation among lighting and refrigeration is claimed.

The direct feasible solves had proven optimal primary and peak-tie-break statuses.
The HTTP contract reports **feasible**, not an optimality proof; acceptance checks
its metrics against those independent results without requiring identical optimal
hourly arrays. Independent comparison tolerances are **1e-6 kW/kWh** and
**$2e-7**, retaining the existing **$1e-7** primary-cost allowance for the peak
tie-break. For this final run, all recorded HTTP-versus-direct energy/cost/peak
and aggregate arithmetic discrepancies were **zero** at stored precision.
The approximately $1e-7 increases over demo/custom baseline costs are within the
documented allowance, not a savings claim. No demand-inclusive operating costs
were used in any shared-field comparison.

## Demand-profile and application checks

All three selected profile types were submitted through real UI controls. Demo
fixed demand equals the existing background+HVAC vector (94 kWh). Custom fixed
demand equals the 24 entered values, totaling 117 kWh, replacing the demo.
Named source snapshots independently sum lighting 2 and refrigeration 1 kW
exactly once to 3 kW each hour, replacing both custom/demo demand. Required
separately modeled EV/equipment energy is additional, not included in fixed demand.
These are manually entered QA scenarios; they are not verified meter readings.

- Baseline-versus-optimized charts render visible screen-space SVG/curves and
  axes at **1440 px desktop and 390 px mobile widths**. All 24 displayed table
  rows match the corresponding actual response vectors to their two-decimal
  display precision. Benefit cards match each scenario's own baseline/optimized
  response; no earlier scenario or mode supplies the displayed results.
- The feasible What-if pair displays alternative-minus-current **$0.77**,
  **−2.40 kW**, **0.00 kWh**. Raw differences are approximately +$0.768,
  −2.4000000000000075 kW and 0 kWh. This is separate from each scenario's
  baseline benefit: approximately $4.608 current and $3.840 alternative,
  displayed as $4.61 and $3.84. Tightening the cap raises cost; positive savings
  between scenarios are not required or claimed.
- The current and alternative requests were captured sequentially and checked
  separately, with exact snapshots and joint mode. The same pair passes after
  Restore and after actual mobile-viewport submission. The infeasible pair
  suppresses between-scenario differences and optimized metrics/savings.
- Apply copies the alternative's 15 kW limit to current; Restore returns the
  exact selected source profiles and current controls to their captured starting
  values. Other inputs and joint mode are preserved.
- Dashboard input edits mark its old result stale. Alternative edits hide the
  previous pair. A mode change clears the dashboard result and hides the pair;
  switching back to joint does not revive the old comparison. These browser
  checks cover completed results; in-flight race behavior remains covered by
  existing frontend regressions rather than newly injected browser delays.
- No page errors or settled horizontal page overflow occurred. No solver failure
  occurred in captured browser requests. Existing fault-injection regressions
  separately verify unresolved/error/verification failures retain sanitized
  503/500 semantics, not infeasibility or successful zero-cost responses.

## Screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Demo joint result | [1440 px](screenshots/joint-ee-demo-result-1440.png) | [390 px](screenshots/joint-ee-demo-result-390.png) |
| Custom joint result | [1440 px](screenshots/joint-ee-custom-result-1440.png) | [390 px](screenshots/joint-ee-custom-result-390.png) |
| Named-source joint result | [1440 px](screenshots/joint-ee-sources-result-1440.png) | [390 px](screenshots/joint-ee-sources-result-390.png) |
| Feasible What-if | [1440 px](screenshots/joint-ee-whatif-feasible-1440.png) | [390 px](screenshots/joint-ee-whatif-feasible-390.png) |
| Infeasible What-if | [1440 px](screenshots/joint-ee-whatif-infeasible-1440.png) | [390 px](screenshots/joint-ee-whatif-infeasible-390.png) |
| Infeasible dashboard | [1440 px](screenshots/joint-ee-dashboard-infeasible-1440.png) | [390 px](screenshots/joint-ee-dashboard-infeasible-390.png) |

## Executed checks and reproduction

- Production TypeScript/Vite build: passed, including the final build with the
  explicit local API origin. Frontend suite: **74 passed, 1 opt-in live test
  skipped**; real HTTP browser coverage above was executed separately.
- Existing adapter, joint optimizer and API suites: **101 passed**, one existing
  Starlette/httpx TestClient deprecation warning; no skips. No assertions changed.
- Final browser capture: **PASS**, 12 genuine joint responses and four What-if
  pairs. Independent captured-scenario verification: **PASS** for all 12 and four
  pairs. Both desktop/mobile screenshot sets are from that final complete run.
- An earlier successful capture was regenerated for asset provenance. One
  intervening recapture attempt failed before any optimization because the local
  services had stopped (connection timeout). Both services were restarted and
  managed together for the final passing run; this was not a solver discrepancy.

From the repository root, using the existing Python/frontend dependencies and
an external Playwright installation with Chromium available:

```bash
# Terminal 1
CORS_ORIGINS=http://127.0.0.1:5177 MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8007
# Terminal 2
VITE_API_BASE_URL=http://127.0.0.1:8007 npm --prefix frontend run build
npm --prefix frontend run preview -- --host 127.0.0.1 --port 5177 --strictPort
# Terminal 3; rewrites only this acceptance's capture/screenshot files
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_joint_application_browser.cjs
backend/.venv/bin/python scripts/verify_joint_application_captures.py
npm --prefix frontend test
backend/.venv/bin/python -m pytest backend/tests/test_optimizer_adapter.py backend/tests/test_joint_optimizer.py backend/tests/test_api.py -q
```

The final run's temporary servers were stopped afterward. No engine/adapter or
application defect was found, and no implementation correction was made.
**EE acceptance is complete for the tested local revision and captured scenarios.**
Richard's next step is to review this evidence, then perform the separately
authorized deployment and hosted acceptance of the accepted revision. Record
actual deployed SHAs and rerun the joint dashboard/What-if workflows there;
these local results do not establish hosted success. Existing one-hour,
same-day, interruptible/continuous equipment, grid-side EV, fixed HVAC/background
and hourly-versus-utility-billing-peak limitations remain unchanged.

The older `scripts/verify_joint_browser.cjs` and custom-profile browser script
still contain historical `joint_adapter_unavailable` assertions. They were not
used to claim this acceptance. Richard should update those obsolete expectations
before reusing them, or use this acceptance's new real-joint driver for local
reproduction. That is test-tool maintenance, not a numerical/application blocker.
