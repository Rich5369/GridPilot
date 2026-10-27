import pytest
from backend.simulator.building import Tariff
from backend.simulator.tariff import hourly_energy_charges, total_energy_charges, incremental_demand_charge


def test_time_of_use_charges():
    # 12 hours * 2 kW * $0.10 + 12 hours * 2 kW * $0.30 = $9.60
    charges = hourly_energy_charges([2] * 24, [0.1] * 12 + [0.3] * 12)
    assert charges == pytest.approx([0.2] * 12 + [0.6] * 12)
    assert total_energy_charges([2] * 24, [0.1] * 12 + [0.3] * 12) == pytest.approx(9.6)


def test_negative_prices():
    assert total_energy_charges([2] * 24, [-0.1] * 24) == pytest.approx(-4.8)


def test_conditional_incremental_demand_charge():
    tariff = Tariff(demand_charge_usd_per_kw=10, existing_monthly_peak_kw=20)
    assert incremental_demand_charge(25, tariff) == 50
    assert incremental_demand_charge(15, tariff) == 0
    assert incremental_demand_charge(25, Tariff(demand_charge_usd_per_kw=10)) is None
    assert incremental_demand_charge(25, Tariff()) == 0
