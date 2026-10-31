# Building workspace Save and Resume

Implemented on `feature/save-resume-workspace`, starting from merged main
`cc453430022f27e47a51c8160b02bf65266ccb17` (PR #44). The starting tree was clean;
no newer authentication/persistence implementation or open PR was present.
This feature is for review; it does not change main or production settings.

## Retained inputs

One workspace is saved in `localStorage` under `gridpilot.building-workspace`.
The UI says **Saved in this browser** after a successful write or validated read.
Storage belongs to this browser profile and website origin; private browsing,
browser-data removal or a different hostname/profile does not provide continuity.
There is no account, backend database, cross-device sync or multi-tab merge.
When multiple tabs edit, the last successful write is the saved version.

The version-1 envelope contains:

```text
{
  version: 1,
  step: 0..3,
  completed: boolean,
  workspace: {
    kind: "building" | "demo",
    name, businessType, employees, monthlyBill, goals,
    editor: the existing ScenarioEditor,
    mode: "ev_only" | "joint",
    businessContext?: the existing advisor's bounded business-profile fields
  }
}
```

It retains:

- Exact onboarding draft/step, including optional/empty fields and unfinished
  numeric fields represented by empty strings.
- Building identity/context, selected priorities, load selection and completion.
- All main scenario editor inputs: hours, tariff, site cap, charging requirements,
  interruptible equipment and complete demo/custom/named fixed-demand profiles.
- Scheduling mode, including later dashboard changes and main-scenario changes
  applied/restored through existing What-if/advisor controls.
- Edited business context (and the existing advisor's accepted profile updates),
  independently of conversation text or solver results. Explicit setup edits update
  corresponding context fields without discarding unrelated equipment/restrictions.

Partial setup returns to the exact step. Completed setup returns to the approved
homepage with **Continue to your building** and **Edit building**. Editing a created
building reopens step 1 with its latest inputs; finishing setup marks it complete
again. Continue never runs optimization. New inputs remain subject to the existing
engineering validation; persistence does not change solver feasibility semantics.

Demonstrations carry an explicit `kind: demo` independently of their editable name.
A saved demo stays labeled on resume and in the dashboard. Exploring a demo while
another workspace exists requires an explicit replacement confirmation. Cancel
keeps the prior record and current fields untouched.

## Deliberately not restored

Optimizer responses, cost/peak metrics, hourly result/device arrays, feasibility
claims, result IDs, server snapshot handles, running requests and error states
are not part of the storage model. A resumed dashboard has no backend result and
asks the user to run optimization explicitly. A stored input is never evidence
that the backend retains a previous execution. The existing result ID/cache and
same-response E1 checks still govern new runs and advisor explanations.

Conversation transcripts, pending AI proposals, navigation position, What-if
alternative drafts/comparison results and extra billing-estimate widget state
remain session-only. The current main building scenario is saved; this is not a
project/session-history archive. Setup business metadata and editable advisor
business context remain separate from engineering demand inputs; monthly bills
and employee counts never generate loads.

## Validation and recovery

The stored shape is bounded and validated before display. It rejects missing or
unknown fields, unsupported modes/versions, invalid step/completion combinations,
wrong types, malformed 24-hour arrays/sources and nonnumeric corruption of number
inputs. It retains empty and physically invalid numeric drafts (e.g. temporarily
cleared site cap, negative bounds or an end before start), leaving domain checking
to `validateEditor` when the user edits/submits. No field is filled from demo data
to repair a stored record. Profile context has a bounded known-key set; execution
IDs and arbitrary extra data are rejected.

Unsupported versions and malformed records stay untouched. Their recovery screen
explains the problem and offers explicit clearing or **Continue without saving**.
The latter preserves the original raw record. A failed initial read disables
writing for that session so newly entered inputs cannot overwrite inaccessible
old data. Write failures retain current inputs in React and warn that refresh may
restore older data. A subsequent successful input write can resume saving.

**Clear saved workspace** asks for confirmation and removes only this key. UI state
resets only after successful removal. Failed removal reports failure and retains
the live workspace. Untouched initial/default setup is not automatically written,
so clearing remains cleared across refresh/reopening. Initial reads and updates
are safe under React Strict Mode. Writes happen in input events, with no unload
handler, debounce window or effect that overwrites restored inputs.

## Validation performed

- Focused storage/App/Setup/advisor tests cover recovery, failures, input handoff,
  demo replacement, profile editing and the no-result/no-implicit-solve boundary.
- Full frontend suite: **162 passed, 2 existing opt-in live cases skipped**, including
  **40 new persistence regressions**. Explicit TypeScript check and production
  build passed. Lint passed with only the two existing CostBreakdown Fast Refresh
  warnings. Exact commands and evidence are included below.
- Real local production frontend plus FastAPI/OR-Tools in Chromium at 1440 and
  390 pixels. See [browser evidence](../artifacts/save-resume/verification.json).
- Browser refresh checked at company, energy, goals and review steps, including
  empty invalid fields, fractional EV energy and a custom hourly profile.
- A real on-disk Chromium profile was closed and reopened (not reconstructed from
  a Playwright storage snapshot). The completed building, latest mode, main inputs
  and edited advisor context survived. No optimizer ran automatically on Continue.
- One explicit genuine optimizer response was captured. Subsequent input-only
  restore had no E1 plan/result handle, restored metrics or automatic solve.
- Clear/cancel, neighboring storage-key preservation, unavailable reads, failed
  writes/removal, malformed JSON, unsupported versions and saved-demo labeling
  were exercised. Storage failures were injected; solver responses were not.
- Desktop/mobile screenshots were inspected; viewport checks found no horizontal
  page overflow. Temporary browser profiles and local services are cleaned up.

No backend/solver/shared contract or runtime dependency changes are required.
The existing design, image assets, rendering/validation and API client are reused.
The existing redesign browser verifier now uses the **Edit building** action name.

## Reproduce

```bash
npm --prefix frontend test
cd frontend
./node_modules/.bin/tsc -b
npm run lint
VITE_API_BASE_URL=http://127.0.0.1:8014 npm run build
```

From the repository root, start the existing backend in one terminal:

```bash
CORS_ORIGINS=http://127.0.0.1:5294 MODEL_API_DIAGNOSTIC_ON_STARTUP=0 backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8014
```

Serve the production build and run the verifier in separate terminals:

```bash
npm --prefix frontend run preview -- --host 127.0.0.1 --port 5294 --strictPort
PLAYWRIGHT_MODULE=/tmp/gridpilot-visual-qa/node_modules/playwright node scripts/verify_workspace_persistence.cjs
```

Playwright is external QA tooling, not an app dependency. This checks local
behavior, not hosted deployment or physical mobile-device behavior.

## Remaining work for real accounts

Accounts require an authentication/session design, server-owned persisted building
records with ownership/access checks, durable storage, migration and conflict/sync
policies, and deployment verification. Durable optimizer history also needs
explicit backend execution retention and provenance; browser-local result IDs
cannot substitute for it. None of that is implied by this input-only feature.
