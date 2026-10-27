"""Engineering inputs, reusing shared interval, equipment and unit contracts."""
from typing import Annotated, Literal

from pydantic import Field, model_validator

from backend.models.contracts import (
    Contract, HourlyDemand, NonNegative, Scenario,
)


FiniteValue = Annotated[float, Field(allow_inf_nan=False)]


class Tariff(Contract):
    """Fixed fee is allocated to this day; demand fee is incremental monthly peak."""
    fixed_charge_usd: NonNegative = 0
    demand_charge_usd_per_kw: NonNegative = 0
    existing_monthly_peak_kw: NonNegative | None = None


class BuildingConfig(Contract):
    name: str = Field(min_length=1)
    scenario: Scenario
    background_loads_kw: dict[str, HourlyDemand]
    hvac_demand_kw: HourlyDemand
    hvac_max_power_kw: NonNegative
    tariff: Tariff = Field(default_factory=Tariff)

    @model_validator(mode="after")
    def consistent_fixed_loads(self):
        for h in range(24):
            if self.hvac_demand_kw[h] > self.hvac_max_power_kw:
                raise ValueError("HVAC schedule exceeds maximum electrical power")
            fixed = self.hvac_demand_kw[h] + sum(v[h] for v in self.background_loads_kw.values())
            if abs(fixed - self.scenario.fixed_demand_kw[h]) > 1e-8:
                raise ValueError("Background plus HVAC must equal scenario fixed demand")
        return self


class SimulationResult(Contract):
    feasibility_status: Literal["feasible", "infeasible"]
    demand_kw: HourlyDemand
    equipment_schedules_kw: dict[str, HourlyDemand]
    total_energy_kwh: NonNegative
    hourly_energy_charges_usd: Annotated[list[FiniteValue], Field(min_length=24, max_length=24)]
    energy_charges_usd: FiniteValue
    peak_demand_kw: NonNegative
    fixed_charge_usd: NonNegative
    incremental_demand_charge_usd: NonNegative | None
    baseline_operating_cost_usd: FiniteValue | None
    constraint_violations: list[str]
    assumptions: list[str]
    warnings: list[str]
