import json
from pathlib import Path
from copy import deepcopy
import pytest
from pydantic import ValidationError
from backend.models.contracts import Scenario
from backend.simulator import simulate_baseline, simulate_building
from backend.simulator.building import BuildingConfig
from backend.simulator.energy import sum_loads
from backend.simulator.interface import baseline_schedules
from backend.optimizer.scheduler import SchedulingResult

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / 'sample_data/commercial_office.json').read_text())


def test_sample_hand_calculated_totals():
    result = simulate_building(SAMPLE)
    assert result.feasibility_status == 'feasible'
    assert not result.constraint_violations
    # Background: 37 + 45.6 + 14.4 + 12 = 109; HVAC: 65;
    # EVs: 18 + 12; flexible equipment: 4 -> 208 kWh.
    assert result.total_energy_kwh == pytest.approx(208)
    # Hour 9: fixed 14.1 + EV1 7.2 + EV2 7.2 = 28.5 kW.
    assert result.peak_demand_kw == pytest.approx(28.5)
    # Tariff bands: 14*.10 + 151.8*.18 + 36.2*.30 + 6*.10.
    assert result.energy_charges_usd == pytest.approx(40.184)
    assert result.incremental_demand_charge_usd == pytest.approx(6)
    assert result.baseline_operating_cost_usd == pytest.approx(48.184)
    assert len(result.demand_kw) == len(result.hourly_energy_charges_usd) == 24
    assert all(len(s) == 24 for s in result.equipment_schedules_kw.values())
    assert sum_loads(result.equipment_schedules_kw.values()) == pytest.approx(result.demand_kw)
    assert simulate_building(SAMPLE) == result


def test_ev_energy_power_and_windows():
    result = simulate_building(SAMPLE)
    for ev in SAMPLE['scenario']['ev_requirements']:
        loads = result.equipment_schedules_kw[f"ev:{ev['id']}"]
        assert sum(loads) == pytest.approx(ev['energy_required_kwh'])
        assert max(loads) <= ev['max_charging_power_kw']
        assert all(p == 0 for h, p in enumerate(loads)
                   if not ev['arrival_hour'] <= h < ev['deadline_hour'])
    assert result.equipment_schedules_kw['ev:ev1'][8:11] == pytest.approx([7.2, 7.2, 3.6])
    assert result.equipment_schedules_kw['flexible:water_heater'][10:12] == [2, 2]


def test_infeasible_ev_is_explicit_with_partial_delivery():
    config = deepcopy(SAMPLE)
    config['scenario']['ev_requirements'][0]['energy_required_kwh'] = 100
    result = simulate_building(config)
    assert result.feasibility_status == 'infeasible'
    assert any('EV ev1' in reason for reason in result.constraint_violations)
    assert sum(result.equipment_schedules_kw['ev:ev1']) == pytest.approx(64.8)
    assert result.warnings


def test_baseline_overload_is_reported_without_curtailing_loads():
    config = deepcopy(SAMPLE)
    config['scenario']['building_max_demand_kw'] = 20
    result = simulate_building(config)
    assert result.peak_demand_kw == pytest.approx(28.5)
    assert result.feasibility_status == 'infeasible'
    assert any('building limit' in reason for reason in result.constraint_violations)


def test_unknown_billing_history_does_not_invent_cost():
    config = deepcopy(SAMPLE)
    config['tariff']['existing_monthly_peak_kw'] = None
    result = simulate_building(config)
    assert result.incremental_demand_charge_usd is None
    assert result.baseline_operating_cost_usd is None
    assert result.energy_charges_usd == pytest.approx(40.184)


@pytest.mark.parametrize('change', ['hvac_limit', 'fixed_mismatch', 'negative_fee'])
def test_invalid_engineering_inputs(change):
    config = deepcopy(SAMPLE)
    if change == 'hvac_limit':
        config['hvac_max_power_kw'] = 1
    elif change == 'fixed_mismatch':
        config['scenario']['fixed_demand_kw'][0] = 999
    else:
        config['tariff']['fixed_charge_usd'] = -1
    with pytest.raises(ValidationError):
        BuildingConfig.model_validate(config)


def test_shared_contract_and_authoritative_fixed_loads():
    scenario = Scenario.model_validate(dict(
        operating_hours={'start_hour':8,'end_hour':18}, fixed_demand_kw=[1]*24,
        electricity_prices_usd_per_kwh=[0.2]*24, building_max_demand_kw=10))
    result = simulate_baseline(scenario)
    assert result.demand_kw == [1]*24
    assert result.electricity_cost_usd == pytest.approx(4.8)
    assert baseline_schedules(scenario) == {'fixed':[1]*24}


def test_zero_energy_and_infeasible_flexible_load():
    config = deepcopy(SAMPLE)
    config['scenario']['ev_requirements'][0]['energy_required_kwh'] = 0
    config['scenario']['flexible_equipment'][0]['energy_required_kwh'] = 20
    result = simulate_building(config)
    assert sum(result.equipment_schedules_kw['ev:ev1']) == 0
    assert any('Equipment water_heater' in reason for reason in result.constraint_violations)
    assert sum(result.equipment_schedules_kw['flexible:water_heater']) == 12


def test_future_optimizer_contract_requires_reasons():
    baseline = simulate_building(SAMPLE)
    result = SchedulingResult(status='not_implemented', baseline=baseline)
    assert result.optimized is None
    with pytest.raises(ValidationError):
        SchedulingResult(status='infeasible', baseline=baseline)
