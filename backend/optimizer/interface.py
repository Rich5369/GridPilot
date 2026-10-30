"""Shared energy-only optimizer adapter; HTTP integration remains CS-owned."""
from dataclasses import replace

from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer.operating_plan import build_operating_plan
from backend.optimizer.solver import (
    OptimizationSolverError, OptimizationUnresolvedError, OptimizationVerificationError,
    solve_ev_charging,
)
from backend.simulator.interface import simulate_baseline


def optimize_scenario(scenario: Scenario, *, optimize_flexible: bool = False) -> OptimizationResult:
    """Return verified EV (optionally joint flexible-load) optimization or infeasibility.

    Omitted/False keeps EV-only behavior; True uses the existing joint solver.
    Both modes preserve the uncontrolled baseline and daily energy-only costs.
    operating_plan copies/reconciles device arrays from this same verified outcome;
    it never performs another optimization or infers allocations from totals.
    Unresolved/error/verification failures raise typed exceptions, since the
    shared contract cannot represent those statuses. Baseline violations remain
    available from simulate_baseline; feasible optimized results have no violations.
    """
    scenario = Scenario.model_validate(scenario)
    baseline = simulate_baseline(scenario)
    outcome = solve_ev_charging(scenario, optimize_flexible=optimize_flexible)
    if outcome.status not in ('optimal', 'feasible', 'infeasible'):
        error = {'unresolved': OptimizationUnresolvedError,
                 'verification_failed': OptimizationVerificationError}.get(
                     outcome.status, OptimizationSolverError)
        raise error(outcome)
    evaluated = outcome.evaluated
    try:
        plan = build_operating_plan(scenario, baseline, outcome, optimize_flexible=optimize_flexible)
        return OptimizationResult(
            feasibility_status='infeasible' if outcome.status == 'infeasible' else 'feasible',
            baseline_electricity_cost_usd=baseline.electricity_cost_usd,
            baseline_peak_demand_kw=baseline.peak_demand_kw,
            baseline_demand_kw=baseline.demand_kw,
            optimized_electricity_cost_usd=None if evaluated is None else evaluated.electricity_cost_usd,
            optimized_peak_demand_kw=None if evaluated is None else evaluated.peak_demand_kw,
            optimized_demand_kw=None if evaluated is None else evaluated.demand_kw,
            constraint_violations=outcome.reasons, operating_plan=plan,
        )
    except (ValueError, KeyError, TypeError) as exc:
        raise OptimizationVerificationError(replace(
            outcome, status='verification_failed', schedules=None, evaluated=None,
            reasons=[f'Operating plan verification failed: {exc}'])) from exc
