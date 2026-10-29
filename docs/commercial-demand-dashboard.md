# Commercial electricity demand dashboard

This feature is stacked on PR #21 (`feature/custom-demand-profile`, commit 5b06c1d).
PR #20 is merged (c716bec) and is an ancestor. PR #21 was open when work began.
No optimizer, joint adapter, backend contract, or Meta integration files are changed.

## Categories and representation

The six optional fixed-demand source profiles are heating/cooling/ventilation,
lighting, refrigeration, computers/electronics, kitchen/water heating, and other
building equipment. These group the end uses described by [EIA's 2018 CBECS
methodology](https://www.eia.gov/consumption/commercial/reports/2018/estimated-end-use.php):
heating, cooling, ventilation, lighting, refrigeration, computing, office equipment,
cooking, water heating, and other uses. EIA informs labels only; no national shares,
individual-building estimates, or hourly shapes are inferred.

`ScenarioEditor.demandProfile` selects `demo`, `custom`, or `sources`. Each named
source contains a category and 24 user-entered hourly-average kW values. Sources
start at zero, require explicit input, and can be removed. Empty, negative,
nonfinite, duplicate, unsupported, wrong-length, or overflowing aggregates are
rejected. Named profiles replace the combined profile. `fixedDemand` sums each
hour once; `toScenario` sends only the existing `fixed_demand_kw[24]` contract.
Neither names nor editor metadata enter backend payloads. Mode switches preserve
custom and named entries independently. What-if snapshots preserve them through
immutable updates and the existing Restore flow.

Custom combined demand stays combined/unallocated. The original fictional demo
retains its known heating/cooling/ventilation component and unallocated background.
Fixed equipment cannot be optimized. Vehicle charging is optional (zero chargers);
shiftable equipment uses the existing contract (zero duration means zero energy).
Whole-site meter readings must exclude loads modeled separately to avoid double counting.

## Chart audit and changes

The previous default stacked four area series plus a total line, with a categorical
00:00–23:00 axis. The new default shows total demand as a thin `stepAfter` line
and subtle fill, with a dashed building limit. A numeric 0–24 axis and a repeated
closing sample extend the last plateau to 24:00. The closing sample never enters
energy calculations or the 24-row table. There are no smoothed curves.

Breakdown is a separate view with native checkbox toggles, stable colors and
hourly numeric values. Hidden sources change only the visible subtotal. Draft
fixed-demand previews show actual entered source profiles and explicitly exclude
uncomputed vehicle/equipment schedules. Backend results compare baseline and
optimized totals with the submitted scenario limit. The result contract has no
per-source optimized schedules, so no optimized breakdown is invented.

Tooltips show hourly ranges and kW, support Recharts arrow-key navigation, and
have responsive width limits. Tables and controls work from the keyboard. kW is
power; hourly kW × 1 hour is kWh; USD values remain electricity energy charges.
Existing overview demo provenance, cost metrics, and result staleness warnings remain.

## Numerical evidence

Real HTTP responses and submitted payloads are retained in
[commercial-result.json](verification/commercial-result.json) and
[commercial-profile-regression.json](verification/commercial-profile-regression.json).

| Case | Energy kWh | Baseline USD | Optimized USD | Baseline peak kW | Optimized peak kW |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original demo | 128.8 | 20.576 | 20.5760001 | 23.9 | 14.059999875 |
| Custom combined profile | 151.8 | 24.096 | 24.0960001 | 21.9 | 11.709999875 |
| Lighting 2 kW + refrigeration 1 kW, no EV, existing 6 kWh equipment | 78 | 12.24 | 12.24 | 6 | 6 |

The browser scripts independently recompute energy, tariff-weighted cost and peak;
check energy conservation, fixed-load lower bounds and demand-limit compliance;
and verify exact payload arrays, with tolerance 1e-6. Small solver tolerances
above are retained rather than presented as savings.

## Verification

- Frontend suite: 74 tests passed; opt-in integration test run separately and passed.
- TypeScript and production build passed.
- Lint: no errors or new warnings; two existing Fast Refresh warnings in CostBreakdown.
- Original custom-profile browser regression: demo unchanged; custom values and validation;
  independent What-if payloads, Apply/Restore, stale results; EV-only; real joint
  503 dependency error; infeasible result and reset; 1440/768/390px; no page errors.
- Commercial browser suite: named sums and payloads, zero-EV real optimizer, numeric
  consistency, source toggles, keyboard chart tooltip, table, stale results,
  What-if/Apply/Restore, responsive layouts and screenshots; no page overflow/errors.
- HTTP health and real feasible/infeasible integration checks passed.

Use the unchanged backend with `CORS_ORIGINS=http://127.0.0.1:5176` on port 8006,
frontend with `VITE_API_BASE_URL=http://127.0.0.1:8006` on port 5176, and an external
Playwright installation:

```sh
NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_commercial_browser.cjs
NODE_PATH=/tmp/gridpilot-browser/node_modules GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5176 node scripts/verify_demand_profile_browser.cjs
VITE_API_BASE_URL=http://127.0.0.1:8006 GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration
```

## Screenshots

- [Before](screenshots/commercial-before.png)
- [After: total demand](screenshots/commercial-after-desktop.png)
- [After: source breakdown](screenshots/commercial-after-breakdown.png)
- [After: backend comparison](screenshots/commercial-after-result.png)
- [Tablet total](screenshots/commercial-total-768.png), [mobile total](screenshots/commercial-total-390.png)
- Named-source configuration: [desktop](screenshots/commercial-sources-1440.png),
  [tablet](screenshots/commercial-sources-768.png), [mobile](screenshots/commercial-sources-390.png)

## Dependencies and scope

Merge PR #21 first, then retarget this stacked PR to main if necessary. Joint
scheduling still depends on shaJ46's adapter and reports `joint_adapter_unavailable`.
The present result contract supports total-only optimized comparisons. Per-source
optimized schedules would require an engineering-owned contract extension.
No merge or deployment is performed.
