"""Continuous EV-only LP and independent verification, shared by both adapters."""
from dataclasses import dataclass, field
from math import isfinite
from typing import Literal

from ortools.linear_solver import pywraplp

from backend.models.contracts import BaselineResult, Scenario
from backend.optimizer.constraints import equipment_window_violations, schedule_violations
from backend.simulator.building import Tariff
from backend.simulator.energy import sum_loads
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules
from backend.simulator.tariff import incremental_demand_charge

# Absolute tolerances; no rounded schedules or monetary/physical weighted objective.
PHYSICAL_TOLERANCE = 1e-6  # kW and kWh, checked separately
OBJECTIVE_TOLERANCE_USD = 1e-7
SolveStatus = Literal['optimal', 'feasible', 'infeasible', 'unresolved', 'error', 'verification_failed']


@dataclass
class SolveOutcome:
    status: SolveStatus
    objective: str
    primary_status: str = 'not_run'
    secondary_status: str = 'not_run'
    primary_optimum_usd: float | None = None
    schedules: dict[str, list[float]] | None = None
    evaluated: BaselineResult | None = None
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class OptimizationError(RuntimeError):
    """No result suitable for the shared feasible/infeasible contract."""
    def __init__(self, outcome: SolveOutcome):
        super().__init__('; '.join(outcome.reasons))
        self.outcome = outcome


class OptimizationUnresolvedError(OptimizationError):
    """Time limit / not-solved; mathematical feasibility remains unknown."""


class OptimizationSolverError(OptimizationError):
    """Solver unavailable, abnormal, invalid, unbounded or raised an exception."""


class OptimizationVerificationError(OptimizationError):
    """Returned values failed independent electrical/cost verification."""


def _create_solver():
    return pywraplp.Solver.CreateSolver('GLOP')


def _run_solver(solver):
    return solver.Solve()


def _status_name(status):
    return {pywraplp.Solver.OPTIMAL: 'optimal', pywraplp.Solver.FEASIBLE: 'feasible',
            pywraplp.Solver.INFEASIBLE: 'infeasible', pywraplp.Solver.NOT_SOLVED: 'unresolved',
            pywraplp.Solver.ABNORMAL: 'abnormal', pywraplp.Solver.UNBOUNDED: 'unbounded',
            pywraplp.Solver.MODEL_INVALID: 'model_invalid'}.get(status, f'unknown:{status}')


def _extract_schedules(variables, fixed):
    return {**{key: list(value) for key, value in fixed.items()},
            **{key: [v.solution_value() for v in row] for key, row in variables.items()}}


def _primary_cost(evaluated, tariff):
    demand = incremental_demand_charge(evaluated.peak_demand_kw, tariff)
    return evaluated.electricity_cost_usd + (demand if demand is not None else 0.0)


def _verify(scenario, schedules, fixed):
    """Inspect raw values first, then remove only sub-tolerance negative noise."""
    expected_keys = set(fixed) | {f'ev:{ev.id}' for ev in scenario.ev_requirements}
    if set(schedules) != expected_keys or any(
            len(values) != 24 or any(not isfinite(p) for p in values)
            for values in schedules.values()):
        raise ValueError('Invalid schedule keys, shape or nonfinite solver values')
    violations = schedule_violations(scenario, schedules, fixed, PHYSICAL_TOLERANCE)
    if violations:
        raise ValueError('; '.join(violations))
    cleaned = {key: [max(0.0, value) for value in values]
               for key, values in schedules.items()}
    evaluated = evaluate_scenario_schedules(scenario, cleaned)
    if evaluated.constraint_violations:
        raise ValueError('; '.join(evaluated.constraint_violations))
    return cleaned, evaluated


def _infeasibility_diagnostics(scenario, fixed_demand):
    reasons = equipment_window_violations(scenario)
    for h, power in enumerate(fixed_demand):
        if power > scenario.building_max_demand_kw + PHYSICAL_TOLERANCE:
            reasons.append(f'Hour {h}: fixed demand including held flexible loads '
                           f'({power:g} kW) exceeds site cap ({scenario.building_max_demand_kw:g} kW)')
    # Necessary shared-capacity conditions over windows; solver handles more
    # complex interactions. Only vehicles wholly within a window are counted.
    endpoints = sorted({0, 24} | {ev.arrival_hour for ev in scenario.ev_requirements}
                       | {ev.deadline_hour for ev in scenario.ev_requirements})
    for start in endpoints:
        for end in endpoints:
            if end <= start:
                continue
            evs = [ev for ev in scenario.ev_requirements
                   if ev.arrival_hour >= start and ev.deadline_hour <= end]
            required = sum(ev.energy_required_kwh for ev in evs)
            capacity = sum(max(0.0, scenario.building_max_demand_kw - fixed_demand[h])
                           for h in range(start, end))
            if required > capacity + PHYSICAL_TOLERANCE:
                reasons.append(f'Window [{start}, {end}): EVs require {required:g} kWh '
                               f'but shared charging capacity is at most {capacity:g} kWh')
    return reasons


def solve_ev_charging(scenario: Scenario, tariff: Tariff | None = None, *,
                      time_limit_ms: int = 10000) -> SolveOutcome:
    """Optimize EVs only. A second LP minimizes peak within $1e-7 of optimum.

    FEASIBLE without proof is independently checked but never called optimal.
    A secondary time limit retains a verified primary solution with a warning.
    All other errors have no schedules; only analytic/solver proofs are infeasible.
    """
    scenario = Scenario.model_validate(scenario)
    tariff = Tariff() if tariff is None else Tariff.model_validate(tariff)
    if not isinstance(time_limit_ms, int) or isinstance(time_limit_ms, bool) or time_limit_ms <= 0:
        raise ValueError('time_limit_ms must be a positive integer (per solve)')
    use_demand = tariff.demand_charge_usd_per_kw > 0 and tariff.existing_monthly_peak_kw is not None
    objective_name = 'energy_plus_incremental_demand' if use_demand else 'energy_only'
    outcome = SolveOutcome(status='error', objective=objective_name)
    if tariff.demand_charge_usd_per_kw and tariff.existing_monthly_peak_kw is None:
        outcome.warnings.append('Billing peak unknown: optimizing energy only; demand and total cost remain null.')
    baseline = baseline_schedules(scenario)
    fixed = {key: values for key, values in baseline.items() if not key.startswith('ev:')}
    fixed_demand = sum_loads(fixed.values())
    diagnostics = _infeasibility_diagnostics(scenario, fixed_demand)
    if diagnostics:
        outcome.status = 'infeasible'
        outcome.primary_status = 'analytic_infeasibility'
        outcome.reasons = diagnostics + ['Infeasible under the fixed background/HVAC/flexible schedules of this phase.']
        return outcome
    secondary_peak_value = None
    try:
        solver = _create_solver()
        if solver is None:
            raise RuntimeError('OR-Tools GLOP solver is unavailable')
        solver.SetTimeLimit(time_limit_ms)
        if not solver.SetSolverSpecificParametersAsString(
                'primal_feasibility_tolerance: 1e-9\ndual_feasibility_tolerance: 1e-9'):
            raise RuntimeError('GLOP rejected numerical parameters')
        infinity = solver.infinity()
        variables = {}
        for index, ev in enumerate(scenario.ev_requirements):
            row = [solver.NumVar(0, ev.max_charging_power_kw
                                if ev.arrival_hour <= h < ev.deadline_hour else 0,
                                f'ev_{index}_hour_{h}') for h in range(24)]
            variables[f'ev:{ev.id}'] = row
            solver.Add(solver.Sum(row) == ev.energy_required_kwh)
        peak = solver.NumVar(0, scenario.building_max_demand_kw, 'peak_kw')
        total = [fixed_demand[h] + solver.Sum(row[h] for row in variables.values())
                 for h in range(24)]
        for power in total:
            solver.Add(power <= scenario.building_max_demand_kw)
            solver.Add(peak >= power)
        energy_cost = solver.Sum(total[h] * scenario.electricity_prices_usd_per_kwh[h]
                                 for h in range(24))
        primary = energy_cost
        if use_demand:
            excess = solver.NumVar(0, infinity, 'incremental_peak_kw')
            solver.Add(excess >= peak - tariff.existing_monthly_peak_kw)
            primary += tariff.demand_charge_usd_per_kw * excess
        solver.Minimize(primary)
        status = _run_solver(solver)
        outcome.primary_status = _status_name(status)
        if status == pywraplp.Solver.INFEASIBLE:
            outcome.status = 'infeasible'
            outcome.reasons = ['GLOP proved no EV schedule satisfies all windows, charger limits, '
                               'exact energies and shared site capacity under the fixed schedules of this phase.']
            return outcome
        if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
            outcome.status = 'unresolved' if status == pywraplp.Solver.NOT_SOLVED else 'error'
            outcome.reasons = [f'Primary GLOP solve returned {outcome.primary_status}; infeasibility is not established.']
            return outcome
        schedules = _extract_schedules(variables, fixed)
        primary_value = solver.Objective().Value()
        if not isfinite(primary_value):
            raise RuntimeError('Nonfinite primary objective')
        if status == pywraplp.Solver.OPTIMAL:
            outcome.primary_optimum_usd = primary_value
            solver.Add(primary <= primary_value + OBJECTIVE_TOLERANCE_USD)
            solver.Minimize(peak)
            secondary = _run_solver(solver)
            outcome.secondary_status = _status_name(secondary)
            if secondary in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
                schedules = _extract_schedules(variables, fixed)
                if secondary == pywraplp.Solver.OPTIMAL:
                    secondary_peak_value = solver.Objective().Value()
                if secondary == pywraplp.Solver.FEASIBLE:
                    outcome.warnings.append('Peak tie-break is feasible without a peak optimality proof.')
            elif secondary == pywraplp.Solver.NOT_SOLVED:
                outcome.warnings.append('Peak tie-break unresolved; returning the verified primary optimum.')
            else:
                outcome.status = 'error'
                outcome.reasons = [f'Secondary solve returned {outcome.secondary_status}; no optimized result returned.']
                return outcome
        else:
            outcome.warnings.append('Primary solution is feasible without optimality proof; peak tie-break not run.')
    except Exception as exc:
        outcome.status = 'error'
        outcome.reasons = [f'Solver error: {type(exc).__name__}: {exc}']
        return outcome
    try:
        schedules, evaluated = _verify(scenario, schedules, fixed)
        recomputed = _primary_cost(evaluated, tariff)
        if status == pywraplp.Solver.OPTIMAL:
            if abs(recomputed - primary_value) > 2 * OBJECTIVE_TOLERANCE_USD:
                raise ValueError('Independent objective does not match the primary optimum within tolerance')
        elif abs(recomputed - primary_value) > 2 * OBJECTIVE_TOLERANCE_USD:
            raise ValueError('Independent objective does not match the feasible solver objective')
        if secondary_peak_value is not None and (
                not isfinite(secondary_peak_value)
                or abs(evaluated.peak_demand_kw - secondary_peak_value) > PHYSICAL_TOLERANCE):
            raise ValueError('Independent peak does not match the proved secondary optimum')
        outcome.schedules, outcome.evaluated = schedules, evaluated
        outcome.status = 'optimal' if status == pywraplp.Solver.OPTIMAL else 'feasible'
    except Exception as exc:
        outcome.status = 'verification_failed'
        outcome.reasons = [f'Independent verification failed: {exc}']
    return outcome
