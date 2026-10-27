"""Electrical arithmetic for 24 one-hour average power intervals."""
import numpy as np
from pydantic import TypeAdapter
from backend.models.contracts import HourlyDemand


def hourly_demand(values) -> np.ndarray:
    return np.asarray(TypeAdapter(HourlyDemand).validate_python(values), dtype=float)


def total_energy_kwh(demand_kw) -> float:
    """Sum average kW × one hour, yielding kWh."""
    return float(hourly_demand(demand_kw).sum())


def peak_demand_kw(demand_kw) -> float:
    """Maximum hourly average, not necessarily utility billing demand."""
    return float(hourly_demand(demand_kw).max())


def sum_loads(schedules) -> list[float]:
    total = np.zeros(24)
    for schedule in schedules:
        total += hourly_demand(schedule)
    return hourly_demand(total.tolist()).tolist()
