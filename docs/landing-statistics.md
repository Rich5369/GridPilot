# Landing energy statistics

Adds the requested three values immediately below the existing steps, in one light Cloud Blue container. The original hero, photograph, background gradients, buttons, steps and routing are retained. Short desktop spacing is reduced to accommodate the row; mobile supports scrolling and narrow screens stack the values. The exact fictional-simulation footnote is a keyboard accessible native disclosure containing the populations and W01 context.

## Baseline and scope

Fetched `origin/main` at `e910dee` into an isolated checkout; branch `feature/landing-energy-statistics`. Reviewed merged PRs #68 (optional startup diagnostics), #69 (frontend cold starts and annual expenses), and #70 (reconciled health recovery and timelines), plus recent landing/theme PRs #59, #60 and #63. Latest PR search returned #70, with no open PRs or newer changes. Preserved all unrelated dirty workspace files, including the supplied `References` archive. Only `Welcome.tsx` and `landing.css` change application behavior. No backend, dashboard, setup, savings, advisor, API, storage, routing, dependency or deployment changes.

## Evidence and limits

The simulation bundle is absent from fetched main, but the supplied workspace contains `References/final-simulation-data-2026-11-02.zip`. Inspected this actual archive, checked all 223 manifest entries (no hash mismatches), and matched its optimizer source fingerprints to pinned repository commit `761f006493b6abc0a53f1f6674c1c3d734bed68a`. The archive's source and scenarios are fictional; this verification reaggregates recorded outputs and does not claim new solver execution or actual customer savings. Original screenshots for the statistics were not attached; the requested exact numbers/labels and existing landing design guide this change.

Committed source rows: [simulation_summary.csv](../artifacts/landing-statistics/simulation_summary.csv). Provenance, archive/CSV SHA-256 and results: [evidence-verification.json](../artifacts/landing-statistics/evidence-verification.json).

| Display | Evidence calculation | Population |
| --- | --- | --- |
| 3.81% | Mean nonempty `eligible_savings_percent` = 3.807724111302798% | 67 valid, defined percentage comparisons |
| $4.12 | Mean nonempty `eligible_savings_usd` with `has_controllable_loads == True` = $4.122146282926832/day | 41 valid controllable-load comparisons |
| 6.48% | W01: ($19.76 − $18.4800001) / $19.76 × 100 = 6.477732287449392% | One modeled warehouse, zero EVs, valid immediate-start baseline |

Zero reductions are retained; undefined percentages and invalid-baseline comparisons are excluded. The first two values describe different populations. W01 is a selected example, not an aggregate. Costs cover modeled daily energy charges, not full utility bills. No annualization, customer-data calculation, guarantees or independent-check marketing statistic is added.

## Validation

- Frontend: 327 tests pass; 2 existing opt-in HTTP integration tests skipped. TypeScript and production build pass. Lint passes with two existing CostBreakdown Fast Refresh warnings; Vite retains its existing bundle-size advisory. Logs are in `artifacts/landing-statistics/`.
- Production-build Chromium acceptance: desktop 1366×768, 1440×900 and 1920×1080; tablet 768×1024; mobile 390×844 and 320×568. Desktop fits without scrolling; no horizontal overflow. The unchanged photograph retains a desktop height above 350px.
- Exact copy and section order, both header/hero Get started and Learn more routes, saved setup draft retention, keyboard disclosure, enlarged text, no page errors, and WCAG A/AA scans at 1366/390/320px.
- Health is stubbed and AI requests blocked during browser acceptance. No live calculation or Meta call is claimed.
- Reproduce after building and starting `npm run preview -- --host 127.0.0.1 --port 5174`: `PLAYWRIGHT_MODULE=<playwright-module-path> AXE_MODULE=<axe-playwright-module-path> node scripts/verify_landing_statistics.cjs` from repository root. QA packages are installed separately in `/tmp`; project dependencies are unchanged.

[Browser results](../artifacts/landing-statistics/verification.json) · [Desktop screenshot](../artifacts/landing-statistics/1366.png) · [Mobile screenshot](../artifacts/landing-statistics/390.png). All viewport screenshots are in the same directory. The powerline PNG SHA-256 remains `3ff8f7586dd260586d1d83a36609a981c999d9189b87dc50f599bad0f493e377`; photo CSS and background rules are unchanged.

No automatic merge or deployment is authorized.
