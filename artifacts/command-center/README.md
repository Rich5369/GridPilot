# Command Center verification

Local acceptance on October 30, 2026. See [design, contracts and market assessment](../../docs/energy-command-center.md).

| Check | Result |
| --- | --- |
| Frontend Vitest | 101 passed; 2 opt-in HTTP cases skipped here, run separately below |
| TypeScript + production build | Passed (`npm run build`, includes `tsc -b`) |
| Lint | Passed; two pre-existing `only-export-components` warnings in CostBreakdown |
| Backend pytest | 276 passed; one installed Starlette/httpx deprecation warning |
| Real local HTTP integration | 2 passed, feasible/infeasible and EV/joint insight reconciliation |
| Existing R1.1 Chromium regressions | Passed; custom/named profiles, light/dark preference, viewport sizes, numerical checks, stale snapshots, What-if Apply/Restore |
| Existing R2 Chromium regressions | Passed; cost ranking, capacity, independent What-if outcomes, infeasible evidence |
| Retained advisor Chromium regressions | Passed; multi-turn messages, profile editing/provenance, clarification, Apply/Compare, keyboard, 1440/768/390. Explicit mocks; not hosted inference acceptance |
| Command Center Chromium | Passed; real EV/joint KPI costs/peaks, unavailable markets, keyboard operator selection, advisor collapse/error, stale and infeasible cards |
| axe WCAG 2 A/AA | Zero violations at 1440, 1024, 768, 390px in submitted-result Overview |
| Page errors / horizontal overflow | None in tested flows at requested widths |

Raw test logs, R1.1/R2 numerical evidence and `verification.json` are retained.
Axe results are targeted automated checks, not a claim of exhaustive WCAG certification.
Local API uses actual OR-Tools optimization. Provider error presentation is explicitly
intercepted with HTTP 503; no Meta request is represented as successful hosted inference.
The map supports unavailable data only, so live/stale/demo market acceptance is not
applicable to this MVP. No unavailable device-level contract is reconstructed.

## Screenshots

- Before: [desktop](before/desktop.png), [mobile](before/mobile.png)
- After: [1440px](after/overview-1440.png), [1024px](after/overview-1024.png), [768px](after/overview-768.png), [390px](after/overview-390.png)
- States: [no result](after/desktop-draft.png), [EV-only](after/desktop-ev_only.png), [joint](after/desktop-joint.png), [infeasible](after/mobile-infeasible.png), [advisor unavailable](after/mobile-advisor-unavailable.png)
- Retained advisor polish: [desktop conversation](advisor/desktop-conversation.png), [mobile conversation](advisor/390-conversation.png). Presentation mocks only.

The reference's dark surfaces, teal accents, geography-led composition and right
advisor are reflected in the final desktop capture. The real product has only 24
hourly scenario values and a single workspace. It intentionally does not replicate
the reference's fictional national live-price cloud, multi-site identity, monthly
savings or prior-period trends. Detailed numerical evidence makes the page taller
than the illustrative reference. Optimization remains directly accessible through
its existing destination and the Run action takes users straight to results.

## Reproduce

From the isolated checkout, install normal frontend/backend dependencies and run
Vite on 5187 and FastAPI on 8000 with CORS allowing localhost/127.0.0.1:5187.
Install Playwright and `@axe-core/playwright` outside production dependencies.

```sh
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
python -m pytest backend/tests -q
GRIDPILOT_LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 npm --prefix frontend run test:integration
NODE_PATH=/tmp/gridpilot-qa/node_modules node scripts/verify_command_center.cjs
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5187 NODE_PATH=/tmp/gridpilot-qa/node_modules node scripts/verify_r11_browser.cjs
GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5187 NODE_PATH=/tmp/gridpilot-qa/node_modules node scripts/verify_r2_browser.cjs
ADVISOR_URL=http://localhost:5187 PLAYWRIGHT_MODULE=/tmp/gridpilot-qa/node_modules/playwright node scripts/verify_advisor_polish.cjs
```

The restricted process sandbox initially blocked local sockets and stalled the
in-process TestClient run. Actual checks above completed outside that restriction.
No credentials or production configuration were changed. No deployment or merge.
