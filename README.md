# GridPilot

GridPilot helps businesses understand electricity costs, evaluate energy-saving improvements, and plan when to run EV chargers and flexible equipment. Enter information about your building and equipment to compare modeled options before making a change.

You can use it for two main tasks:

| Your goal | What GridPilot does |
| --- | --- |
| **Find savings opportunities** | Estimates annual energy and financial savings for supported improvements, such as LED lighting, lighting controls, after-hours shutdown, office power management, motors, and refrigeration. Shows what information is still needed when an estimate cannot be calculated. |
| **Plan daily energy use** | Compares a baseline schedule with an optimized 24-hour plan, scheduling EV charging and eligible flexible equipment around hourly electricity prices, operating windows, and a building power limit. |

You do not need EVs to use GridPilot. You can evaluate savings projects, analyze building electricity alone, or schedule flexible equipment without EV charging. Calculations work without an AI key; optional Meta AI helps investigate opportunities and explain results. Numerical results come from the calculators and optimizer.

GridPilot is a planning tool. It does not control equipment or connect to your utility account. Results depend on the inputs and assumptions you provide; savings are estimates, not guarantees.

## Try it

Open the [hosted GridPilot dashboard](https://gridpilot-weld.vercel.app), or [run it locally](#run-gridpilot-locally). The hosted frontend and backend may differ from this checkout; previous hosted checks are recorded in the [hosted acceptance report](docs/hosted-joint-ee-acceptance.md).

1. Select **Get started**.
2. Enter your building details and operating hours. Choose **Find savings opportunities** or **Plan daily energy use**. Both remain available later.
3. Review the setup inputs and finish creating your workspace. For daily planning, review the energy inputs before creating the workspace and calculating.
4. Use the dashboard sections below to explore results or change your assumptions.

To look around first, select **Preview an example** during setup. The example is a labeled synthetic building with a previously calculated snapshot, not a new calculation for your building.

### Find savings opportunities

Open **Savings opportunities**. You can use this workflow without calculating a daily energy plan.

1. Add a supported project, such as a lighting upgrade, and enter the equipment details, power use, and operating hours requested by its form. Identify the source of your information; leave unknown measurements unanswered.
2. Supply your applicable electricity rate and its source for monetary estimates. Add upfront project cost and annual operating expenses when known. Optional recurring non-energy benefits need their own supporting basis.
3. Select **Calculate savings without AI** to calculate directly. If configured, **Ask AI to select opportunities** can help identify categories to investigate.
4. Review each project's annual energy savings, financial results, evidence warnings, and missing information. Add the requested information and calculate again to refine the estimate.

Missing information can leave some results unknown: for example, known energy savings can be shown without dollar savings when the electricity rate is missing. Zero and negative savings are also possible. Standalone project estimates are not added into a portfolio total because projects may overlap.

For example, replacing 100 lights rated at 60 W with 10 W lights, used 10 hours a day for 250 days a year, saves a modeled **12,500 kWh/year**. At an applicable rate of **$0.20/kWh**, that is **$2,500/year in gross electricity savings**. Net savings and payback also depend on expenses, benefits, and upfront cost. These are fictional example inputs.

### Plan daily energy use

Open **Energy plan** to review or edit your scenario, then select **Calculate energy plan**.

1. Choose the loads to analyze: building electricity only, flexible equipment only, EV charging only, or EVs and flexible equipment together. The advanced option schedules EVs while holding equipment at its baseline schedule.
2. Review the 24 hourly electricity prices, fixed building demand, and site power limit. You can use a demo demand profile, enter a combined hourly profile, or enter named fixed-demand sources.
3. Set EV charging requirements and available charging hours, if applicable. For flexible equipment, set its power, required runtime, and allowed operating window.
4. Calculate and open **Optimization** to compare baseline and optimized costs, peak demand, hourly demand, and device schedules.
5. Open **What-if scenarios** to compare current inputs with an alternative. Use its Apply/Restore controls to update or restore the main scenario.

Background demand and HVAC remain fixed. Only eligible EV charging and flexible equipment are rescheduled. Custom fixed-demand inputs replace the demo profile; keep separately modeled EV and flexible-equipment loads out of that profile to avoid counting them twice.

If a plan is **infeasible**, the requirements cannot all be met under the supplied limits. Review the explanation and adjust the relevant charging window, equipment window, energy requirement, or site limit. An infeasible result is not a zero-cost plan. Recalculate after changing inputs; old results do not describe the edited scenario.

### Find your way around the dashboard

| Section | Use it to… |
| --- | --- |
| **Overview** | See the daily plan summary and its calculation state. |
| **Energy plan** | Edit hourly demand, electricity prices, equipment requirements, and scheduling options. |
| **Savings opportunities** | Evaluate annual improvement projects and see missing evidence or next steps. |
| **My building** | Review building context. |
| **Optimization** | Compare baseline and optimized daily results and schedules. |
| **What-if scenarios** | Compare an alternative scenario and apply or restore changes. |
| **Energy Advisor** | Ask optional AI questions about your building and calculated results; review suggested edits before applying them. |
| **Electricity markets** | Explore dated U.S. state commercial retail averages from EIA as background context. These do not set your building's electricity rate. |

### Understand the numbers

- **kW** measures power at a moment; the site limit caps how much power the building can use at once. **kWh** measures energy consumed over time. **$/kWh** is the price per unit of energy.
- Daily optimization costs are **one day's electricity energy charges in USD**. A lower peak or daily cost does not necessarily mean less energy consumed. These results do not include a full utility bill or establish monthly savings.
- Annual savings estimates use project-specific evidence. GridPilot does not multiply the daily optimizer's savings into an annual project estimate.
- Employee count and monthly spending provide context; they do not establish measured hourly demand or equipment runtime. Review any demo inputs before using results for your building.
- State retail averages are benchmarks, not your utility tariff. Use an applicable customer rate for your own calculations.

### Save and return later

Setup and supported input drafts are saved in the same browser when storage is available. Look for **Saved in this browser**, and use **Continue to your building** when returning. Use **Clear saved workspace** to remove the saved inputs.

There are no accounts or cross-device sync. Results and conversations are not saved: after reopening, explicitly calculate again to get new results. Private browsing, clearing browser data, or changing browser profiles or site addresses can remove access to the saved workspace. See [Save and Resume](docs/save-resume.md) for details.

## Run GridPilot locally

You need **Git**, **Node.js 24 with npm**, and **Python 3.12+ with pip and venv**. Run the commands from the repository root, which contains `frontend/` and `backend/`. If you have not cloned the project yet, clone it and open that folder first.

### Linux, macOS, or Codespaces

Install dependencies and create local configuration files on first setup:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
npm --prefix frontend ci
```

Start the backend in one terminal:

```bash
backend/.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
```

Start the frontend in a second terminal, also from the repository root:

```bash
npm --prefix frontend run dev
```

### Windows PowerShell

Install dependencies and copy the example configuration files on first setup. If `.env` files already exist, keep them instead of copying over them.

```powershell
py -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm --prefix frontend ci
```

Start the backend in one terminal:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Start the frontend in a second terminal from the repository root:

```powershell
npm --prefix frontend run dev
```

Open **http://localhost:5173**. Both terminals must stay running. The backend health check is at http://localhost:8000/api/health, and interactive API documentation is at http://localhost:8000/docs. No AI credentials, hardware, or live tariff feed are required for direct savings calculations or daily optimization.

### Configuration and optional AI

| Setting | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `frontend/.env` | Backend origin, such as `http://localhost:8000`, without `/api`. Production builds require an explicit value. |
| `VITE_OPTIMIZATION_TIMEOUT_MS` | `frontend/.env` | Optimization wait limit; defaults to `75000` ms. Valid range: `1000`–`120000`. |
| `CORS_ORIGINS` | `backend/.env` | Comma-separated allowed frontend origins. Defaults cover localhost and 127.0.0.1 on port 5173. |
| `MODEL_API_KEY` | `backend/.env` | Optional server-side credential for Meta AI. Direct calculations work without it. |
| `MODEL_API_MODE` | `backend/.env` | Defaults to `live`. Explicit `mock` mode provides labeled local fixtures and is rejected on Render. |
| `MODEL_API_BASE_URL`, `MODEL_API_MODEL` | `backend/.env` | Optional provider settings; see `backend/.env.example` for defaults. |

The root `.env.example` is a reference; the app loads component-specific configuration. Restart the affected server after editing its `.env`. Frontend environment values are embedded at build time: **never put secrets in `VITE_*` variables**.

AI suggestions require review before applying edits. Applying an edit does not automatically run optimization. Missing credentials produce an explicit AI error; direct calculation remains available. See the [Meta integration guide](docs/phase-5-meta-api.md) and [diagnostic notes](docs/meta-render-diagnostic.md) for implementation and provider troubleshooting.

### Troubleshooting

| Problem | What to check |
| --- | --- |
| Backend is offline or a calculation fails to connect | Keep the backend terminal running, check `/api/health`, and use the connection retry control. A hosted backend may need time to start. |
| Frontend cannot reach a remote backend | Set `VITE_API_BASE_URL` to a URL your browser can reach and `CORS_ORIGINS` to the exact frontend origin, including scheme and port. Restart both servers. |
| Using Codespaces | Forward ports 5173 and 8000. Use the forwarded backend HTTPS URL in `VITE_API_BASE_URL` and the frontend HTTPS origin in `CORS_ORIGINS`. Add `--host 0.0.0.0` to server commands if external binding is needed. |
| Port 5173 is occupied | Stop the conflicting process. Vite deliberately requires port 5173 so its origin matches the local CORS configuration. |
| Annual financial results are unknown | Review the card's missing information, especially rate, expenses, and upfront cost. Unknown is different from zero. |
| Inputs return after refresh but results do not | This is expected: only inputs are saved. Calculate again. |

## Developer reference

The frontend uses React, TypeScript, Vite, Tailwind CSS, and Recharts. The backend uses FastAPI, Pydantic, NumPy, and the OR-Tools GLOP optimizer.

```text
frontend/src/       Pages, components, API client, and browser workspace storage
backend/api/        Health, daily optimization, and retail-price endpoints
backend/savings/    Annual savings contracts and calculators
backend/optimizer/  EV and flexible-equipment scheduling
backend/simulator/  Baseline demand and energy simulation
backend/ai/         Optional server-side Meta integration
backend/tests/      Backend tests
sample_data/        Fictional example scenarios
scripts/            Smoke checks and verification tools
docs/               Detailed contracts, feature guides, and acceptance history
```

### API quick start

With the backend running, submit the included fictional daily scenario:

```bash
curl -X POST http://localhost:8000/api/optimize \
  -H 'Content-Type: application/json' \
  --data-binary @sample_data/scenario.demo.json
```

On Windows use `curl.exe`. The default schedules EVs; append `?scheduling_mode=joint` to schedule eligible flexible equipment too. The body is a `Scenario`, not the browser's building/setup record. Named fixed-demand sources are combined before submission. See [API contracts](docs/contracts.md) for units, validation, feasibility, and structured errors.

Annual savings use separate endpoints: `GET /api/savings/catalog` and `POST /api/savings/recommendations`. Use the [savings integration guide](docs/meta-savings-integration.md) for request schemas and evidence requirements, or inspect all endpoints at `/docs`.

### Tests and build

From the repository root on Linux/macOS:

```bash
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

On Windows, substitute `.\backend\.venv\Scripts\python.exe` for the Python executable. With both servers running, check the local HTTP integration:

```bash
backend/.venv/bin/python scripts/smoke.py
GRIDPILOT_LIVE_API=1 npm --prefix frontend run test:integration
```

The live frontend integration test is opt-in; ordinary unit tests do not require a running server. Use the committed npm and Python lockfiles for reproducible installs. Do not commit `.env` files, virtual environments, `node_modules`, or build output.

### More documentation

- [Daily planning demo walkthrough](docs/demo-walkthrough.md)
- [Custom and named demand profiles](docs/custom-demand-profiles.md)
- [Device schedules and solver quality](docs/device-operating-plans.md)
- [Annual savings frontend guide](docs/savings-frontend-integration.md)
- [Business savings engine](docs/business-savings-engine.md)
- [EIA retail-price context](docs/eia-retail-map.md)
- [Simulator and engineering reference](backend/simulator/README.md)

Feature and phase reports in `docs/` include historical implementation and acceptance findings. Refer to their dates and tested scope when assessing a deployment; local verification does not establish which revision a hosted service is running.
