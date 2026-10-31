# GridPilot

GridPilot is a commercial electricity cost advisor. Its deterministic business
savings backend calculates supported annual energy and financial scenarios from
explicit evidence; Meta selects investigation categories, while calculators
remain authoritative. The [savings integration guide](docs/meta-savings-integration.md)
is the canonical backend handoff. The frontend savings journey and genuine
post-PR #51 production Meta acceptance remain release gates.

GridPilot also plans one day of commercial-building electricity demand using a
deterministic baseline simulator, OR-Tools GLOP optimizer, FastAPI and a React
dashboard. EV-only scheduling is the default; explicit joint mode also schedules
eligible flexible equipment. Background and HVAC remain fixed.

The dashboard accepts demo, custom combined or named-source hourly fixed-demand
profiles. Custom/named inputs replace the demo; EVs and separately modeled
equipment are added exactly once. **Optimization** displays real backend results;
**What-if scenarios** compares independently submitted current/alternative inputs,
with Apply/Restore and stale-result invalidation. The **Energy overview** remains
clearly labeled fictional demo data. Building inputs support validated browser-local [Save and Resume](docs/save-resume.md); optimizer results stay session-only. No account or cross-device storage is provided.

**Start here:** [engineering demo walkthrough](docs/demo-walkthrough.md),
[API contract](docs/contracts.md), [engineering reference](backend/simulator/README.md).

## Accepted behavior and public demo

| Evidence | Established scope |
| --- | --- |
| [Local EE acceptance, PR #25](docs/joint-ee-application-acceptance.md) | Real joint dashboard/What-if; demo/custom/named profiles; constraints, charts, Apply/Restore and invalidation |
| [Refreshed integration checks, PR #26](docs/joint-integration-audit.md) | Post-adapter local browser/API regressions |
| [Bounded hosted EE acceptance, PR #27](docs/hosted-joint-ee-acceptance.md) | Four hosted API probes and a named-source joint dashboard/What-if workflow, independently checked |

Public links recorded in the hosted report: [dashboard](https://gridpilot-weld.vercel.app)
and [backend health](https://gridpilot-api-1tpf.onrender.com/api/health). Actual
browser optimization requests used that backend. **Exact served frontend/backend
commits were not confirmed**; local HEAD and build hashes are not deployment proof.
Recorded acceptance concerns the tested scenarios, not continuous availability.
Shared costs are daily energy-only USD; cost/peak changes do not imply reduced
kWh or guaranteed monthly utility savings. Historical phase guides retain their
milestone findings; this README is the current status/setup entry point.

The additive [E1 operating-plan contract](docs/device-operating-plans.md) exposes
verified individual EV/flexible schedules and solver quality from the same
outcome as aggregate metrics. The timeline UI consumes this contract; existing
aggregate consumers remain supported. Local verification alone does not identify
the currently serving backend revision.

## Stack and prerequisites

- React + TypeScript + Vite; Tailwind CSS through its Vite plugin, Recharts, Lucide React.
- Python FastAPI + Pydantic; NumPy; OR-Tools GLOP; Uvicorn/python-dotenv.
- Tests: pytest/httpx and Vitest/jsdom. Vite's starter includes Oxlint.
- Git, Node.js **24** with npm, and Python **3.12+** with pip/venv recommended.
  Verified in this Linux workspace with Node 24.21.0, npm 11.19.0, Python 3.14.2,
  and Git 2.55.0. Windows instructions below have not been executed on Windows.

Install missing prerequisites from [Node.js](https://nodejs.org/),
[Python](https://www.python.org/downloads/windows/) (enable PATH), and
[Git for Windows](https://git-scm.com/download/win). VS Code's Python and ESLint-free
TypeScript tooling can use the project virtual environment and TS configuration.

## Repository layout

```text
frontend/
  src/components/       Reusable cards, chart, backend status
  src/pages/            Dashboard composition
  src/services/         Configurable API client and live integration test
  src/hooks/            Health connection lifecycle and retry
  src/types/            Shared TypeScript contracts and editor types
  src/App.tsx
backend/
  main.py               FastAPI application and CORS
  api/                  HTTP routes (CS-owned)
  ai/                   Server-only Meta interpretation and explanation
  models/contracts.py   Shared Pydantic contracts
  simulator/            EE-owned baseline simulator
  optimizer/            EE-owned EV/joint solver and shared adapter
  tests/                Engineering, adapter, API and AI tests
  requirements.txt      Direct dependency compatibility ranges
  requirements-lock.txt Resolved versions from the verified environment
sample_data/            Fictional Scenario and detailed building fixtures
scripts/                CLI, real HTTP/browser and numerical verification tools
docs/contracts.md      Units, assumptions and shared interfaces
.env.example            Configuration reference
```

## Windows setup (PowerShell, repository root)

Use the existing clone; do not run `git init` again.

```powershell
git --version
node --version
npm --version
py --version
py -m pip --version
git remote -v

py -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
cd frontend
npm ci
cd ..
```

Copy examples only on first setup; preserve your existing local `.env` files.
The direct virtual environment executable avoids PowerShell activation-policy
changes. In VS Code, use **Python: Select Interpreter** to select
`backend/.venv/Scripts/python.exe`. Each developer creates their own environment;
never commit or copy a virtual environment between operating systems.

### Start backend — terminal 1, repository root

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

### Start frontend — terminal 2, repository root

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173. The backend indicator should become **Backend connected**.
Stop the backend and press the retry icon to see **Backend offline**; restart it
and retry to reconnect. Checking times out after five seconds. No polling is enabled.
Select **Scenario configuration**, choose **EV-only** or **EV + flexible equipment**,
then **Run optimization**. Genuine results appear under **Optimization**.
Optimization and What-if need no AI credentials, hardware or live tariff feed.

### Linux / macOS / Codespaces

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
npm --prefix frontend ci
backend/.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
# Separate terminal:
npm --prefix frontend run dev
```

For Codespaces, forward ports 5173 and 8000. If accessing through forwarded HTTPS
URLs, set `VITE_API_BASE_URL` to the browser-accessible backend URL and
`CORS_ORIGINS` to the exact frontend origin. Restart both processes after changes.
Where forwarding requires an external bind, add `--host 0.0.0.0` to the server
command. A remote host's localhost is not your browser's localhost.

## Configuration

| File / variable | Purpose |
| --- | --- |
| `frontend/.env`: `VITE_API_BASE_URL` | Public backend origin without `/api`; development fallback `http://localhost:8000`; production requires an explicit value |
| `frontend/.env`: `VITE_OPTIMIZATION_TIMEOUT_MS` | Optimization deadline in ms, default 45000; integer 1000–120000, invalid values fall back to default |
| `backend/.env`: `CORS_ORIGINS` | Comma-separated allowed frontend origins; defaults to localhost and 127.0.0.1 on port 5173 |
| Root `.env.example` | Reference only; the app does not load a root `.env` |

Vite uses port 5173 with `strictPort` so it cannot silently switch to an origin
CORS does not allow. Frontend environment values are embedded at build time:
**never put secrets in `VITE_*` variables**. Optional live AI credentials belong
only in the backend environment; optimization needs no key. The accepted hosted
frontend used a 90000 ms optimization budget. CORS permits GET/POST and
Content-Type without credentials; it is not authentication.

Tailwind uses the [official Vite plugin setup](https://tailwindcss.com/docs/installation/using-vite).
CORS follows [FastAPI's explicit origin configuration](https://fastapi.tiangolo.com/tutorial/cors/).

## API and shared contracts

| Endpoint | Current behavior |
| --- | --- |
| `GET /api/health` | 200: `{"status":"ok","project":"GridPilot"}` |
| `POST /api/optimize` or `?scheduling_mode=ev_only` | Default EV-only; 200 `OptimizationResult` |
| `POST /api/optimize?scheduling_mode=joint` | Joint EV/flexible equipment; same body and result schema |
| Solver unavailable / unresolved | 503 with structured `detail.code` and `detail.message` |
| Solver / verification / unexpected failure | 500 with a sanitized structured error; no optimization result |
| Invalid optimization request or mode | 422 with validation details |
| `GET /docs` | Interactive Swagger UI |
| `GET /openapi.json` | Machine-readable API schema |

Try the fictional scenario in Swagger or PowerShell:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
# Submit a real optimization request:
curl.exe -i -X POST http://localhost:8000/api/optimize -H "Content-Type: application/json" --data-binary "@sample_data/scenario.demo.json"
```

The body is **Scenario only**; mode is a query parameter, not a new body field.
Do not send BuildingConfig or editor/source metadata. Named fixed sources are
summed into `fixed_demand_kw` before submission. The Python entry point is:

```python
from backend.models.contracts import Scenario
from backend.optimizer.interface import optimize_scenario

scenario = Scenario.model_validate_json(payload_json)
ev_only = optimize_scenario(scenario)  # Same as optimize_flexible=False
joint = optimize_scenario(scenario, optimize_flexible=True)
```

Signature: `optimize_scenario(scenario: Scenario, *, optimize_flexible: bool = False) -> OptimizationResult`.
Both modes share the solver, baseline policy and daily energy-only USD fields.
Check feasibility before reading nullable optimized values. Solver failures raise
typed exceptions rather than becoming infeasibility or zero-cost results; see
[contracts](docs/contracts.md) for units, constraints and failure semantics.
Detailed engineering demand-charge estimates are separate from these API costs.

Existing engineering commands (repository root; substitute Windows Python path):

```bash
backend/.venv/bin/python -m backend.simulator
backend/.venv/bin/python -m backend.optimizer
backend/.venv/bin/python -m backend.optimizer --optimize-flexible --example joint_recovery
```

## Optional Meta integration

Server-side Meta interpretation and grounded explanation are implemented. Users
review proposed edits before Apply; applying does not run optimization. The
engineering solver provides feasibility and numerical facts. Explanations support
EV-only and joint mode using the exact retained result ID; an unavailable result
requires an explicit new optimization rather than silently recomputing it.

Live AI uses server-only `MODEL_API_KEY`; `MODEL_API_MODE` defaults to `live`.
Code defaults are `MODEL_API_BASE_URL=https://api.meta.ai/v1` and
`MODEL_API_MODEL=muse-spark-1.3`. Missing credentials produce an explicit AI error
while optimization remains available. Explicit local `MODEL_API_MODE=mock` is a
labeled fixture, rejected on Render, with no automatic live-to-mock fallback.

[Phase 5](docs/phase-5-meta-api.md) records implementation/mock testing. The newer
[Meta diagnostic report](docs/meta-render-diagnostic.md) records successful local
status/model-list/basic inference probes on October 28, 2026, and historical
Render access errors. Neither establishes the **current genuine hosted interpret
→ review/apply → optimize → explain** workflow. Richard must confirm that
separately; no current outage or hosted AI success is inferred. The newer report
also supersedes the old startup-discovery flag. No provider requests or diagnostic
probes are needed for the engineering demo.

## Tests and build

From the root on Windows:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

On Linux substitute `backend/.venv/bin/python` for the Windows executable.
Frontend tests cover success, network failure, retry, invalid health response and
timeout. The live API test is skipped by default so unit tests need no server.
Backend tests cover real OR-Tools execution through FastAPI, infeasibility, validation,
CORS, Swagger/schema, serialization and sanitized solver/verification errors.

With both servers running, run the smoke check:

```powershell
.\backend\.venv\Scripts\python.exe scripts/smoke.py
$env:GRIDPILOT_LIVE_API = "1"
npm --prefix frontend run test:integration
Remove-Item Env:GRIDPILOT_LIVE_API
```

Linux live-client test: `GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration`.
The smoke check verifies real frontend HTTP serving, API health, CORS preflight,
Swagger, validation and real feasible/infeasible optimization responses. The integration test exercises the same
TypeScript API client the dashboard uses. DOM tests do not substitute for a real
browser layout/accessibility review; check desktop and mobile widths manually.

`npm ci` uses the committed frontend lockfile; backend installs use the resolved
lock snapshot, which now includes NumPy and OR-Tools. The existing engineering
lockfile is preserved; engineering direct requirements include the shared runtime
requirements rather than duplicating version ranges. To deliberately upgrade backend dependencies, install from
`requirements.txt`, test, then regenerate `requirements-lock.txt` with
`python -m pip freeze`. Review both dependency files in pull requests.

## Team ownership and collaboration

| Owner | Primary files and responsibilities |
| --- | --- |
| shaJ46 | `frontend/`; landing/onboarding, dashboard/charts/design, browser integration and frontend testing |
| Rich5369 (Richard) | `backend/`; APIs, optimization mathematics, pricing/data accuracy, validation/reliability and Meta provider integration |
| Both | `backend/models/`, `frontend/src/types/`, `docs/contracts.md`, sample scenarios; agree on contract changes first |

This division supersedes the earlier EE/CS implementation split. See the
[frontend completion report](docs/frontend-completion.md) for the completed PR #45 scope,
and [business-analysis follow-up](docs/business-analysis-dashboard.md) for non-EV choices,
AM/PM controls, calculated onboarding and current verification.

Richard's remaining handoff is confirming actual served revisions and the genuine
hosted Meta workflow. The team supplies final submission details and presentation
assets. The [demo guide](docs/demo-walkthrough.md) gives a suggested 2–3 minute
engineering segment, not official competition timing or rules. No additional EE
feature or acceptance campaign is required to explain the recorded results.

Use focused branches from the team's current default branch and
open PRs for review. Coordinate changes to contracts and lockfiles; keep changes
inside the agreed owned modules to minimize conflicts. Never force-push shared branches
or commit `.env`, virtual environments, node_modules, or build output.

## Historical implementation guides

The [Phase 2 handoff](docs/phase-2-dashboard.md), [Phase 3 API guide](docs/phase-3-api.md)
and later phase reports preserve implementation history. Use the current setup,
contract and acceptance links above when their old pending-work notes differ.
