"""Shared energy-only optimizer adapter; HTTP integration remains CS-owned."""
from backend.models.contracts import OptimizationResult, Scenario
from backend.optimizer.solver import (
    OptimizationSolverError, OptimizationUnresolvedError, OptimizationVerificationError,
    solve_ev_charging,
)
from backend.simulator.interface import simulate_baseline


def optimize_scenario(scenario: Scenario, *, optimize_flexible: bool = False) -> OptimizationResult:
    """Return verified EV (optionally joint flexible-load) optimization or infeasibility.

    Omitted/False keeps EV-only behavior; True uses the existing joint solver.
    Both modes preserve the uncontrolled baseline and daily energy-only costs.
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
    return OptimizationResult(
        feasibility_status='infeasible' if outcome.status == 'infeasible' else 'feasible',
        baseline_electricity_cost_usd=baseline.electricity_cost_usd,
        baseline_peak_demand_kw=baseline.peak_demand_kw,
        baseline_demand_kw=baseline.demand_kw,
        optimized_electricity_cost_usd=None if evaluated is None else evaluated.electricity_cost_usd,
        optimized_peak_demand_kw=None if evaluated is None else evaluated.peak_demand_kw,
        optimized_demand_kw=None if evaluated is None else evaluated.demand_kw,
        constraint_violations=outcome.reasons,
    )
