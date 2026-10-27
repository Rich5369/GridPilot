"""Daily energy charges and explicitly conditional monthly demand estimates."""
from pydantic import TypeAdapter
from backend.models.contracts import HourlyPrices, NonNegative
from backend.simulator.building import Tariff
from backend.simulator.energy import hourly_demand


def hourly_energy_charges(demand_kw, prices_usd_per_kwh) -> list[float]:
    prices = TypeAdapter(HourlyPrices).validate_python(prices_usd_per_kwh)
    return (hourly_demand(demand_kw) * prices).tolist()


def total_energy_charges(demand_kw, prices_usd_per_kwh) -> float:
    return sum(hourly_energy_charges(demand_kw, prices_usd_per_kwh))


def incremental_demand_charge(peak_kw: float, tariff: Tariff) -> float | None:
    """Additional monthly charge above a known pre-day billing peak.

    Assumes all-hour peak billing, no ratchet, and hourly measurement. Returns
    None when a nonzero rate has no supplied billing history; never assumes zero.
    """
    peak = TypeAdapter(NonNegative).validate_python(peak_kw)
    if tariff.demand_charge_usd_per_kw == 0:
        return 0.0
    if tariff.existing_monthly_peak_kw is None:
        return None
    return max(0.0, peak - tariff.existing_monthly_peak_kw) * tariff.demand_charge_usd_per_kw

