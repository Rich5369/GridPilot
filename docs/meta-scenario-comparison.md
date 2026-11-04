# Meta scenario comparisons

The daily Energy Advisor now offers **Compare with Meta** after a scenario
proposal. Sending a chat message still only proposes changes. After reviewing
the proposal, the user explicitly starts a comparison; applying the proposal
to the editor remains a separate action.

## User flow

1. Open the daily Energy Advisor with a valid scenario.
2. Ask, for example, “Compare my current plan with a 15 kW building power limit.”
3. Review the proposed limit and select **Compare with Meta**.
4. Inspect the activity steps, current/alternative optimized costs, peaks,
   feasibility, constraints and device schedules. An infeasible plan has
   unavailable optimized cost and peak, never a zero-cost result.
5. Ask a follow-up in the same conversation. It uses retained result IDs for
   both exact scenarios; missing executions return an explicit error and do
   not trigger another solve.
6. Select **Apply Changes** to copy the proposal into the draft, or cancel.

Supported changes remain the site cap, a shared same-day deadline for all
existing EVs, and a percentage adjustment to the higher rate of a two-rate
tariff. New equipment extraction, photo intake, automatic constraint relaxation
and equipment control are outside this change.

## API and execution

`POST /api/ai/compare` accepts `scenario`, `changes` and `scheduling_mode`
(`ev_only` or `joint`). The backend validates the reviewed change before any
provider request. A live Meta completion can request the single
`compare_reviewed_scenarios` function with empty arguments. The server binds
the exact inputs and executes the existing verified optimizer for each scenario.
The model cannot override those inputs or request additional functions.

A second completion receives compact server-owned evidence and returns a
qualitative explanation. The endpoint permits at most two provider completions
and one tool dispatch; SDK retries are disabled. Each provider request has a
20-second timeout. These are per-request budgets, not a total server deadline.
The browser allows 120 seconds, does not retry automatically and rejects stale
results. A client timeout/abort does not guarantee server work was canceled.

The response contains full `current` and `alternative` optimization results,
the proposed scenario, reviewed changes, cost/peak differences, explanation
source, warnings and completed activity steps. Differences compare optimized
current minus optimized alternative values. They are null if either scenario
is infeasible. Changed tariffs are explicitly labeled as different price
assumptions rather than operational savings.

If the final Meta explanation fails, verified results remain available with
`explanation_source: unavailable`. A failure before both solves complete returns
the corresponding error. No mock mode or deterministic substitute is presented
as a successful Meta tool invocation.

Follow-ups use the additive optional `comparison` field on
`POST /api/ai/conversation`: reviewed `changes` and `alternative_result_id`,
alongside the current comparison's `result_id`. Evidence is loaded only from
the existing bounded process-local snapshot store. Restarts, eviction or
multiple workers can make an execution unavailable.

## Verification and release scope

New backend tests inject the Meta SDK responses while executing the real solver.
They cover both scheduling modes, invalid/repeated tool calls, infeasible plans,
sanitized solver failures, failed explanations, tariff warnings and exact-result
follow-ups. Frontend tests check response reconciliation, review/compare/apply
separation, duplicate clicks, draft edits and unavailable metrics.

The test fixture contains real fictional solver outputs and injected Meta prose;
it is not live provider evidence and is never imported by production components.
No live Meta request, deployment, new hardware integration or bill-savings
validation was performed for this change. Test the new function-calling path
with the intended production provider before describing it as live accepted.
