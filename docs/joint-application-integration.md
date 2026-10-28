# Joint scheduling application integration — dependency pending

Review branch: `feature/joint-application-integration`, based on main `f3ef3d5`.
PR #12 (`7bda639`) already supplies the joint engine, fixtures and independent
engineering verification. Those implementations were inspected and preserved.
Remote main, recent PRs, all published repository branch heads and the repository
fork list were checked on October 28, 2026. The advertised adapter extension was
not present: `backend/optimizer/interface.py` still accepts only `scenario`.
No accessible adapter branch or PR dependency could be identified.

The exact missing dependency is shaJ46's shared, verified energy-only adapter:
`optimize_scenario(scenario, optimize_flexible=True)`. This integration does not
recreate that adapter or the optimizer. Joint numerical acceptance is incomplete.

## API and dashboard behavior

`POST /api/optimize?scheduling_mode=ev_only` (also the omitted-mode default) keeps
the Scenario body, OptimizationResult response and worker-thread execution.
`POST /api/optimize?scheduling_mode=joint` calls the extended adapter with
`optimize_flexible=True` when available. Until then it returns sanitized HTTP 503
with `detail.code=joint_adapter_unavailable`. Unknown modes return HTTP 422.
Feasible/proven-infeasible responses and existing sanitized failure mappings are
preserved; browser timeout handling is unchanged.

The dashboard defaults to EV-only and sends mode explicitly. Results retain their
submitted scenario and mode; mode changes clear the ordinary result and invalidate
both What-if results, including pending responses. What-if uses the same mode in
both sequential submitted snapshots. Apply/restore actions do not change mode.
The result label identifies the submitted mode; input edits still mark results stale.

Joint equipment is interruptible and continuously adjustable within its allowed
window while delivering required energy. It is not a guaranteed uninterrupted
machine cycle. Background and HVAC stay fixed. Shared costs are daily energy-only
USD. Aggregate demand, consumption and peak remain distinct; no equipment schedules
were added. Negative-zero formatting remains intact.

AI actions are visibly disabled in joint mode because the existing explanation
path recomputes EV-only optimization. EV-only AI behavior is preserved. Ordinary
optimization and What-if require no Meta credentials.

## Changed files

- `backend/api/routes.py`: validated mode dispatch and explicit missing dependency.
- `frontend/src/services/api.ts`: mode type, labels, explicit query and error text.
- `frontend/src/pages/Dashboard.tsx`: mode control, snapshots, invalidation and AI guard.
- `frontend/src/components/dashboard/WhatIf.tsx`: mode in both snapshots and freshness identity.
- Corresponding API, client, Dashboard and WhatIf tests: focused integration regressions.
- `scripts/verify_joint_http.py`: existing joint fixtures through real HTTP; exit 2 for missing adapter.
- `scripts/verify_joint_browser.cjs`: local browser checks and exact submitted-input capture.

Pre-existing edits to Meta smoke files, frontend/.gitignore and .vscode were preserved
and are outside this integration.

## Local verification

- Backend suite: 203 passed, one existing Starlette deprecation warning.
- Frontend suite: 54 passed, one live integration test skipped; production build passed.
- Frontend lint passed with two existing CostBreakdown fast-refresh warnings; diff whitespace check passed.
- Existing `scripts/verify_optimizer_http.py`: three real HTTP demonstrations matched
  independent direct optimizer metrics.
- `scripts/verify_joint_http.py`: omitted/explicit EV-only and invalid modes checked
  for all three joint fixtures. Recovery/infeasible were EV-only infeasible and price
  shift EV-only feasible. Every joint request returned the explicit dependency 503;
  the script exited 2. Joint numerical checks did not pass and were not bypassed.
- `scripts/verify_joint_browser.cjs`: passed against local Vite and FastAPI. Captured
  exact UI Scenario and EV-only mode, compared returned cost/peak to independent
  direct OR-Tools solve, checked mode labels, result invalidation, dependency error,
  and two sequential joint What-if requests. Capture: `/tmp/gridpilot-joint-browser.json`.
  Joint requests were real HTTP requests but did not run a joint solve.
- Mocked regressions cover adapter keyword dispatch, late responses, mode propagation,
  and sanitized solver failures. These are not joint numerical acceptance.

## Final engineering acceptance for shaJ46

1. Publish the adapter extension and provide its branch/PR. Inspect and incorporate it
   on this integration branch. Confirm daily energy-only fields and independent
   verification are preserved; do not substitute detailed-engine operating costs.
2. Replace the temporary missing-adapter regression with joint fixture adapter/API
   regressions. Remove the signature availability guard once the dependency is required.
3. Run `backend/.venv/bin/python -m pytest backend/tests -q`, `npm --prefix frontend test`
   and `npm --prefix frontend run build`.
4. Start `backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`
   and `npm --prefix frontend run dev -- --host 127.0.0.1` in separate terminals.
5. Run `backend/.venv/bin/python scripts/verify_joint_http.py`. Require exit 0:
   recovery EV-only infeasible, joint 28 kWh/$5.60/3 kW; price shift EV-only $7.90,
   joint $7.30, both 26 kWh; joint infeasible retains reasons/null optimized fields.
   Cost tolerance is 2e-7 USD; energy and peak tolerance 1e-6. Do not compare optimal arrays.
6. Update the browser script's temporary dependency-error assertions to expect real
   joint results. Capture the exact UI scenario and joint mode, compare cost, peak,
   total energy and feasibility to an independent extended-adapter call. Verify
   joint What-if snapshots, stale results and AI guard. Run
   `NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_joint_browser.cjs`
   with Playwright available outside product dependencies. Keep the product fixed
   profiles; the small engineering fixtures are not UI defaults.
7. Review the diff and prepare the dependent PR. No merge or deployment settings
   changes are authorized here. Local verification is not deployed acceptance.
