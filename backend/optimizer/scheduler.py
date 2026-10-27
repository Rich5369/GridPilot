"""Detailed engineering optimizer contract and concrete OR-Tools engine."""
from typing import Literal, Protocol

from pydantic import Field, model_validator

from backend.models.contracts import Contract
from backend.optimizer.solver import (
    OBJECTIVE_TOLERANCE_USD, PHYSICAL_TOLERANCE, solve_ev_charging,
)
from backend.simulator.building import BuildingConfig, FiniteValue, SimulationResult
from backend.simulator.engine import evaluate_building_schedules, simulate_building


class OptimizationComparison(Contract):
    # Existing names retained; full operating costs stay null if history unknown.
    baseline_cost_usd: FiniteValue | None
    optimized_cost_usd: FiniteValue | None
    modeled_cost_reduction_usd: FiniteValue | None
    energy_charge_reduction_usd: FiniteValue | None = None
    conditional_demand_charge_reduction_usd: FiniteValue | None = None
    valid: bool = True
    invalid_reasons: list[str] = Field(default_factory=list)


class SolverMetadata(Contract):
    solver: str = 'OR-Tools GLOP'
    objective: Literal['energy_only', 'energy_plus_incremental_demand']
    primary_status: str
    peak_tiebreak_status: str
    primary_optimum_usd: FiniteValue | None = None
    objective_tolerance_usd: FiniteValue = OBJECTIVE_TOLERANCE_USD
    physical_tolerance_kw_kwh: FiniteValue = PHYSICAL_TOLERANCE
    warnings: list[str] = Field(default_factory=list)


class SchedulingResult(Contract):
    status: Literal['optimal', 'feasible', 'infeasible', 'unresolved', 'error',
                    'verification_failed', 'not_implemented']
    baseline: SimulationResult
    optimized: SimulationResult | None = None
    comparison: OptimizationComparison | None = None
    constraints_satisfied: bool = False
    infeasibility_reasons: list[str] = Field(default_factory=list)
    failure_reasons: list[str] = Field(default_factory=list)
    solver_metadata: SolverMetadata | None = None

    @model_validator(mode='after')
    def consistent_outcome(self):
        if self.status in ('optimal', 'feasible'):
            if (self.optimized is None or self.optimized.feasibility_status != 'feasible'
                    or not self.constraints_satisfied or self.comparison is None
                    or self.infeasibility_reasons or self.failure_reasons):
                raise ValueError('Feasible result needs verified schedules, comparison and satisfied constraints')
        elif self.optimized is not None or self.comparison is not None or self.constraints_satisfied:
            raise ValueError('Unavailable optimization cannot supply optimized values')
        if self.status == 'infeasible' and not self.infeasibility_reasons:
            raise ValueError('Infeasible optimization needs reasons')
        if self.status in ('error', 'unresolved', 'verification_failed') and not self.failure_reasons:
            raise ValueError('Solver failures need failure reasons')
        return self


class SchedulingEngine(Protocol):
    def optimize(self, config: BuildingConfig) -> SchedulingResult: ...


def _comparison(config, baseline, optimized):
    # Cap violations do not invalidate an equal-work comparison, but incomplete
    # baseline charging/flexible work does. Never label missing work as savings.
    incomplete = []
    for key, energy in (
        [(f'ev:{ev.id}', ev.energy_required_kwh) for ev in config.scenario.ev_requirements]
        + [(f'flexible:{item.id}', item.energy_required_kwh) for item in config.scenario.flexible_equipment]
    ):
        if abs(sum(baseline.equipment_schedules_kw[key]) - energy) > PHYSICAL_TOLERANCE:
            incomplete.append(f'Baseline {key} did not deliver required energy; savings comparison invalid')
    known = baseline.baseline_operating_cost_usd is not None and optimized.baseline_operating_cost_usd is not None
    demand_known = baseline.incremental_demand_charge_usd is not None and optimized.incremental_demand_charge_usd is not None
    return OptimizationComparison(
        baseline_cost_usd=baseline.baseline_operating_cost_usd,
        optimized_cost_usd=optimized.baseline_operating_cost_usd,
        modeled_cost_reduction_usd=(baseline.baseline_operating_cost_usd - optimized.baseline_operating_cost_usd
                                    if known and not incomplete else None),
        energy_charge_reduction_usd=(baseline.energy_charges_usd - optimized.energy_charges_usd
                                     if not incomplete else None),
        conditional_demand_charge_reduction_usd=(baseline.incremental_demand_charge_usd
            - optimized.incremental_demand_charge_usd if demand_known and not incomplete else None),
        valid=not incomplete, invalid_reasons=incomplete)


class ORToolsSchedulingEngine:
    """EV-only LP engine; limits apply separately to primary and secondary solves."""
    def __init__(self, time_limit_ms: int = 10000):
        self.time_limit_ms = time_limit_ms

    def optimize(self, config: BuildingConfig | dict) -> SchedulingResult:
        config = BuildingConfig.model_validate(config)
        baseline = simulate_building(config)
        outcome = solve_ev_charging(config.scenario, config.tariff, time_limit_ms=self.time_limit_ms)
        metadata = SolverMetadata(
            objective=outcome.objective, primary_status=outcome.primary_status,
            peak_tiebreak_status=outcome.secondary_status,
            primary_optimum_usd=outcome.primary_optimum_usd, warnings=outcome.warnings)
        if outcome.schedules is None:
            return SchedulingResult(
                status=outcome.status, baseline=baseline, solver_metadata=metadata,
                infeasibility_reasons=outcome.reasons if outcome.status == 'infeasible' else [],
                failure_reasons=[] if outcome.status == 'infeasible' else outcome.reasons)
        schedules = {key: list(value) for key, value in baseline.equipment_schedules_kw.items()}
        schedules.update({key: value for key, value in outcome.schedules.items() if key.startswith('ev:')})
        try:
            optimized = evaluate_building_schedules(config, schedules)
            if optimized.constraint_violations:
                raise ValueError('; '.join(optimized.constraint_violations))
        except Exception as exc:
            return SchedulingResult(status='verification_failed', baseline=baseline,
                                    solver_metadata=metadata, failure_reasons=[str(exc)])
        return SchedulingResult(
            status=outcome.status, baseline=baseline, optimized=optimized,
            comparison=_comparison(config, baseline, optimized), constraints_satisfied=True,
            solver_metadata=metadata)
