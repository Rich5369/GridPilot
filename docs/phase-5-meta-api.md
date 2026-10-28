# Phase 5: Meta Model API integration

Status: architecture and mock testing implemented. Genuine authenticated Meta API
verification is PENDING. No credentials were available; no external AI results
have been verified. No deployment was performed.

## Verified documentation

Reviewed October 27, 2026 (America/New_York):
- https://dev.meta.ai/docs/overview confirms `https://api.meta.ai/v1`,
  `muse-spark-1.3`, bearer `MODEL_API_KEY` and OpenAI SDK compatibility.
- https://dev.meta.ai/docs/structured-output documents Chat Completions JSON
  Schema output (`POST /v1/chat/completions`). It documents `strict: false`
  for Chat Completions. GridPilot validates every response with Pydantic anyway.

Documentation verification does not verify account access or authenticated calls.

## Backend configuration

Install `backend/requirements.txt` (or `backend/requirements-lock.txt` for pinned
versions). The OpenAI SDK is a production dependency. All provider calls are
server-only. Existing CORS and optimizer endpoints/configuration are unchanged.

| Variable | Default | Purpose |
| --- | --- | --- |
| MODEL_API_MODE | live | `live` or explicit local `mock`; no automatic mock fallback |
| MODEL_API_KEY | unset | Secret, required only in live mode |
| MODEL_API_BASE_URL | https://api.meta.ai/v1 | Provider base URL |
| MODEL_API_MODEL | muse-spark-1.3 | Model identifier |

Never put the key in React, Vite, Vercel, source control, request bodies, or logs.
Each provider call has a 25-second timeout, no automatic retries, and bounded output.
AI errors use the existing `{detail:{code,message}}` shape: 503 missing key or
invalid mode (including mock mode on Render), 504 timeout, 429 rate limit, 502 provider/invalid output, 422 invalid
scenario change. Optimization and health remain available when AI is offline.

## Endpoints and workflow

`POST /api/ai/interpret`: `{request: string, scenario: Scenario}` returns status
(`proposed`, `clarification`, `unsupported`), message, typed changes,
`proposed_scenario` (null unless actionable), and source (`meta` or `mock`).
Supports demand limit, shared deadline for existing EVs, and percentage change to
hours at the maximum positive price in a two-rate tariff. This limited scope
matches the existing dashboard editor. All other requirements are preserved;
unknown fields and invalid values are rejected. Ambiguity/unsupported intent is
classified by the model, whose semantic interpretation still requires user review.
No feasibility decision or savings calculation comes from the language model.

The assistant shows the explicit changes before Apply Changes. Cancel discards
the proposal. Changing the draft invalidates the proposal. Applying must round-trip
to the validated scenario, and does not run optimization. The existing Run
optimization button calls the unchanged `/api/optimize` OR-Tools path.

`POST /api/ai/explain`: `{scenario: Scenario}` recomputes the verified result using
the existing optimizer. It deliberately does not accept client-supplied results.
The dashboard sends the latest successful optimization's scenario, not unsaved
edits. Meta selects relevant fact keys using structured output; the server renders
those keys as business-readable statements with numbers from the real engine.
This constrained explanation prevents fabricated prose, equipment schedules,
financial values or engineering conclusions. Infeasibility reasons come directly
from the solver. Both feasible and infeasible HTTP-200 results can be explained.
Explanations state single-day, hourly, energy-only limitations and never promise
monthly bill savings. Recalculation may choose a numerically equivalent optimum.

## Local mock workflow

Copy `backend/.env.example` to ignored `backend/.env` and set `MODEL_API_MODE=mock`.
No key is needed. Mock mode is rejected with HTTP 503 when Render sets
`RENDER=true`, preventing accidental production fixtures. Start the backend from repository root:

```sh
backend/.venv/bin/python -m uvicorn backend.main:app --reload
npm --prefix frontend run dev
```

Open AI assistant, choose **Keep peak power demand below 15 kW.**, then Review
proposed changes. Confirm the MOCK label and that configuration is unchanged.
Apply Changes, check the 15 kW draft limit, and Run optimization. Return to the
assistant and Explain latest backend result. Numerical facts are real optimizer
calculations; mock mode only supplies deterministic proposal/fact-selection fixtures.
Other mock requests return clarification rather than simulated natural-language AI.

## Activate live integration on Render when credentials arrive

1. After code review and approval, merge/deploy this feature through your normal
   backend and frontend release process. Current production does not have these
   endpoints until that release. Do not change CORS or the Vercel backend URL.
2. In Render Dashboard, open the existing `gridpilot-api-1tpf` web service (verify
   its URL is `https://gridpilot-api-1tpf.onrender.com`). Open **Environment**.
3. Add `MODEL_API_KEY` with the genuine credential as a secret environment value.
   Set `MODEL_API_MODE=live`, `MODEL_API_MODEL=muse-spark-1.3`, and
   `MODEL_API_BASE_URL=https://api.meta.ai/v1`. Do not include quotation marks.
4. Save the environment changes and deploy/restart the service using Render's
   save/redeploy action. Verify its build installs the updated backend requirements.
   No key or new AI configuration is needed in Vercel.
5. Check `/api/health` and run the existing dashboard optimizer first.
6. In the deployed dashboard assistant, submit the 15 kW example. Inspect the
   network response: HTTP 200, `source: meta`, valid proposed changes. Check
   the server/provider usage dashboard for the genuine authenticated request.
   If rejected, inspect model access, billing and credential configuration without
   copying credentials or upstream response bodies into logs or chat.
7. Apply, run optimization, and request the explanation. Repeat for an infeasible
   limit. Record the date, model, HTTP outcomes and sanitized request identifiers
   as live verification evidence. Only then mark live integration verified.
8. To disable AI, remove the key; the optimizer remains available. Do not use mock
   mode in production as a substitute for live availability.

Only environment changes are needed to switch local mock testing to live calls.
Render environment changes trigger production behavior; perform them when ready
for the approved release, not as part of this implementation session.

## Verification and follow-up

Run `backend/.venv/bin/python -m pytest backend/tests -q`, `npm --prefix frontend test`,
`npm --prefix frontend run build`, and `npm --prefix frontend run lint`.
Tests mock the actual SDK boundary for extraction, clarification, unsupported
requests, invalid values/output, timeout, provider errors and rate limits. They
also exercise the real engine for feasible/infeasible explanations and offline
regression. UI tests cover review, cancellation and explicit confirmation.

Next phase: authenticated Meta smoke test and semantic prompt evaluation with
real business requests, followed by an approved production release. Broader
scenario editing requires extending the UI's representable schema with the EE
teammate. Public-use authentication, quotas and spend controls can follow before
expanding beyond the hackathon demonstration.

Recorded local results: 104 backend tests passed; 37 frontend tests passed with
one opt-in HTTP test skipped in the default run. That separate real local HTTP
test also passed. Production build, lint and pip dependency check passed; lint
retains two existing Fast Refresh warnings and pytest retains the existing
TestClient deprecation warning. Chromium passed missing-key feedback, mock
review/cancel/apply, real optimizer execution, verified explanation facts, mobile
overflow and browser-error checks. Screenshot: `/tmp/gridpilot-phase5-mobile.png`.
No genuine authenticated Meta request was made.

Optional browser check: install Playwright outside application dependencies with
`npm install --prefix /tmp/gridpilot-browser playwright`, then run
`/tmp/gridpilot-browser/node_modules/.bin/playwright install chromium`.
Start frontend on :5173, live backend without credentials on :8000, and a second
backend with `MODEL_API_MODE=mock` on :8001. Run
`NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_ai_browser.cjs`.
The test forwards AI requests to the explicit mock backend after checking the
real missing-credentials response; all optimizer calls use the real local engine.
