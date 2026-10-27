# GridPilot

Commercial Energy Optimization Platform — project foundation for the Meta Global
AI Developer Hackathon 2026. A two-person team is building a dashboard and API
alongside an independently developed energy simulator and optimizer.

**Current scope:** an interactive React dashboard and scenario editor, live FastAPI
integration, an implemented EE baseline simulator, and verified OR-Tools EV
optimization. `POST /api/optimize` returns real feasible or infeasible results.
The overview chart still uses clearly labeled fictional demo values; optimization
comparisons use backend results. Meta AI, a database, and backend deployment are
not implemented. See [the Phase 3 API guide](docs/phase-3-api.md) and
[engineering documentation](backend/simulator/README.md).

## Stack and prerequisites

- React + TypeScript + Vite; Tailwind CSS through its Vite plugin, Recharts, Lucide React.
- Python FastAPI + Pydantic; Uvicorn; python-dotenv for backend configuration.
- Tests: pytest/httpx and Vitest/jsdom. Vite's starter includes Oxlint.
- Git, Node.js **24 LTS** with npm, and Python **3.12+** with pip/venv recommended.
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
  src/types/            Preliminary shared TypeScript contracts
  src/App.tsx
backend/
  main.py               FastAPI application and CORS
  api/                  HTTP routes (CS-owned)
  ai/                   Reserved for future Meta AI integration
  models/contracts.py   Shared Pydantic contracts
  simulator/            EE-owned baseline simulator
  optimizer/            EE-owned OR-Tools EV optimizer
  tests/                API and contract tests
  requirements.txt      Direct dependency compatibility ranges
  requirements-lock.txt Resolved versions from the verified environment
sample_data/            Fictional scenario fixture
scripts/                Live server smoke check
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
Run Optimization submits the scenario editor to the backend and displays the verified result.

### Linux / macOS / Codespaces

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
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
| `frontend/.env`: `VITE_API_BASE_URL` | Public backend origin, default `http://localhost:8000`; exclude `/api` |
| `frontend/.env`: `VITE_OPTIMIZATION_TIMEOUT_MS` | Optimization deadline in ms, default 45000; integer 1000–120000, invalid values fall back to default |
| `backend/.env`: `CORS_ORIGINS` | Comma-separated allowed frontend origins; defaults to localhost and 127.0.0.1 on port 5173 |
| Root `.env.example` | Reference only; the app does not load a root `.env` |

Vite uses port 5173 with `strictPort` so it cannot silently switch to an origin
CORS does not allow. Frontend environment values are embedded at build time:
**never put secrets in `VITE_*` variables**. Future AI credentials belong only in
the backend environment. No keys are needed now. CORS permits GET/POST and
Content-Type without credentials; it is not authentication.

Tailwind uses the [official Vite plugin setup](https://tailwindcss.com/docs/installation/using-vite).
CORS follows [FastAPI's explicit origin configuration](https://fastapi.tiangolo.com/tutorial/cors/).

## API and shared contracts

| Endpoint | Current behavior |
| --- | --- |
| `GET /api/health` | 200: `{"status":"ok","project":"GridPilot"}` |
| `POST /api/optimize` | 200: `OptimizationResult`, feasible or mathematically infeasible |
| Solver unavailable / unresolved | 503 with structured `detail.code` and `detail.message` |
| Solver / verification / unexpected failure | 500 with a sanitized structured error; no optimization result |
| Invalid optimization request | 422 with Pydantic validation details |
| `GET /docs` | Interactive Swagger UI |
| `GET /openapi.json` | Machine-readable API schema |

Try the fictional scenario in Swagger or PowerShell:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
# Submit a real optimization request:
curl.exe -i -X POST http://localhost:8000/api/optimize -H "Content-Type: application/json" --data-binary "@sample_data/scenario.demo.json"
```

Read [docs/contracts.md](docs/contracts.md) before implementing simulator or
optimizer logic. It defines the 24 one-hour intervals, kW/kWh/USD units, deadlines,
feasibility handling and preliminary baseline policy. Costs are daily energy-only;
actual monthly demand-charge savings require billing-period data and tariff rules.

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
| CS | `frontend/`, `backend/api/`, `backend/ai/`, `backend/main.py`; dashboard, API communication, future Meta AI and deployment |
| EE | `backend/simulator/`, `backend/optimizer/`; cost calculations, electrical constraints, EV scheduling |
| Both | `backend/models/`, `frontend/src/types/`, `docs/contracts.md`, sample scenarios; agree on contract changes first |

The EE baseline simulator and EV-only optimizer are implemented. FastAPI now calls
`optimize_scenario` and returns the existing `OptimizationResult` contract. HVAC,
background and flexible-equipment schedules are held fixed; only EV charging is
optimized. Shared API costs remain daily energy-only. No Meta AI integration is
included.

The Phase 3.5 hardening work adds a configurable optimization timeout and browser QA.
See [the hardening and deployment guide](docs/phase-3.5-hardening.md). Next CS task:
review deployment configuration and perform a production-origin smoke check after approval. Coordinate future equipment
or HVAC optimization and contract extensions with EE before implementation.

Use short feature branches and small pull requests:

```bash
git switch -c feat/project-foundation
# Inspect changes, run tests/build, then stage explicit paths:
git add README.md .gitignore .env.example frontend backend sample_data docs scripts
git diff --cached --stat
git commit -m "Set up GridPilot frontend and backend foundation"
# Push only when you decide the changes are ready:
git push -u origin feat/project-foundation
```

For subsequent work, create branches from the team's current default branch and
open PRs for review. Coordinate changes to contracts and lockfiles; keep EE work
inside its owned modules to minimize conflicts. Never force-push shared branches
or commit `.env`, virtual environments, node_modules, or build output.

## Interactive dashboard (Phase 2)

See [the Phase 2 handoff](docs/phase-2-dashboard.md) for the implemented dashboard, demo assumptions, API adapter, verification, local startup and merge/deployment instructions.
