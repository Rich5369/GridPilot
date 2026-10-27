"""Proposed detailed solver boundary; no optimization is implemented here."""
from typing import Literal, Protocol
from pydantic import Field, model_validator
from backend.models.contracts import Contract
from backend.simulator.building import BuildingConfig, FiniteValue, SimulationResult


class OptimizationComparison(Contract):
    baseline_cost_usd: FiniteValue
    optimized_cost_usd: FiniteValue
    modeled_cost_reduction_usd: FiniteValue


class SchedulingResult(Contract):
    status: Literal["feasible", "infeasible", "not_implemented"]
    baseline: SimulationResult
    optimized: SimulationResult | None = None
    comparison: OptimizationComparison | None = None
    constraints_satisfied: bool = False
    infeasibility_reasons: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_outcome(self):
        if self.status == "feasible":
            if (self.optimized is None or self.optimized.feasibility_status != "feasible"
                    or not self.constraints_satisfied or self.comparison is None
                    or self.infeasibility_reasons):
                raise ValueError("Feasible result needs validated schedules, comparison and satisfied constraints")
        elif self.optimized is not None or self.comparison is not None or self.constraints_satisfied:
            raise ValueError("Unavailable optimization cannot supply optimized values")
        if self.status == "infeasible" and not self.infeasibility_reasons:
            raise ValueError("Infeasible optimization needs reasons")
        return self


class SchedulingEngine(Protocol):
    """Future OR-Tools engine: EV shifting first, flexible scheduling second.

    Respect windows, energy, charger power and aggregate building demand limits.
    Prove infeasibility with the solver; a baseline overload alone is insufficient.
    Keep HVAC fixed. Preserve the existing optimize_scenario adapter for the API.
    """
    def optimize(self, config: BuildingConfig) -> SchedulingResult: ...
