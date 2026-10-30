# Hosted joint scheduling: focused EE acceptance

**Hosted functional acceptance PASS, with deployed-revision provenance qualified.**
The EE implementation and PR #25 local acceptance remain complete. The tested
public application also passes the bounded joint API/dashboard/What-if checks
below. Exact commits served by the public frontend alias and backend could not
be independently confirmed; do not attribute the hosted results to local HEAD.

## Workspace and target provenance

The working tree was clean. Remote references were fetched, local main was
fast-forwarded to `6d21fae295eb52ddcfafa40d610e693473c90b05`, and work continued
on `test/hosted-joint-acceptance` from that revision. PR #25 was the newly
incorporated merge relative to the previous feature tip. PRs #23/#24/#25 are
all present; there were no open PRs or newer merged changes when checked.
Existing feature branches were preserved.

A subsequent refresh for the repeated acceptance request found main still at
`6d21fae` (HEAD and origin/main identical) and a new open PR #26,
`test/joint-browser-adapter-regressions` at `ad00debc4fe95a2a1ea015912b95553d9b4a0b9a`.
That PR refreshes local browser verifiers/evidence and adds a backend URL option
to `verify_joint_http.py`; it changes no product implementation or deployment.
It was inspected but not merged, cherry-picked or approved. Its HTTP-checker
option overlaps this workspace's verifier improvement and should be reconciled
when those tool changes are reviewed. The completed hosted checks were reused,
not rerun: there was no new merged application revision. Saved hosted capture
checksums and PASS outcomes were revalidated; unfinished local work was preserved.

Before publishing this acceptance PR, PR #26 merged at
`e2ab615291a7a4483b2bf357868250ee49818b5c`. The branch was fast-forwarded to that
main revision with pending work preserved. The overlapping HTTP checker changes
were reconciled, retaining PR #26's existing URL option, target output and
assertion guard alongside the focused probes and evidence-output options.
The hosted observations/reference SHA below remain those actually tested before
this documentation/tooling-only merge; no deployed revision was inferred from
the newer branch HEAD and no acceptance campaign was repeated.

- **Frontend:** https://gridpilot-weld.vercel.app — matches the repository
  homepage and returned HTTP 200. Served entry asset
  `/assets/index-DuQV5lTW.js` embeds the Render origin below. Actual captured
  browser optimization requests used that same backend.
- **Backend:** https://gridpilot-api-1tpf.onrender.com — public health returned
  HTTP 200 with `{"status":"ok","project":"GridPilot"}`; the actual joint
  requests described below ran successfully.
- Served frontend configuration contains a **90,000 ms** optimizer budget.
  Browser waits allowed that budget plus UI completion; no timeout configuration
  was changed. Standalone API probes retained the verifier's 45-second budget.
- GitHub reports successful `Vercel – gridpilot` and `Vercel – gridpilot-frontend`
  statuses for `6d21fae`, with deployment dashboard links in
  [provenance evidence](verification/hosted-joint-provenance.json). However, these
  statuses do not establish which commit the canonical public alias served.
  GitHub's deployments endpoint returned no entries; public backend health
  supplies no revision. **Both served commit SHAs remain unconfirmed.**
  Served script hashes are recorded as observed assets, not as Git provenance.

The hosted browser capture ran October 29, 2026, 18:15:44–18:15:51 CDT. Local
`6d21fae` is solely the independent engineering reference revision. No local build
was run or substituted for the hosted frontend.

## Four bounded hosted API checks

Existing `joint_demonstration_configs()` supplied complete Scenario bodies;
no DOM/editor snapshots were invented for these API-only fixtures. Real responses
are in [hosted HTTP evidence](verification/hosted-joint-http.json).

| Fixture / requested mode | Actual result | Optimized kWh | Energy USD | Peak kW | Request time |
| --- | --- | ---: | ---: | ---: | ---: |
| `joint_recovery` / joint | Feasible | 28 | 5.600000000 | 3 | 140 ms |
| Same recovery body / EV-only | Infeasible, reasons and null optimized fields | null | null | null | 84 ms |
| `joint_price_shift` / joint | Feasible | 26 | 7.300000100 | 2.999999667 | 55 ms |
| `joint_infeasible` / joint | Infeasible, reasons and null optimized fields | null | null | null | 34 ms |

All four requests returned HTTP 200. Mode-dependent recovery confirms the hosted
service honors EV-only versus joint selection. Response schemas, baseline arrays
and metrics, tariff-weighted charges, actual peaks, optimized energy, site caps
and fixed-demand lower bounds match direct adapter results within **1e-6 kW/kWh**
and **$2e-7**. Costs remain daily energy-only USD; the $1e-7 peak tie-break allowance
explains the price-shift result. No timeout, cold-start failure or retry occurred.
These timings do not guarantee future cold-start performance.

## One representative hosted browser workflow

The actual public UI was configured from PR #25's complete named-source snapshot:
lighting 2 kW plus refrigeration 1 kW at every hour; two 14.4 kWh EVs, each at
most 7.2 kW in [15,22); equipment 6 kWh, at most 3 kW in [10,16); $0.28/kWh
in [14,20), otherwise $0.12; joint mode; current cap 25 kW and alternative cap
15 kW. All other submitted controls match PR #25. These are manually entered
QA inputs, not meter measurements.

Three genuine browser POSTs were captured: the ordinary dashboard run, then
sequential current/alternative What-if requests. All use `scheduling_mode=joint`
and all are feasible. The exact transmitted current body equals the accepted
PR #25 body; editor-to-payload conversion and independently summed named sources
agree. The 3 kW fixed vector replaces the demo and does not contain EV/flexible
energy, which is added exactly once. No optimized named-source allocations are
inferred from the aggregate response.

| Submitted scenario | Baseline kWh / energy USD / peak kW | Optimized kWh / energy USD / peak kW |
| --- | --- | --- |
| Dashboard and What-if current, 25 kW | 106.8 / 20.304 / 17.4 | 106.8 / 15.696000100 / 17.399999688 |
| What-if alternative, 15 kW | 106.8 / 20.304 / 17.4 | 106.8 / 16.464000100 / 14.999999687 |

- Alternative minus current is **+$0.768**, approximately **−2.4 kW**, and
  **0 kWh**; the actual display is **$0.77, −2.40 kW, 0.00 kWh**. Tightening
  the cap raises cost, rather than producing an energy savings claim.
- Each scenario's separate baseline benefit is correct: about $4.608 current
  and $3.840 alternative, displayed as $4.61/$3.84. Displayed peaks and energy
  match their own current/alternative responses.
- Charts have visible screen-space SVG/curve dimensions and axes at 1440 px
  and 390 px. All 24 displayed chart-table rows match response vectors at
  the displayed two-decimal precision. Screenshots:
  [desktop](screenshots/hosted-joint-whatif-feasible-1440.png) and
  [mobile](screenshots/hosted-joint-whatif-feasible-390.png).
- Editing the dashboard input marks its old result stale. Editing the
  alternative hides the prior pair. Changing mode clears the dashboard result
  and hides What-if results; switching back does not revive the old pair.
  No earlier input/mode result is used as a new comparison result.
- No page errors, settled horizontal overflow, request timeout or retry occurred.
  The bounded hosted run did not repeat Apply/Restore, all local profiles or the
  complete local acceptance campaign; those remain covered by PR #25 evidence.

## Independent engineering checks and evidence

[Browser captures](verification/hosted-joint-browser.json) retain complete actual
bodies, query modes, responses, DOM-derived submitted input/profile snapshots,
displayed benefits/tables, chart geometry, served script hashes and staleness
checks. [Numerical verification](verification/hosted-joint-numerical-checks.json)
is tied to the browser JSON by checksum and records direct solver results.
Deployment SHA fields are deliberately null; `localEngineeringReferenceCommit`
identifies only the independently invoked local engine.

For every captured browser request, the same Scenario/mode was passed to the
existing adapter. HTTP aggregates match direct feasibility, baseline, energy,
energy-only cost and peak. Summed demand, tariff arithmetic and maxima are correct;
all recorded discrepancies in these comparisons were zero at stored precision.
Existing direct solver/evaluator functions independently verified EV/flexible
energy equality, windows/exclusive deadlines, power bounds, shared capacity and
fixed-profile preservation. Those per-item schedules belong to independent local
solves, not to a decomposition exposed by HTTP. The direct solves proved primary
and secondary optima; the HTTP contract reports feasible only. Equivalent optimal
arrays are not required to be identical.

There were no hosted solver failures in this sample. Proven infeasibility is
represented by reasons/null optimized values, not fabricated costs. No claim is
made that hosted 500/503 failure paths were newly fault-injected. The existing
model assumptions and failure regressions remain those accepted locally.

## Focused verification-tool changes

No optimizer, adapter, simulator, frontend, API, Meta or production settings
changed. Existing verifiers needed small reusable target/output options because
their prior URLs and output filenames were hardcoded to localhost/local evidence:

- `verify_joint_http.py`: explicit origin, optional four-probe scope and separate
  JSON output; one bounded timeout retry is allowed and recorded. Existing local
  default mode checks remain unchanged. Schema/direct/arithmetic checks apply to
  the focused probes; Python assertion disabling is rejected.
- `verify_joint_application_browser.cjs`: explicit frontend/backend/output and
  screenshot paths, optional representative-pair scope, hosted asset capture and
  unknown deployed SHAs instead of local provenance. Hosted output guards prevent
  overwriting PR #25's local capture/screenshots. Local defaults remain intact.
- `verify_joint_application_captures.py`: separate input/output arguments with
  a guard against writing hosted results into PR #25's local numerical report.

The actual hosted runs above verify the new paths. JavaScript syntax and diff
whitespace checks passed. Negative checks reject an API URL with `/api` appended
and hosted input without a separate numerical output. PR #25's report/capture/
numerical evidence checksums are unchanged; its screenshots are unchanged.
No full local suites or complete local screenshot collection were rerun. Tool
improvements and hosted evidence are prepared for review; product implementation
is unchanged.

Reproduction (existing Python dependencies, external Playwright with Chromium):

```bash
backend/.venv/bin/python scripts/verify_joint_http.py --base-url https://gridpilot-api-1tpf.onrender.com --focused --output docs/verification/hosted-joint-http.json
NODE_PATH=/tmp/gridpilot-browser/node_modules GRIDPILOT_FRONTEND_URL=https://gridpilot-weld.vercel.app GRIDPILOT_BACKEND_URL=https://gridpilot-api-1tpf.onrender.com GRIDPILOT_CAPTURE_OUTPUT=docs/verification/hosted-joint-browser.json GRIDPILOT_SCREENSHOT_PREFIX=hosted-joint GRIDPILOT_PAIR_ONLY=1 node scripts/verify_joint_application_browser.cjs
backend/.venv/bin/python scripts/verify_joint_application_captures.py --input docs/verification/hosted-joint-browser.json --output docs/verification/hosted-joint-numerical-checks.json
```

**No deployment or application blocker was found in the tested hosted workflow.**
Richard's remaining provenance action is to confirm the actual revision behind
the canonical Vercel alias and the running Render service using his deployment
metadata. Successful public behavior confirms joint functionality, but cannot
establish the exact deployed SHAs. No deployment, merge, approval, production
setting change or unrelated Meta investigation was performed.
