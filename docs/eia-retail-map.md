# EIA commercial retail map: release candidate

Prepared October 30, 2026 for the November 4 hackathon. This branch is `feature/eia-commercial-retail-map`, created directly from `origin/main` (`337aefb`). No wholesale feature commit, observation, screenshot, log, fixture or derived ISO dataset was imported. Nothing has been pushed, submitted as a PR, merged or deployed.

## Recommendation and alternatives

Publish the EIA monthly commercial retail view alongside a price-free wholesale directory, after the user's publication review. Keep the complete wholesale implementation private while pursuing permissions separately.

| Approach | Useful functionality | Rights and deadline assessment |
|---|---|---|
| Withhold uncleared wholesale observations | Seven operator markers, geographic context, official source links | Smallest change; useful directory but no numerical prices. This remains available in the candidate. |
| Separate EIA commercial retail view | All 50 states and D.C., state-average price map, dated detail panel, same-month prior-year comparison | Recommended. Explicit EIA reuse policy supports reuse of its numeric data. No registration/key; no changes to optimizer tariffs. Monthly lag is clear. |
| Obtain wholesale display permissions | Could restore the preserved hub/node observations and histories | Best eventual operational context, but permission timing before November 4 is unknown. Written downstream rights must cover public display, charts, caching and API access; software licenses and free API access are insufficient. No requests were sent, accounts created, or services purchased. |

## Source permissions and meaning

[EIA's Copyrights and Reuse policy](https://www.eia.gov/about/copyrights_reuse.php) permits reuse/distribution of EIA data and requests acknowledgment with the publication date. It excludes protected third-party materials and reserves its logos. This implementation extracts only EIA's numerical state/sector table and reporting metadata. It does not copy EIA logos, images, photos, charts or third-party assets. The choropleth uses GridPilot's existing state paths, unchanged from main. Attribution links to the data and reuse policy and includes October 23, 2026, the actual publication date.

The source is [Electric Power Monthly Table 5.6.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a). Its HTML and spreadsheet downloads returned actual data without authentication; the implementation uses only the HTML table, avoiding spreadsheet dependencies. This is a public report download, not an API-key bypass. No API key, proxy, paid service, account registration or EIA logo is required.

[EIA explains](https://www.eia.gov/tools/faqs/faq.php?id=507&t=5) that retail prices are calculated as revenue divided by electricity sales and include delivered-electricity costs. They are not individual utility rates. Commercial state averages differ from wholesale hub prices, marginal energy rates, retail tariff schedules, bills and measured savings. The UI states that distinction explicitly. This is an identified permission basis for the EIA numeric content, not a blanket legal opinion on unrelated data or assets.

The current report covers **August 2026**, released **October 23, 2026**, with **August 2025** comparison values. All 51 state/D.C. commercial observations were present. Current-year estimates are preliminary and subject to revision. EIA's page lists the next release as November 24, 2026; August data is therefore useful dated context for November 4, not an hourly dispatch signal or a forecast. No territories, utility territories or individual facility prices are implied.

## Implementation

`GET /api/retail-prices` supplies the Commercial sector, `cents/kWh`, reporting month, comparison month, publication date, actual successful source-check time, status and 51 named area records. It has a separate route/schema from optimization and wholesale observations.

The adapter validates the table identity, unit label, Commercial header grouping, month/year columns and release dates before reading prices. It ignores census/regional/national totals. Missing/suppressed/invalid state prices stay unavailable; it never fills them using another sector, another state, last year's value or invented data. Duplicate/incomplete layouts or global parsing failures trigger a dated saved-release fallback. A regressed report cannot replace the bundled newer release. Source HTML is never rendered in the frontend.

Refreshes have an eight-second total asynchronous deadline, three-second connection limit and six-second HTTP-operation limits. Decompressed download size is capped at 1 MB. A six-hour cache and lock coalesce callers and cache failures too: at most four public report requests/day/worker under continuous demand, excluding restarts and explicit audit requests. There is no background harvesting. An individual state's missing price is gray/unavailable while other states remain usable.

`backend/eia/commercial_snapshot.json` is a reviewed numerical snapshot extracted from the real public report, with original publication and successful-check metadata. It is not generated demo data. It keeps the view usable across cold starts when outbound access is unavailable. Runtime successful refreshes stay in memory; they do not write deployment files. Failed refreshes use the last successful in-memory release or the packaged EIA snapshot and explicitly label it Saved release. More than 62 days since publication is labeled Older release. No fetch or fallback changes the reporting month to today's month, and no status says Live.

The frontend defaults to State retail averages. It reuses the premium dark map layout and geometry, colors states by retail price bands, supports mouse/keyboard selection and an accessible state/D.C. menu, and displays cents/kWh plus the equivalent dollars/kWh. The comparison is explicitly the same month in the previous year; it is not a synthetic continuous trend. The separate Wholesale market directory is main's unchanged component with an additional permission-withholding notice. It has no numerical observations and makes no wholesale-provider requests.

No diff in solver, simulator, scenario contracts, tariff editor/serialization, or optimizer service code. Browser requests in EV-only and joint modes retained the original tariff array. State selections do not set any scenario inputs. There is no apply-price action, measured utility-bill savings claim, or mixing of wholesale $/MWh with retail cents/kWh.

## Preservation and publication audit

The prior `/tmp` checkout was absent at the start of this task. Both saved patches were reapplied in a separate persistent clone with original author/committer dates, reproducing the exact commits **02abb75** and **3cef14a** on `feature/verified-market-prices` at `/workspaces/GridPilot/.market-private-preserved`. A verified complete-history bundle is retained at `/workspaces/GridPilot/artifacts/local-only-market-preservation/wholesale-preserved.bundle`. These locations contain uncleared material and are **local-only: do not publish or import them into this candidate**. No original commit was rewritten or discarded.

The release clone at `/workspaces/GridPilot/.eia-retail-release` was independently cloned from GitHub main. The wholesale commit objects are absent from that clone; its new history is based solely on main. New tracked assets are EIA numeric data and code/tests/docs. Existing market geometry and the price-free directory remain byte-for-byte main assets. No files from private market artifacts, patches or bundles were copied into the candidate. Build output, browser evidence and temporary downloads are not added to its Git history. Source tests use only EIA numeric content or synthetic retail parser records, never ISO fixtures.

Before any later push, re-fetch main, repeat the history/tree/artifact audit, inspect the complete staged diff and confirm no generated build/evidence or private nested clone is staged. Push only the EIA branch from its independent clone after the user's publication decision, not the primary workspace or wholesale branch. This task does not authorize an automatic push or PR.

## Render compatibility

No dependencies, environment variables, credentials, build/start commands or production settings were changed. The adapter uses existing HTTPX/Pydantic and Python stdlib; no GridStatus, pandas or spreadsheet reader was added. `asyncio.timeout` needs Python 3.11+, already used by existing diagnostics. Actual Render Python version/commands/plan remain unverified because this repository has no blueprint or runtime pin establishing the service configuration.

Data paths are resolved relative to the backend module, so the snapshot is packaged with source and does not depend on the working directory or persistent disks. Application import does not access EIA; fetching occurs only on the retail endpoint. Cold starts with blocked outbound access use the packaged, explicitly dated release. [Render's free-service documentation](https://render.com/docs/free) describes idle spin-down and lost runtime state; the immutable bundled fallback survives source redeployments. Multiple workers each have their own cache. No keepalive, paid cache, plan upgrade or production connectivity diagnostic was configured.

The local no-auth EIA endpoint refresh succeeded; the first local HTTP endpoint response was 200 in **0.280 seconds**. A read-only deployed Render health request timed out after 15 seconds; this is not proof of provider failure or a diagnosis of Render networking. No Render-origin EIA request ran, so outbound/WAF/TLS behavior on that service remains unknown. The retained snapshot reduces that dependency for the hackathon. An authorized maintainer can later run the same bounded EIA fetch from the existing Render shell without changing settings or deploying. The app must continue showing Saved release if that fails.

## Verification and maintenance

- Backend regressions: **289 passed**, one existing Starlette/HTTPX deprecation warning. These are main's tests plus EIA-specific tests; the private wholesale tests were not imported.
- Frontend: **103 passed**, two existing skipped integration tests. TypeScript/build pass; lint has no errors and two pre-existing CostBreakdown fast-refresh warnings.
- Real browser: desktop/mobile map, all area records present, checks of selected states/D.C./Alaska/Hawaii against actual HTTP values, keyboard selection, both optimizer modes, identical tariffs, no wholesale fetches, saved-release and unavailable cases, no page errors. Focused WCAG 2 A/AA axe scan of the new explorer: zero violations.
- Adapter tests: Commercial versus Residential columns, wrong units/layout, suppressed/nonfinite/negative values, missing state coverage, future publication, regressed report, concurrent cache callers, expiration, source failure/cold fallback, publication age, total deadline and oversized source response.
- No push, PR, merge or deployment.

Run `python -m pytest backend/tests -q`; `npm --prefix frontend test`; `npm --prefix frontend run build`; `npm --prefix frontend run lint`. For real browser checks run backend on 8021 with local CORS for frontend 5191 and `VITE_API_BASE_URL=http://127.0.0.1:8021`; install Playwright only in a test environment, then `node scripts/verify_eia_retail.cjs`. Browser evidence defaults to `/tmp/eia-browser-evidence`, outside the Git tree.

Refresh the packaged release after an EIA publication using `python -m scripts.refresh_eia_snapshot`; review the EIA-only diff before committing. This command refuses a regressed/incomplete snapshot and never touches ISO feeds. Runtime refresh remains independent of that maintenance step.
