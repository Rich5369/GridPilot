# Final frontend readiness audit — November 2, 2026 (America/Chicago)

## Assessment and scope

Audited current `origin/main` at `761f006`, on dedicated branch `fix/frontend-hackathon-readiness`. The starting worktree was clean. No backend implementation, model, production configuration, architecture, chart library, or visual theme was changed. Existing Cloud Blue presentation was retained rather than redesigned before submission.

The existing frontend already has useful safeguards: saved onboarding/project inputs, explicit calculation submission, duplicate-submit guards, stale-response rejection, unknown/zero/negative financial states, evidence provenance, per-project warnings, overlap notices, EIA benchmark separation, infeasibility evidence, hourly demand charts, device schedules, and separate annual calculator/daily optimizer workflows. These were preserved. Browser storage saves input drafts and business context; calculation results and AI conversations remain session-only by design.

Production landing and health were reachable. Browser-origin health and deterministic LED requests to the production API returned HTTP 200 without CORS errors. Production source revision is not inferred from the local revision. Changed frontend acceptance was performed locally against the production build, not deployed.

PR #68 (`fix/startup-diagnostic-isolation`) was OPEN with no merge timestamp when checked. A successful warm health request does not establish cold-start latency or prove that PR deployed.

## Issues, severity, reproduction and fixes

| Severity | Reproduction and impact | Root cause / source | Implemented fix |
| --- | --- | --- | --- |
| P1 | Delay dashboard health response 35–45 seconds. After five seconds the previous UI said “Backend offline,” although the service could still be waking. Users were prompted to retry prematurely. | Five-second abort in `frontend/src/hooks/useBackendHealth.ts`; definitive status copy in `components/BackendStatus.tsx`. | One health request with a 60-second deadline. “Connecting” initially, “Backend waking up” after five seconds, then connected on success. Deadline/failure exposes explicit retry. No polling or automatic retries. Cleanup cancels timers and requests. |
| P1 | Enter Savings opportunities while the service sleeps; catalog fails at 12 seconds. Submit a calculation during startup; the previous 45-second calculation budget leaves little processing time after a 35–45-second wake. | `services/api.ts`, `services/savings.ts`, `components/ai/EnergyAssistant.tsx`. | Default health/catalog/generic API wait 60 seconds; optimizer and savings calculation 75 seconds; both AI interfaces 90 seconds. Existing valid optimizer timeout override remains honored. Reference environment examples/documentation updated, no deployed settings changed. POSTs are never automatically repeated. |
| P1 | Calculate an improvement with explicit annual expenses. Gross and net are visible, but expenses require reading raw JSON inside calculation details. | `components/savings/SavingsResults.tsx`. | Added “Incremental annual expenses” to the financial grid, directly from returned `inputs_used.annual_incremental_cost_usd`. Missing values stay unknown; explicit zero is $0.00. No new calculated output. |
| P2 / defer | The historical `scripts/verify_savings_frontend.cjs` expects an earlier landing/onboarding/navigation flow and fails locating Business name from the landing page. | Historical test selectors and entry route; not an observed product failure. | Kept historical evidence intact. Current existing savings-copy journey and new focused readiness scripts verify the current flow. Broader legacy script migration deferred. |
| P2 / defer | Lint reports two Fast Refresh export warnings in `CostBreakdown.tsx`; Vite reports a main chunk over 500 kB. | Existing exports / bundle structure. | Deferred architecture and code-splitting changes. Lint exits successfully; production build succeeds. |

No P0 product defect was found in the tested journeys. Failure messaging preserves existing results and inputs; longer wait budgets are client deadlines, not proof that a timed-out server operation stopped. Users must wait before manually resubmitting optimization/AI requests.

## Financial accuracy

`artifacts/hackathon-readiness/verification.json` records actual browser POST bodies, unchanged local backend JSON, DOM assertions, and four-width accessibility results. The built-in **Load synthetic LED example** reproduces the supplied A-led-complete arithmetic through the real backend; the external fixture file itself was unavailable.

| Backend field | Returned value | Frontend display |
| --- | ---: | --- |
| `annual_kwh_saved` | 12500 | 12,500.00 kWh/year |
| `annual_energy_charge_savings_usd` | 2500 | $2,500.00 USD/year |
| `annual_operating_cost_savings_usd` | null | Not included in this estimate |
| `inputs_used.annual_incremental_cost_usd` | 0 | $0.00 USD/year |
| `annual_net_savings_usd` | 2500 | $2,500.00 USD/year |
| `upfront_cost_usd` | 2500 | $2,500.00 USD upfront |
| `simple_payback_years` | 1 | 1.00 years |
| `annual_simple_roi_percent` | 100 | 100.00 % per year |

Inputs: 100 fixtures × (60−10) W / 1000 × 10 hours/day × 250 days/year = 12,500 kWh/year. Fictional customer-confirmed avoidable rate $0.20/kWh produces $2,500 gross; explicit annual expenses $0 yields $2,500 net; $2,500 upfront yields one-year simple payback. Omitted recurring non-energy benefits remain unknown/not included, not verified zero.

Existing browser verification also passed missing rate → unknown gross, explicit $3,000 annual expenses → −$500 net, and $2,500 annual expenses → $0 net. Material-input warnings, evidence details, profile persistence, equipment relevance choices, navigation, and Advisor open/close passed. Unit tests additionally check unsupported categories, exclusions, source validation, stale/mismatched responses, warnings, provenance and optional operating benefits. No portfolio total was added.

## Scheduling and simulation verification

`artifacts/final-simulation-data-2026-11-02/` is absent from the checkout, current main and fetched Git history. W01, O01, the 80-run dataset and the reported 8,546 checks could not be independently inspected. Their quoted outputs were not hardcoded into the app or described as reproduced. A clarification was requested while other verification continued.

`artifacts/hackathon-readiness/scheduling.json` contains full real local requests/responses from the existing editor: select Flexible equipment only or EV charging and flexible equipment; retain synthetic defaults except equipment availability 14:00–22:00. These are alternate fictional checks, not W01/O01.

| Scenario | Raw baseline USD/day | Raw optimized USD/day | Displayed reduction | Energy baseline → optimized | Peak baseline → optimized |
| --- | ---: | ---: | ---: | --- | --- |
| Non-EV flexible equipment | 18.080000000000002 | 17.120000100000002 | $0.96/day | 100.0 → 100.0 kWh | 10.5 → 7.5 kW |
| Joint EV + flexible equipment | 21.536 | 20.5760001 | $0.96/day | 128.8 → 128.8 kWh | 20.9 → 12.859999875000002 kW |

Browser checks compare baseline/optimized dollars, differences, peak reductions, daily kWh, and every baseline/optimized hourly table value against backend JSON. Real charts have visible curves, axes and usable geometry; device operating schedules render; results report feasible and backend plan verification passed. Non-EV request explicitly has an empty EV requirements list. Screenshots cover 1440, 768, 390 and 320 pixels.

Dollar formatting intentionally rounds to cents and suppresses negative zero; raw JSON retains solver tolerance. kW denotes power/peak; sums of the 24 one-hour power samples give daily kWh. Peak reduction is separate from dollars. Fixed/demand charges are excluded. Savings arise from timing under fictional prices, not lower consumption. No claim is made about outperforming a simple price-aware rule, realized bills or guaranteed savings. Annual improvements and daily optimization remain separate.

## Cold-start and recovery evidence

`verification.json` records two independent fresh production-build browser contexts with real elapsed 35,000 ms and 45,000 ms intercepted health delays. Each showed the waking message and disabled retry while pending, then connected automatically. Each sent exactly **one health GET and zero POSTs**. Business name and an employee-count edit of 43 survived in both live form state and saved business context.

A separate browser clock check advances through the 60-second health deadline, confirms unavailable/manual retry, and confirms one explicit retry reconnects without clearing the workspace. Unit fake-timer checks additionally confirm no health auto-retry for another 120 seconds after expiry. All browser AI endpoints are intercepted or blocked.

## Test commands and outcomes

Temporary browser tools were installed under `/tmp/gridpilot-browser-tools`; no application dependency changes. Local test backend startup disables provider diagnostics. Test-only preview CORS allows port 5300; production configuration was untouched.

```bash
# Unchanged local backend for opt-in unit HTTP tests and existing dev-browser journey
MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
npm run dev --prefix frontend -- --host 127.0.0.1

# Separate unchanged backend for local production preview
CORS_ORIGINS=http://127.0.0.1:5300,http://127.0.0.1:5173 MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
VITE_API_BASE_URL=http://127.0.0.1:8001 npm run build --prefix frontend
npm run preview --prefix frontend -- --host 127.0.0.1 --port 5300

npm test --prefix frontend
VITE_API_BASE_URL=http://127.0.0.1:8001 GRIDPILOT_LIVE_API=1 npm run test:integration --prefix frontend
npm run lint --prefix frontend
node --test scripts/browser-api.test.cjs

# Prefix each browser command with these tool-resolution variables:
export PLAYWRIGHT_MODULE=/tmp/gridpilot-browser-tools/node_modules/playwright
export AXE_MODULE=/tmp/gridpilot-browser-tools/node_modules/@axe-core/playwright
node scripts/verify_savings_copy.cjs
node scripts/verify_hackathon_readiness.cjs
node scripts/verify_hackathon_scheduling.cjs
node scripts/verify_hackathon_advisor.cjs
node scripts/verify_hackathon_production.cjs
```

- Final default frontend suite: **325 passed, 2 opt-in HTTP tests skipped** across 32 files. Separate real HTTP integration command: **2 passed**. Combined coverage: 327 passing tests. An earlier combined full run also passed all 327.
- Browser API helper tests: **1 passed**.
- TypeScript: `tsc -b` passes as part of production build; Vite production build passes.
- Lint: exits 0, two existing Fast Refresh warnings; Vite large-chunk warning remains.
- Current existing savings-copy browser journey: five check groups passed, three accessibility scans with zero violations, no page errors.
- Focused readiness: two real-delay startup cases, exact LED values, missing-rate handling, manual recovery; zero WCAG A/AA violations at all four widths; no page errors.
- Scheduling: real non-EV/joint HTTP responses and responsive demand/device views verified.
- Savings Advisor: mocked `source: meta` and `deterministic_fallback`, one request each, correct `/api/ai/savings/conversation` endpoint, unchanged business/equipment evidence and deterministic $2,500 net, readable long responses at 320px; no page errors.
- Production read-only browser: landing, health and real fictional LED calculation HTTP 200; no page errors or CORS failure. See `production.json`.

Initial unit run failed one hardcoded 45-second copy expectation after the intentional timeout change; expectation was updated. Initial focused browser harness runs exposed outdated selectors, collapsed-section assumptions and local preview CORS setup. Later HTTP reruns encountered connection refusal after background backend sessions ended; reruns keep the server alive for the complete test process. Final passing scripts reflect current navigation and use test-only CORS. The historical savings-frontend browser script remains incompatible and was not claimed passing. No paid Meta inference was performed. Existing numerical backend regression counts were not rerun or claimed as new results.

## Reproducible judge walkthrough

1. Open GridPilot. Explain: a business owner wants to lower electricity expenses but needs to know which improvements are worthwhile. Get started.
2. Enter a fictional Office business. Select **Find savings opportunities**, then **Continue**. This path needs no daily optimization or EV equipment.
3. Choose **Load synthetic LED example**. Explain that all fixtures, prices and costs are fictional. Show 100 fixtures, 60 W → 10 W, 10 hours/day, 250 days/year, $0.20/kWh, $0 explicit annual expenses, $2,500 upfront.
4. Select **Calculate savings**. Show 12,500 kWh/year, $2,500 modeled annual net savings, one-year payback. Expand **How this was calculated** for assumptions and provenance. Do not add individual project estimates together.
5. Expand **Help me find opportunities** and ask a relevant follow-up. A real provider-backed demo should use a team-approved provider session; automated acceptance used mocks only. If unavailable, show labeled standard guidance and keep deterministic results visible.
6. Use a separate **example workspace** (`#example/configuration`) to keep scheduling assumptions clearly fictional. Choose **Flexible equipment only**, set equipment availability 14:00–22:00, retain remaining synthetic defaults, and select **Calculate energy plan**. Open **Energy plan → Results and equipment**. This alternate checked example shows $18.08 → $17.12/day, unchanged 100 kWh, and 10.5 → 7.5 kW peak. Inspect baseline/optimized charts, hourly table and device timeline. These are energy charges only, not a complete bill. W01’s $19.76 → $18.48 demonstration is pending the missing fixture and must not be substituted or claimed reproduced.
7. Explain practical value: relevant opportunities, deterministic dollars, transparent evidence, understandable schedules and next actions. Timing savings depend on the baseline and fictional prices; simpler scheduling rules may achieve the same cost.

## Backend handoff and remaining limits

No new backend calculation defect was established; no backend code or equations were changed. Backend developer follow-up: confirm merge/deployment status and production effect of PR #68, and supply the simulation directory/branch for exact W01/O01 replay. These are verification dependencies, not proven new backend bugs. Deployment with an existing explicit `VITE_OPTIMIZATION_TIMEOUT_MS` override retains that override; the frontend default change does not modify hosting settings.

The new frontend is ready for PR review based on the listed acceptance evidence, with exact external-dataset replay outstanding. No merge or deploy is authorized by this report.
