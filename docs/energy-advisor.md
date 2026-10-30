# GridPilot Energy Advisor

## Architecture audit

Audited origin/main at eafd88e (PR #32 merged R2 deterministic insights), including R1.1 submitted-snapshot isolation and E1 same-solve device schedules (PR #30). Fetched origin and checked open PRs: none returned at audit time. Existing R2 and demand/product worktrees are separate; no teammate solver files changed.

The original UI offered a single `/api/ai/interpret` proposal or `/api/ai/explain` call. The former already supported three strict changes and editor round-trip validation. The latter recomputed EV-only optimization for each explanation. The server adapter already used Meta Chat Completions, typed JSON schemas, bounded timeout, sanitized provider errors and explicit mock labeling. Reused that adapter and extracted existing proposal validation into a shared helper. Legacy endpoints remain compatible.

R2's frontend `deriveEnergyInsights` and its dashboard remain unchanged. The advisor uses original server result fields and simple peak-hour selection; it does not add an alternative insight engine or infer device schedules. Existing What-if retains responsibility for comparisons and Restore.

Original working tree contained uncommitted Meta diagnostics, tests, documentation, frontend stylesheet/ignore changes and unrelated artifacts. Work is isolated at `/tmp/gridpilot-advisor`, branch `feature/conversational-energy-advisor`. Those original files were preserved.

## Implemented experience

Distinct user/advisor messages, five starter prompts, bounded multi-turn history, editable extracted business context, loading and retry communication, structured proposal cards, Apply/Compare/Cancel, truthful last-request inference status, responsive layout and keyboard submission. Advisor state survives navigation in the current page session, but not browser reload. Changing submitted engineering context starts a fresh conversation while retaining business background. Draft edits cannot silently contaminate submitted questions; proposals cannot apply over a divergent draft.

Apply changes only the draft. Compare opens the existing What-if alternative workflow; its explicit comparison runs the solver. No model callback executes an operation. Both EV-only and joint result contexts are supported; control operations remain the existing site cap, shared EV deadline and highest two-rate tariff percentage change. No arbitrary device control.

## API and schema

`POST /api/ai/conversation` accepts:

- `request`: 1–2000 characters.
- `history`: at most 12 user/assistant messages, each 1–3000 characters.
- `profile`: optional structured session business background.
- `scenario`: immutable submitted Scenario (or valid current configuration before the first submit).
- `scheduling_mode`: `ev_only` or `joint`.

The profile contains nullable business type, employee count, operating hours, cost with billing period, consumption with units, equipment, goals and restrictions. Text fields are bounded; missing fields remain null. This profile never feeds the solver.

Responses include `category` (`answer`, `clarification_required`, `scenario_proposal`, `unavailable_or_unsupported`), `source`, deterministic `message` and `facts`, extracted `profile`, validated `changes` and nullable `proposed_scenario`.

Meta selects fact keys and bounded clarification categories rather than authoring numerical prose. Unknown response fields, fabricated fact keys, malformed JSON, invalid proposal arguments and inconsistent categories fail validation. Actual result numbers originate exclusively from server-held solver responses. No client-supplied result is accepted. Profile extraction is model interpretation and remains inspectable/correctable, rather than engineering evidence.

Successful optimization stores a deep copy under exact scenario + mode in a locked, bounded 64-entry process-local cache. Informational questions perform no solve. An absent snapshot yields an explicit missing-result message rather than a reconstructed or invented result. Cache memory is transient: restarts, eviction and multiple workers can require another explicit optimization. This avoids a database or production architecture migration in the initial implementation.

Sanitized provider errors are preserved. Conversation generation has a bounded 50-second request timeout and 5000-token completion budget; legacy calls retain 25 seconds and 1500 tokens. Live verification found the previous 1500-token budget exhausted before any JSON, then the 25-second timeout expired with the larger budget. The conversational request allows extra time while remaining below the browser’s 60-second timeout. Explicit mock mode returns conversational unavailable, with no substitution provider or fabricated Meta response.

## Verification evidence

- Backend full suite: 276 passing, including the cache-boundary test.
- Frontend: 97 passing; two existing integration tests skipped without the opt-in environment.
- TypeScript + Vite production build pass.
- Lint passes with two existing Fast Refresh warnings in CostBreakdown.tsx.
- Real localhost HTTP optimization and unavailable conversation endpoint checked through Chromium.
- Injected advisor selection tested for multi-turn history, keyboard Tab/Enter submit, explicit Apply, session navigation, mobile horizontal overflow and browser errors. These injected responses are clearly labeled mock and are not provider acceptance.
- Screenshots: `artifacts/energy-advisor/desktop.png` and `mobile.png` (injected provider response; real optimizer cost).
- Opt-in real Meta transcript: `artifacts/energy-advisor/real-meta-conversation.json`. Only the repository demo and user-approved fictional office example were transmitted. See the transcript for actual acceptance/failure, not the injected browser outputs.

Reproduce backend tests with `python -m pytest backend/tests -q`; frontend with `npm test`, `npm run build`, `npm run lint`. Browser script expects backend :8013 with CORS allowing http://127.0.0.1:5182 and frontend :5182 configured for it. Use the installed Playwright module through NODE_PATH when needed. `python -m scripts.verify_advisor_meta` is an opt-in external inference check requiring local credentials and writes only the fictional conversation evidence.

## Provider status and limitations

Codespaces and Render are distinct environments. Local acceptance does not establish Render model access. The earlier Render empty-model-list/model_not_found problem remains unresolved here. No production settings, credentials or deployment changed.

Responses deliberately use curated fact templates, so broad conceptual questions can produce a model-limitations explanation rather than open-ended teaching. Monthly bills cannot become hourly prices; employees cannot become hourly load. Savings are limited to modeled daily energy charges, without monthly savings guarantees. Price proposals retain the existing positive-peak/two-rate restriction. The current editor must represent a proposal exactly to apply it.

Follow-ups: shared signed result handles for multi-worker hosting, more curated concepts/fact categories, richer same-solve schedule explanations, provider latency monitoring and a separate Render access investigation. Keep arbitrary equipment controls out until solver/application contracts support them.

The demo-only inference approval was explicitly granted in chat. No production inference availability is inferred from this test. Earlier real attempts reached Meta but returned finish_reason=length with no JSON, then a sanitized timeout. The final transcript records the outcome after allocating the bounded conversational request budget.

Real local Meta acceptance succeeded on four consecutive turns after allocating the bounded request budget. It extracted office type, ten employees, hours, USD 2000 monthly, two overnight EVs, goals and restrictions; consumption stayed null. It answered with the retained demo solve (baseline USD 80.6400) and returned validated 15 kW site-cap proposals without execution. The first accepted run also asked an irrelevant scope question on business introduction; the prompt was tightened to select context/limitations rather than an unrelated power clarification for profile-only introductions. Provider acceptance is distinct from perfect interpretation quality.

The final real Meta rerun after tightening the prompt returned an answer for the profile introduction, an answer for modeled costs, then two 15 kW proposals. Local transcript assertions confirmed ten employees, unknown consumption, the supplied monthly bill, the actual USD 80.6400 daily baseline, and the final 15 kW change. All four responses have source=meta. The transcript was refreshed with this corrected conversation.
