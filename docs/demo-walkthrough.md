# GridPilot: engineering demo and speaker notes

Suggested length: **2–3 minutes for the engineering segment**, after preparing
the inputs below. This is a rehearsal plan, not an official competition/video
requirement. It explains implemented and accepted behavior without new features
or another verification campaign.

## Prepare before speaking

Use the [public dashboard](https://gridpilot-weld.vercel.app), or the local setup
in [README](../README.md). Open **Scenario configuration** and select scheduling
mode **EV + flexible equipment**. Choose **Named fixed-demand sources**, then
**Add Lighting** and **Add Refrigeration**. Expand each source and fill all 24
hours, not only the first hour. Set every control to the accepted values:

| UI control | Exact input |
| --- | --- |
| Opening / closing | 8 / 18 (metadata; does not generate a demand profile) |
| Site power limit | 25 kW |
| Lighting / Refrigeration | 2 / 1 kW in every interval [0,24) |
| Off-peak / peak price | $0.12 / $0.28 per kWh |
| Peak start / end | 14 / 20 |
| Active chargers | 2 |
| Power per charger / energy per EV | 7.2 kW / 14.4 kWh |
| Arrival / completion deadline | 15 / 22 |
| Equipment maximum power / full-power duration | 3 kW / 2 h, giving 6 kWh required |
| Equipment available from / until | 10 / 16 |

Sources describe immutable building demand only: **3 kW**, not a whole-site
profile already containing the EVs/equipment. Their sum replaces the demo profile.
All windows use exclusive end hours. Do not use Energy overview as a solver-result
screen; it is labeled fictional demo data. AI is not needed for this demo.

The complete reference editor and Scenario are `sources-dashboard` in the
[hosted capture](verification/hosted-joint-browser.json); the local counterpart
is in [PR #25 captures](verification/joint-application-captures.json). Values below
come from those full-precision responses, not from rounded screen labels.

## Presentation sequence

| Time | Exact action / what to point at | Speaker cue |
| --- | --- | --- |
| 0:00–0:30 | Show the joint selector, 3 kW fixed-source summary, EV and equipment windows. | “Our task is to deliver all required charging and equipment energy within availability and power limits, while keeping the building below its cap.” |
| 0:30–1:15 | Select **Run optimization**. In **Optimization**, point to baseline/optimized costs, then the two demand curves. | “The baseline starts loads as soon as possible. The optimizer changes when eligible loads run. It delivers the same 106.8 kWh, with energy charges falling from $20.304 to about $15.696: approximately $4.61 for this modeled day.” |
| 1:15–2:10 | Open **What-if scenarios** → **Create alternative from current**. Change only alternative **Maximum building demand** to **15**, then **Compare both scenarios**. Point to each scenario's consumption and peak, then the bottom differences. | “A tighter cap keeps the same work and 106.8 kWh. Peak falls from about 17.4 to 15 kW, but cost rises by about $0.77. This is a cost-versus-capacity tradeoff, not reduced energy consumption.” |
| 2:10–2:40 | Show the [recorded local infeasible result](screenshots/joint-ee-whatif-infeasible-1440.png), pointing to solver reasons and unavailable optimized values. | “With a 2 kW cap, fixed demand alone is already 3 kW. No schedule can satisfy that request. We return reasons and no optimized cost or savings.” |
| 2:40–3:00 | Return to the feasible comparison; identify the evidence links and your ownership. | “I implemented the simulator, scheduling constraints, solver adapter and independent numerical checks. The dashboard and API present those verified engineering results.” |

The infeasible **2 kW cap / 3 kW fixed-demand** example was accepted **locally**
in PR #25, not included in the bounded hosted named-source run. To reproduce it
in a local rehearsal, change only alternative limit to **2** and compare; current
remains feasible, alternative has reasons/null optimized values and no between-
scenario differences. Set the alternative back to **15** and compare to restore
the presentation view. Do not describe the screenshot as a hosted observation.
Hosted API acceptance separately verified an infeasible shared-window fixture.

## Numbers to understand, not memorize as rounded calculations

| Quantity | Accepted current, 25 kW cap | Accepted alternative, 15 kW cap |
| --- | ---: | ---: |
| Total optimized energy | 106.8 kWh | 106.8 kWh |
| Baseline daily energy charge | $20.304 | $20.304 |
| Optimized daily energy charge | $15.6960001 | $16.464000100000003 |
| Optimized hourly peak | 17.3999996875 kW | 14.999999687499992 kW |
| Own baseline cost reduction, displayed | $4.61 | $3.84 |

Both baselines peak at **17.4 kW**. The alternative's uncontrolled baseline
exceeds its 15 kW cap, while its optimized schedule satisfies it. The bottom
comparison is **alternative minus current**: raw cost difference
`0.7680000000000042` USD and peak difference `-2.4000000000000075` kW, displayed
as **$0.77, −2.40 kW, 0.00 kWh**. Those are separate from each scenario's own
baseline benefit. Do not subtract rounded screen costs to establish precision.

Hand calculation: fixed demand uses 3 × 24 = **72 kWh**. EVs require 2 × 14.4 =
**28.8 kWh**, and equipment requires 3 × 2 = **6 kWh**; total **106.8 kWh**.
At a 25 kW cap the EV work fits in cheap hours [20,22). At a 15 kW cap, cheap
headroom is (15 − 3) × 2 = **24 kWh**, leaving **4.8 kWh** at the higher price.
That adds 4.8 × (0.28 − 0.12) = **$0.768**. All required work is still delivered.
The reported approximately $1e-7 cost allowance comes from the separate peak
tie-break; it is not extra useful work or a guaranteed utility saving.

## Short engineering script to rehearse

“I built the baseline simulator and the electrical scheduling model. The baseline
represents uncontrolled operation: EVs charge on arrival, and equipment starts
at its earliest available hour. In joint mode, the optimizer can move EV charging
and eligible equipment within their windows. Background demand and HVAC stay fixed.

“Every load must receive its exact required energy. Each hour has power bounds,
and all loads together must fit under the building cap. Electricity can cost
less at different times, so we can reduce charges without claiming fewer kWh.

“Here we deliver 106.8 kWh in both scenarios. The 25 kW case reduces modeled
daily energy charges by about $4.61. Tightening the cap to 15 kW lowers peak
power but costs about $0.77 more. A cap below fixed demand is impossible, so the
application shows reasons and unavailable optimized values.

“I also independently check the returned energy, windows, power, capacity, cost
and peak. The Python adapter connects this verified model to Richard's API and
dashboard. These are hourly, single-day planning results, not guaranteed monthly
bills. Our recorded local and bounded hosted engineering checks passed.”

## Five likely technical questions

1. **How can cost fall while energy stays the same?** We shift required work to
   lower-price hours. The tariff-weighted sum changes; delivered kWh does not.
2. **What can the optimizer move?** Default mode moves EVs. Joint mode also moves
   interruptible, continuously adjustable equipment. Neither changes fixed
   background/HVAC or guarantees an uninterrupted machine cycle.
3. **How are requirements enforced?** One hourly power variable per movable item,
   exact energy equalities, zero outside its window, bounded power and a shared
   building-cap constraint. Negative prices cannot authorize overcharging.
4. **How do you trust a solver result?** Existing independent evaluators recompute
   physical constraints, cost and peak. Checks use 1e-6 kW/kWh and $2e-7 tolerances;
   the peak tie-break permits $1e-7 above primary optimum. Equivalent optimal
   schedules can differ. HTTP feasibility alone is not an optimality proof.
5. **Does AI determine feasibility or savings?** No. Meta proposes reviewed edits
   and helps explain engine facts in the implemented EV-only workflow. The solver
   computes results; joint-mode AI is currently disabled. An unresolved/error
   result remains a failure, not a proof of infeasibility or zero-cost success.

Important limits: one abstract 24-hour day, one-hour averages, exclusive same-day
windows, no overnight/DST scheduling, grid-side EV energy at 100% efficiency and
no discharge. There are no startup/minimum-runtime, uninterrupted-cycle or HVAC
thermal-comfort constraints. Hourly peak is not necessarily utility billing
demand. Shared cost fields are energy-only, excluding fixed/demand charges/taxes;
do not extrapolate into guaranteed monthly or annual savings.

## Evidence and remaining team handoff

The [local report](joint-ee-application-acceptance.md) supports profiles,
Apply/Restore, infeasibility and desktop/mobile behavior. The
[hosted report](hosted-joint-ee-acceptance.md) supports the public named-source
dashboard/What-if results above, chart tables and stale/mode invalidation. HTTP
captures expose aggregates; per-equipment constraints were checked through
independent local solves using the exact captured inputs. Exact served frontend
and backend commits were **not confirmed** during hosted acceptance.

- **Richard:** confirm actual deployed frontend/backend SHAs and the genuine
  hosted Meta sequence: interpretation → reviewed Apply → explicit optimization
  → explanation, using EV-only mode. Record current outcomes and genuine source
  evidence; a historical basic inference success or mock label does not establish
  the whole workflow. [The newer diagnostic report](meta-render-diagnostic.md)
  records a successful local basic probe and historical Render errors, not a
  current hosted status. No credential access/provider calls are needed here.
- **shaJ46:** present the accepted engineering results and their limitations;
  no additional optimizer feature or verification campaign is needed for this talk.
- **Team:** supply the final project description, contributor roles, demo/video
  links, required attributions and confirmed submission requirements/timing. These
  details are not established by engineering evidence; this guide invents no
  competition deadline, official video duration or successful live AI demonstration.
