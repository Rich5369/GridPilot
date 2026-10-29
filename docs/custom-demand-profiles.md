# Custom single-day fixed demand

## Contract and semantics

Implemented on main `c716bec`, including merged PRs #19 and #20. `backend/models/contracts.py` already accepts `fixed_demand_kw`: exactly 24 finite, nonnegative hourly-average kW values. No schema, backend, simulator, optimizer, joint adapter, AI provider or infrastructure change is needed or included.

The default remains the original 1.5 kW background plus predetermined HVAC vector. Custom values **replace** that combined vector. `toScenario` never adds demo background or HVAC to custom values. Each value includes all fixed building loads, including HVAC; separately configured EVs and flexible equipment must be excluded. Whole-site meter readings require those separately modeled loads to be subtracted first. Manual values are labeled user-configured and unverified, not meter measurements. Operating hours remain metadata and do not reshape the profile.

EV energy, equipment energy, tariffs, site limit and scheduling mode are unchanged by profile selection. The compact editor starts from demo values, shows fixed-load energy and peak, and expands via a native keyboard-operable disclosure to 24 labeled numeric inputs. Invalid/blank/nonfinite/negative values block optimization; zero and fractional kW are allowed. Switching to demo retains custom entries within the draft; Reset to Default Scenario clears custom entries.

## Integration and provenance

`ScenarioEditor` carries optional UI-only profile mode and string values so incomplete input can be validated before conversion. Missing profile state means demo, preserving existing fixtures. `ScenarioField` identifies scalar fields separately from the nested profile. Serialization converts only validated custom values to the existing API field; profile metadata is never added to the request schema.

Immutable array updates preserve original/current/alternative snapshots. Both main optimization and What-if use the same adapter and validation. Existing JSON snapshot keys include profile changes, marking the main result stale and hiding outdated What-if comparisons. Apply and Restore retain all 24 values and profile mode. Source labels distinguish current draft inputs, submitted optimizer inputs, fictional overview charts, and returned optimizer results. Error-only comparisons do not claim a calculated result. No backend simulation or measured-data claim is introduced.

## Files

- `frontend/src/components/configuration/DemandProfileEditor.tsx`: shared compact profile editor, explanations, summaries and inline errors.
- `frontend/src/components/configuration/ScenarioPanel.tsx`: current profile editor and updated fixed-demand guidance.
- `frontend/src/components/dashboard/WhatIf.tsx`: alternative editor and returned-result provenance.
- `frontend/src/data/demoScenario.ts`: validation, fixed-demand selection and API conversion.
- `frontend/src/types/dashboard.ts`: nested profile state and scalar-field type.
- `frontend/src/pages/Dashboard.tsx`: draft/submitted provenance and accurate mode help.
- `frontend/src/index.css`: responsive profile layout.
- `frontend/src/data/demoScenario.test.ts`, `frontend/src/pages/Dashboard.test.tsx`: default behavior, custom payload, invalid values/length, staleness and snapshot regressions.
- `scripts/verify_demand_profile_browser.cjs`: real local Chromium/API numerical and workflow verification.

## Verification

- Frontend: **69 unit/component tests passed**, one opt-in HTTP test skipped in the normal suite.
- Opt-in real HTTP integration: **1 passed** against the unchanged backend.
- Existing backend API/optimizer/What-if acceptance tests: **80 passed**, one dependency deprecation warning.
- TypeScript/production build: passed. Lint passed with the two existing `CostBreakdown.tsx` Fast Refresh export warnings.
- Focused Chromium script verifies unchanged demo results; keyboard select/disclosure; all 24 values submitted exactly with other request fields unchanged; blank/negative input blocking; retention while switching profiles; independent baseline recomputation and optimized cost/peak/energy conservation; stale result indication; independent What-if payloads, Apply/Restore; custom data preserved across mode changes; expected missing-joint-adapter 503; infeasible null output; reset; 1440/768/390 layouts with no page errors or horizontal overflow.
- Existing What-if Chromium regression suite passed real paired scenarios, numerical differences, invalidation, Apply/Restore, validation, sequential requests/loading/503 and mobile overflow.

The tested custom profile is `2 + hour × 0.25` kW. Fixed energy is 117 kWh; with unchanged configured EV/equipment energy, baseline and optimized total energy are 151.8 kWh. Baseline energy charge is $24.096 with 21.9 kW peak. Optimized charge is $24.0960001 with 11.709999875 kW peak; the $1e-7 objective tolerance is expected, and displayed savings are $0.00. This demonstrates real scheduling calculations without inventing energy savings.

### Reproduce local browser verification

Use the existing frontend dependencies and an external Playwright installation as for other repository browser scripts. Start the backend with the matching local CORS origin, then the frontend with its API URL:

```sh
CORS_ORIGINS=http://127.0.0.1:5175 python -m uvicorn backend.main:app --host 127.0.0.1 --port 8002
```

```sh
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8002 npm run dev -- --host 127.0.0.1 --port 5175
```

After the backend is ready, run from the repository root:

```sh
NODE_PATH=/tmp/gridpilot-browser/node_modules GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5175 node scripts/verify_demand_profile_browser.cjs
```

Screenshots and verified request/result JSON default to `/tmp/gridpilot-demand-qa`; set `GRIDPILOT_QA_OUTPUT` to change that path. Checks are local acceptance only, not production acceptance.

## Limits and next steps

One building-local day, 24 one-hour averages and one aggregate fixed-demand vector; no HVAC/background breakdown for custom values, subhourly meter peaks, timestamps, DST, overnight windows or automatic disaggregation. Custom values stay in session state and are not saved across reloads. The existing overview remains explicitly fictional; it is not recalculated from custom inputs. The joint adapter remains a separate shaJ46 dependency.

Next: scenario persistence/export and a validated meter-import workflow with interval/unit/timezone handling and explicit removal of separately modeled loads. A result-specific accessible hourly table and a profile preview can follow independently of solver mathematics.
