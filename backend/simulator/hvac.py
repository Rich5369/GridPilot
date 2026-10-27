"""Predetermined electrical HVAC profile; no thermal or comfort optimization."""
from backend.simulator.building import BuildingConfig


def hvac_schedule(config: BuildingConfig) -> list[float]:
    return list(config.hvac_demand_kw)
