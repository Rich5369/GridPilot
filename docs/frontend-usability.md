# Frontend usability and synchronization

## Repository assessment

- Initial checkout: `feature/savings-opportunities` at `903f509c66f0ab4577a58ab7e06f8d12f83505f1`; clean working tree. Local-only commits on unrelated branches were preserved.
- Fetched implementation base: `origin/main` at `8dd6c3f99e8b57b403de7711618dd645d904acdb` (merged #55). New branch: `feature/frontend-usability`.
- No AGENTS.md files found in the workspace or parent checkout. No backend source, schemas, dependencies or provider settings changed.
- GitHub inventory: all 56 PRs, obtained with `gh api --paginate repos/Rich5369/GridPilot/pulls?state=all&per_page=100`; 55 merged, one open, no drafts or closed-unmerged PRs. Connector search independently returned #1–#56.
- Reviewed descriptions and changed-file metadata for the current savings/onboarding/persistence work, current implementations and local merged changes for #38–#55, and the actual open #56 patch. Historical unrelated provider diagnostics were inventoried without reviewing every diff.
- #45 supplies hash navigation and browser-local input retention; #47 supplies non-EV analysis and AM/PM onboarding; #48–#55 supply current savings APIs, applicability, recurring benefits, plausibility warnings and frontend forms. These are already incorporated through main and reused.
- #49 merged into `feature/business-savings-engine`, rather than main directly; its integration subsequently reached main via #48/#50. It was not treated as an independent main merge.
- Only open overlap/dependency: #56, backend ROI overflow handling. Its null ROI and warning fields fit the existing frontend consumer. No frontend overlap; not merged or cherry-picked here. Until released, extreme tiny positive upfront costs can still fail in the serving backend; entered evidence and explicit retry remain available.

## Changed journeys

- Landing retains the approved building image and navy/teal design. Basic business context now includes a two-path starting goal before engineering inputs. Savings opens immediately without a daily solve, including when hourly inputs are incomplete. Daily planning retains all existing building/flexible/EV/combined selections and time validation.
- Four primary destinations: Overview, Savings opportunities, Energy plan, My building. Energy plan contains Inputs, Results and equipment, and What-if views. All previous hashes remain supported; `#energy-plan` and `#my-building` are aliases. Advisor is a labeled header action; market information is under My building.
- Overview presents one next-step area before a result, explicit pending/error/stale/infeasible states, three summary measures after success, and one hourly demand chart with baseline, optimized demand and site limit. Detailed analytics, schedules, provenance and evidence remain in Results and equipment. Invalid baselines do not produce overview cost-difference claims.
- Savings uses a short introduction, editable building summary, improvement picker, relevant existing forms and Calculate savings. Optional help is collapsed; meaningful assumptions remain under How this was calculated. Missing inputs get a contextual action. Separate projects, ranking, exclusions, unknown values, provenance, safety confirmations and backend calculations remain intact. The Savings component stays mounted after first visit so session results and entered evidence survive primary navigation.
- My building summarizes context, provides editing, equipment/rate inputs and secondary market access. Browser storage scope stays explicit.
- `#example` (and `#example/<view>` detail hashes) opens an offline checked synthetic joint-plan snapshot without replacing the user's saved workspace or making a calculation/AI call. It includes submitted inputs, aggregate results, device schedules and verification status. The saved snapshot has no backend result identifier. An explicit new calculation clears the example result before requesting the real service; a failed request cannot silently substitute the example.
- Demand charts now have visible Chart/Table controls. Tables include the site limit beside the same hourly demand values.

## Storage compatibility

The existing version-1 shape gains only optional `startGoal: savings | planning`. The validator accepts older records unchanged and rejects invalid added values. Legacy step numbers and the energy/goals/review sequence remain unchanged. No destructive migration is needed; absent goals retain the previous planning behavior. Results, result IDs and conversations are not persisted. Unsupported/corrupt records retain the existing explicit recovery flow.

## Example provenance

`frontend/src/data/examplePlan.json` was generated with the existing local `backend.api.routes.optimize` function and joint solver at the recorded main backend tree. The backend reported `verification_status: passed`. A frontend fixture test checks the exact default-editor scenario, runtime response validator, submitted operating-plan association, cost arithmetic and absence of result ID. Assumed prices are $0.12/kWh off peak and $0.28/kWh from 2 PM through 8 PM; no market date or customer tariff is claimed. The existing annual LED example keeps its original fictional rate dates.

## Validation

- `npm test --prefix frontend -- --maxWorkers=2`: **314 passed, 2 skipped** across 32 files. The two skipped cases are opt-in live API tests, run separately below.
- `GRIDPILOT_LIVE_API=1 npm run test:integration --prefix frontend`: **2 passed**, actual local HTTP feasible/infeasible EV and joint results and deterministic insights.
- `npm run lint --prefix frontend`: passes; two pre-existing CostBreakdown Fast Refresh warnings.
- `npm run build --prefix frontend`: passes, including `tsc -b`; no separately configured typecheck script. Existing large-main-chunk advisory remains.
- Fixture/contract checks: saved-workspace validation and legacy records; savings API, missing/zero/negative evidence, fallback, errors and stale responses; checked example response/operating-plan association; baseline comparison regression; legacy navigation aliases.
- Browser verifier: `scripts/verify_frontend_usability.cjs`; final results and screenshots in `artifacts/frontend-usability/`. Uses real local savings/optimizer HTTP, explicitly injected 503/offline states and AI route interception. Offline preview and failed-real-calculation checks confirm that a saved example is never substituted for an unsuccessful request. Four targeted axe WCAG scans (goal selection, annual result, mobile savings, example) returned zero violations; desktop/mobile screenshots were inspected. It does not call Meta.
- Read-only public probes on 2026-11-01: frontend HTTP 200 (0.112 s); catalog HTTP 200 (1.149 s). First health probe timed out at 45 s; a later probe returned `{"status":"ok","project":"GridPilot"}` HTTP 200 (0.149 s). No cause inferred and no persistent outage claimed. Web page-reader access failed; these probes used curl.
- `git diff --check`: passes. Main was fetched again before delivery and remained `8dd6c3f`; #56 remained the only open PR.

This is local frontend acceptance, with limited read-only public probes. It does not establish the serving backend SHA, production journey acceptance or genuine Meta acceptance. No merge or deployment was performed.

## Complete PR inventory

| PR | State | Base | Title |
|---|---|---|---|
| [#56](https://github.com/Rich5369/GridPilot/pull/56) | Open | `main` | Fix savings ROI overflow with explicit null and warning |
| [#55](https://github.com/Rich5369/GridPilot/pull/55) | Merged | `main` | Integrate Savings opportunities frontend with verified non-EV journeys |
| [#54](https://github.com/Rich5369/GridPilot/pull/54) | Merged | `main` | Add savings input plausibility and operating-evidence warnings |
| [#53](https://github.com/Rich5369/GridPilot/pull/53) | Merged | `main` | Include documented recurring operating-cost savings in financial estimates |
| [#52](https://github.com/Rich5369/GridPilot/pull/52) | Merged | `main` | Fix savings conversation event-loop blocking |
| [#51](https://github.com/Rich5369/GridPilot/pull/51) | Merged | `main` | Fix savings category reasoning-token exhaustion with low effort |
| [#50](https://github.com/Rich5369/GridPilot/pull/50) | Merged | `main` | Integrate Meta Savings Advisor with equipment applicability safeguards |
| [#49](https://github.com/Rich5369/GridPilot/pull/49) | Merged | `feature/business-savings-engine` | Integrate evidence-gated savings conversations with Meta Advisor |
| [#48](https://github.com/Rich5369/GridPilot/pull/48) | Merged | `main` | Add deterministic business energy savings recommendation engine |
| [#47](https://github.com/Rich5369/GridPilot/pull/47) | Merged | `main` | Support non-EV businesses and calculate the dashboard from setup |
| [#46](https://github.com/Rich5369/GridPilot/pull/46) | Merged | `main` | Reject uncertain and conflicting employee-count evidence |
| [#45](https://github.com/Rich5369/GridPilot/pull/45) | Merged | `main` | Complete browser workspace retention, navigation and verified result views |
| [#44](https://github.com/Rich5369/GridPilot/pull/44) | Merged | `main` | Publish setup-first GridPilot website and cohesive dashboard redesign |
| [#43](https://github.com/Rich5369/GridPilot/pull/43) | Merged | `main` | Audit backend accuracy and fix validation, grounding and EIA recovery |
| [#42](https://github.com/Rich5369/GridPilot/pull/42) | Merged | `main` | Reduce advisor reasoning budget pressure and handle incomplete replies safely |
| [#41](https://github.com/Rich5369/GridPilot/pull/41) | Merged | `main` | Diagnose rejected Meta completions and guard cost attribution |
| [#40](https://github.com/Rich5369/GridPilot/pull/40) | Merged | `main` | Make Energy Advisor contextual with exact-result grounding |
| [#39](https://github.com/Rich5369/GridPilot/pull/39) | Merged | `main` | E2: expose verified numerical infeasibility evidence |
| [#38](https://github.com/Rich5369/GridPilot/pull/38) | Merged | `main` | Correct analytics graph shapes using original hourly samples |
| [#37](https://github.com/Rich5369/GridPilot/pull/37) | Merged | `main` | Redesign analytics with thin hourly comparison lines |
| [#36](https://github.com/Rich5369/GridPilot/pull/36) | Merged | `main` | E1: verified device operating timeline and engineering results |
| [#35](https://github.com/Rich5369/GridPilot/pull/35) | Merged | `main` | Add EIA monthly commercial retail electricity-price map |
| [#34](https://github.com/Rich5369/GridPilot/pull/34) | Merged | `main` | Redesign GridPilot Energy Command Center and market explorer |
| [#33](https://github.com/Rich5369/GridPilot/pull/33) | Merged | `main` | Add grounded conversational GridPilot Energy Advisor |
| [#32](https://github.com/Rich5369/GridPilot/pull/32) | Merged | `main` | R2: add deterministic energy insights to submitted scenarios |
| [#31](https://github.com/Rich5369/GridPilot/pull/31) | Merged | `main` | R1.1: fix sidebar contrast, scheduling assumptions and submitted hourly inputs |
| [#30](https://github.com/Rich5369/GridPilot/pull/30) | Merged | `main` | Expose verified device-level operating plans from the same solve |
| [#29](https://github.com/Rich5369/GridPilot/pull/29) | Merged | `main` | Make the energy dashboard scenario-centric and result-first |
| [#28](https://github.com/Rich5369/GridPilot/pull/28) | Merged | `main` | Refresh current project documentation and engineering demo |
| [#27](https://github.com/Rich5369/GridPilot/pull/27) | Merged | `main` | Record focused hosted joint scheduling acceptance |
| [#26](https://github.com/Rich5369/GridPilot/pull/26) | Merged | `main` | Refresh real joint integration verification after adapter merge |
| [#25](https://github.com/Rich5369/GridPilot/pull/25) | Merged | `main` | Record final joint application EE acceptance |
| [#24](https://github.com/Rich5369/GridPilot/pull/24) | Merged | `main` | Fix blank demand charts caused by zero-width CSS constraint |
| [#23](https://github.com/Rich5369/GridPilot/pull/23) | Merged | `main` | Expose verified joint optimization through shared adapter |
| [#22](https://github.com/Rich5369/GridPilot/pull/22) | Merged | `main` | Add commercial demand sources and redesign hourly demand charts |
| [#21](https://github.com/Rich5369/GridPilot/pull/21) | Merged | `main` | Add custom hourly fixed-demand profiles |
| [#20](https://github.com/Rich5369/GridPilot/pull/20) | Merged | `main` | Clarify configuration, optimization and results workflow |
| [#19](https://github.com/Rich5369/GridPilot/pull/19) | Merged | `main` | Fix frontend What-if restore, responsive layout and browser verification |
| [#18](https://github.com/Rich5369/GridPilot/pull/18) | Merged | `main` | Prepare joint scheduling API and dashboard integration pending adapter |
| [#17](https://github.com/Rich5369/GridPilot/pull/17) | Merged | `main` | Diagnose Meta credential identity and direct model access |
| [#16](https://github.com/Rich5369/GridPilot/pull/16) | Merged | `main` | Report accessible Meta models in opt-in diagnostic |
| [#15](https://github.com/Rich5369/GridPilot/pull/15) | Merged | `main` | Diagnose Meta API failures with bounded background probes |
| [#14](https://github.com/Rich5369/GridPilot/pull/14) | Merged | `main` | Add opt-in Meta model access diagnostic at startup |
| [#13](https://github.com/Rich5369/GridPilot/pull/13) | Merged | `main` | Add sanitized Meta provider diagnostics |
| [#12](https://github.com/Rich5369/GridPilot/pull/12) | Merged | `main` | Add optional joint EV and flexible-equipment scheduling |
| [#11](https://github.com/Rich5369/GridPilot/pull/11) | Merged | `main` | Fix negative-zero display in What-if differences |
| [#10](https://github.com/Rich5369/GridPilot/pull/10) | Merged | `main` | Verify What-if engineering tradeoffs and document acceptance |
| [#9](https://github.com/Rich5369/GridPilot/pull/9) | Merged | `main` | Add business what-if scenario comparison |
| [#8](https://github.com/Rich5369/GridPilot/pull/8) | Merged | `main` | Integrate Meta Model API with reviewed proposals and solver-grounded explanations |
| [#7](https://github.com/Rich5369/GridPilot/pull/7) | Merged | `main` | Support hosted optimizer verification and record acceptance results |
| [#6](https://github.com/Rich5369/GridPilot/pull/6) | Merged | `main` | Verify optimizer integration through HTTP and browser |
| [#5](https://github.com/Rich5369/GridPilot/pull/5) | Merged | `main` | Connect FastAPI to real optimizer and harden dashboard requests |
| [#4](https://github.com/Rich5369/GridPilot/pull/4) | Merged | `main` | Implement verified OR-Tools EV charging optimization |
| [#3](https://github.com/Rich5369/GridPilot/pull/3) | Merged | `main` | Implement tested commercial building baseline simulator |
| [#2](https://github.com/Rich5369/GridPilot/pull/2) | Merged | `main` | Build interactive commercial energy dashboard (Phase 2) |
| [#1](https://github.com/Rich5369/GridPilot/pull/1) | Merged | `main` | Set up GridPilot frontend and backend foundation |


## Before and after

Previously, a first-time business encountered scheduling choices before selecting a task, seven primary navigation items, multiple empty result areas, and a large overview advisor. Now savings-first can evaluate annual equipment improvements immediately; daily planning is an explicit second path; the overview offers a focused next action and one demand chart. Detailed evidence remains reachable without dominating the initial task.

## Main files

`frontend/src/App.tsx`, `pages/Setup.tsx`, `pages/Dashboard.tsx`, `components/dashboard/Overview.tsx`, `components/dashboard/Comparison.tsx`, `components/DemandChart.tsx`, `components/savings/{SavingsOpportunities,SavingsMeasureForm,SavingsResults}.tsx`, `services/{navigation,workspaceStorage}.ts`, `types/workspace.ts`, `data/examplePlan.json`, `product-design.css`, associated tests, and the browser verifier.

## Handoff for Richard (prepared, not sent)

Frontend usability work is on `feature/frontend-usability`, based on main `8dd6c3f` through #55. It adds goal-led savings/planning paths, four primary sections, a focused overview, simpler annual improvement forms, and an offline verified example without changing backend contracts, optimizer math or provider settings. Local frontend and real non-AI API checks pass; production journey acceptance remains yours to coordinate. #56's backend ROI overflow correction remains independent and unmerged here; nullable ROI and per-project warnings are already compatible. Please confirm the actual serving backend revision before hosted acceptance. No merge, deployment or paid AI request was performed.
