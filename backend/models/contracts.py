"""Preliminary single-day contracts. See docs/contracts.md for interval semantics."""
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

NonNegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
HourlyDemand = Annotated[list[NonNegative], Field(min_length=24, max_length=24)]
HourlyPrices = Annotated[
    list[Annotated[float, Field(allow_inf_nan=False)]],
    Field(min_length=24, max_length=24),
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HourWindow(Contract):
    start_hour: int = Field(ge=0, le=23, strict=True)
    end_hour: int = Field(ge=1, le=24, strict=True)

    @model_validator(mode="after")
    def ordered_window(self) -> Self:
        if self.end_hour <= self.start_hour:
            raise ValueError("end_hour must be after start_hour within the same day")
        return self


class EVRequirement(Contract):
    id: str = Field(min_length=1)
    arrival_hour: int = Field(ge=0, le=23, strict=True)
    deadline_hour: int = Field(ge=1, le=24, strict=True)
    energy_required_kwh: NonNegative
    max_charging_power_kw: Positive

    @model_validator(mode="after")
    def ordered_window(self) -> Self:
        if self.deadline_hour <= self.arrival_hour:
            raise ValueError("deadline_hour must be after arrival_hour")
        return self


class FlexibleEquipment(Contract):
    id: str = Field(min_length=1)
    available_hours: HourWindow
    energy_required_kwh: NonNegative
    max_power_kw: Positive


class Scenario(Contract):
    operating_hours: HourWindow
    fixed_demand_kw: HourlyDemand
    electricity_prices_usd_per_kwh: HourlyPrices
    building_max_demand_kw: Positive
    ev_requirements: list[EVRequirement] = Field(default_factory=list)
    flexible_equipment: list[FlexibleEquipment] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        for collection in (self.ev_requirements, self.flexible_equipment):
            ids = [item.id for item in collection]
            if len(ids) != len(set(ids)):
                raise ValueError("IDs must be unique within each equipment collection")
        return self


class BaselineResult(Contract):
    demand_kw: HourlyDemand
    electricity_cost_usd: float = Field(allow_inf_nan=False)
    peak_demand_kw: NonNegative
    constraint_violations: list[str] = Field(default_factory=list)


class OptimizationResult(Contract):
    """Verified feasible or proven infeasible result returned by the HTTP API."""
    feasibility_status: Literal["feasible", "infeasible"]
    baseline_electricity_cost_usd: float = Field(allow_inf_nan=False)
    baseline_peak_demand_kw: NonNegative
    baseline_demand_kw: HourlyDemand
    optimized_electricity_cost_usd: float | None = Field(default=None, allow_inf_nan=False)
    optimized_peak_demand_kw: NonNegative | None = None
    optimized_demand_kw: HourlyDemand | None = None
    constraint_violations: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_result(self) -> Self:
        optimized = (self.optimized_electricity_cost_usd,
                     self.optimized_peak_demand_kw, self.optimized_demand_kw)
        if self.feasibility_status == "feasible":
            if any(value is None for value in optimized) or self.constraint_violations:
                raise ValueError("feasible results require all optimized values and no violations")
        elif any(value is not None for value in optimized) or not self.constraint_violations:
            raise ValueError("infeasible results require reasons and null optimized values")
        return self


class HealthResponse(Contract):
    status: Literal["ok"] = "ok"
    project: Literal["GridPilot"] = "GridPilot"


class NotImplementedResponse(Contract):
    status: Literal["not_implemented"] = "not_implemented"
    message: str = "Optimization is not implemented yet. No calculations were performed."
