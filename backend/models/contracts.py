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


class DeviceSchedule(Contract):
    """One configured item; arrays are hourly averages, never rounded instructions."""
    device_id: str = Field(min_length=1)
    device_type: Literal['ev', 'flexible']
    scheduling_role: Literal['optimized', 'held_at_baseline']
    required_energy_kwh: NonNegative
    available_hours: HourWindow
    max_power_kw: Positive
    baseline_power_kw: HourlyDemand
    baseline_delivered_energy_kwh: NonNegative
    optimized_power_kw: HourlyDemand | None = None
    optimized_delivered_energy_kwh: NonNegative | None = None

    @model_validator(mode='after')
    def consistent_energy(self) -> Self:
        if abs(sum(self.baseline_power_kw) - self.baseline_delivered_energy_kwh) > 1e-6:
            raise ValueError('Baseline delivered energy must match the supplied schedule')
        if (self.optimized_power_kw is None) != (self.optimized_delivered_energy_kwh is None):
            raise ValueError('Optimized power and delivered energy must both be present or null')
        if self.optimized_power_kw is not None and abs(
                sum(self.optimized_power_kw) - self.optimized_delivered_energy_kwh) > 1e-6:
            raise ValueError('Optimized delivered energy must match the supplied schedule')
        return self


class OperatingPlan(Contract):
    """Additive same-solve detail; successful verification refers to optimized loads."""
    scheduling_mode: Literal['ev_only', 'joint']
    solver_status: Literal['optimal', 'feasible', 'infeasible']
    primary_status: Literal['optimal', 'feasible', 'infeasible', 'analytic_infeasibility']
    peak_tiebreak_status: Literal['optimal', 'feasible', 'unresolved', 'not_run']
    primary_optimum_usd: float | None = Field(default=None, allow_inf_nan=False)
    verification_status: Literal['passed', 'unavailable']
    warnings: list[str] = Field(default_factory=list)
    baseline_constraint_violations: list[str] = Field(default_factory=list)
    device_schedules: list[DeviceSchedule]

    @model_validator(mode='after')
    def consistent_quality(self) -> Self:
        keys = [(device.device_type, device.device_id) for device in self.device_schedules]
        if len(set(keys)) != len(keys):
            raise ValueError('Device identities must be unique within each type')
        if self.solver_status == 'infeasible':
            if (self.verification_status != 'unavailable' or self.primary_optimum_usd is not None
                    or self.primary_status not in ('infeasible', 'analytic_infeasibility')
                    or self.peak_tiebreak_status != 'not_run'
                    or any(d.optimized_power_kw is not None for d in self.device_schedules)):
                raise ValueError('Infeasible plans cannot supply verified optimized schedules or optima')
        else:
            if self.verification_status != 'passed' or any(
                    d.optimized_power_kw is None for d in self.device_schedules):
                raise ValueError('Feasible plans need verified optimized schedules for every device')
            if self.solver_status == 'optimal':
                if self.primary_status != 'optimal' or self.primary_optimum_usd is None:
                    raise ValueError('Optimal status requires an actual primary optimality proof')
            elif (self.primary_status != 'feasible' or self.primary_optimum_usd is not None
                  or self.peak_tiebreak_status != 'not_run'):
                raise ValueError('An unproved feasible result cannot claim an optimum or peak solve')
        return self


class OptimizationResult(Contract):
    """Verified feasible or proven infeasible result returned by the HTTP API."""
    result_id: str | None = Field(default=None, max_length=64)
    feasibility_status: Literal["feasible", "infeasible"]
    baseline_electricity_cost_usd: float = Field(allow_inf_nan=False)
    baseline_peak_demand_kw: NonNegative
    baseline_demand_kw: HourlyDemand
    optimized_electricity_cost_usd: float | None = Field(default=None, allow_inf_nan=False)
    optimized_peak_demand_kw: NonNegative | None = None
    optimized_demand_kw: HourlyDemand | None = None
    constraint_violations: list[str] = Field(default_factory=list)
    operating_plan: OperatingPlan | None = None

    @model_validator(mode="after")
    def consistent_result(self) -> Self:
        optimized = (self.optimized_electricity_cost_usd,
                     self.optimized_peak_demand_kw, self.optimized_demand_kw)
        if self.feasibility_status == "feasible":
            if any(value is None for value in optimized) or self.constraint_violations:
                raise ValueError("feasible results require all optimized values and no violations")
        elif any(value is not None for value in optimized) or not self.constraint_violations:
            raise ValueError("infeasible results require reasons and null optimized values")
        if self.operating_plan is not None and (
                (self.operating_plan.solver_status == 'infeasible')
                != (self.feasibility_status == 'infeasible')):
            raise ValueError('Operating plan quality must agree with aggregate feasibility')
        return self


class HealthResponse(Contract):
    status: Literal["ok"] = "ok"
    project: Literal["GridPilot"] = "GridPilot"


class NotImplementedResponse(Contract):
    status: Literal["not_implemented"] = "not_implemented"
    message: str = "Optimization is not implemented yet. No calculations were performed."
