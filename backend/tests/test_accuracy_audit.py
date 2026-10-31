"""Independent rational enumeration + raw JSON audit; all inputs synthetic."""
from copy import deepcopy
import pytest
from backend.models.contracts import Scenario
from backend.optimizer.interface import optimize_scenario
from backend.verification.accuracy import check_result, exhaustive_cost, small_case




@pytest.mark.parametrize('seed', range(100))
@pytest.mark.parametrize('mode', ['ev_only', 'joint'])
def test_exact_exhaustive_primary_optimum_and_feasibility(seed, mode):
    raw = small_case(seed)
    expected = exhaustive_cost(raw, mode)
    result = optimize_scenario(Scenario.model_validate(raw), optimize_flexible=mode=='joint').model_dump(mode='json')
    check_result(raw, result, mode)
    assert (result['feasibility_status'] == 'feasible') == (expected is not None)
    if expected is not None:
        assert abs(result['optimized_electricity_cost_usd'] - float(expected)) <= 2e-7


@pytest.mark.parametrize('power,energy', [(0.25,0), (0.75,0.625), (10, 3.1415926535)])
def test_fractional_energy_last_hour_and_repeated_requests(power, energy):
    raw = small_case(1)
    raw.update(fixed_demand_kw=[0.125]*24, building_max_demand_kw=20, flexible_equipment=[],
               ev_requirements=[dict(id='last-hour',arrival_hour=23,deadline_hour=24,energy_required_kwh=energy,max_charging_power_kw=power)])
    costs = []
    for _ in range(3):
        result = optimize_scenario(Scenario.model_validate(raw)).model_dump(mode='json')
        check_result(raw,result,'ev_only')
        assert result['feasibility_status']=='feasible'
        costs.append(result['optimized_electricity_cost_usd'])
    assert max(costs)-min(costs) <= 2e-7


def test_checker_detects_corrupted_device_cost_peak_window_and_aggregate():
    raw = small_case(0)
    raw.update(building_max_demand_kw=10,ev_requirements=[dict(id='a',arrival_hour=0,deadline_hour=3,energy_required_kwh=1,max_charging_power_kw=1)],flexible_equipment=[])
    original = optimize_scenario(Scenario.model_validate(raw)).model_dump(mode='json')
    for mutation in ('cost', 'peak', 'window', 'aggregate', 'device_energy'):
        result = deepcopy(original)
        if mutation == 'cost': result['optimized_electricity_cost_usd'] += .01
        elif mutation == 'peak': result['optimized_peak_demand_kw'] += .01
        elif mutation == 'aggregate': result['optimized_demand_kw'][0] += .01
        elif mutation == 'window': result['operating_plan']['device_schedules'][0]['optimized_power_kw'][23] = .01
        else: result['operating_plan']['device_schedules'][0]['optimized_delivered_energy_kwh'] += .01
        with pytest.raises(AssertionError): check_result(raw,result,'ev_only')


@pytest.mark.parametrize('price', [-100.0, 0, 100.0])
def test_equal_price_analytic_peak_and_energy(price):
    raw = dict(operating_hours=dict(start_hour=0,end_hour=24),fixed_demand_kw=[1.0]*24,building_max_demand_kw=5,
        electricity_prices_usd_per_kwh=[price]*24,ev_requirements=[dict(id='balanced',arrival_hour=0,deadline_hour=24,energy_required_kwh=12,max_charging_power_kw=2)])
    r=optimize_scenario(Scenario.model_validate(raw)).model_dump(mode='json')
    metrics=check_result(raw,r,'ev_only')
    # Conservation gives peak >= daily total/24; a constant 0.5 kW EV attains it.
    assert r['optimized_peak_demand_kw']==pytest.approx(1.5,abs=1e-6)
    assert metrics['optimized']['cost_usd']==pytest.approx(36*price,abs=2e-7)
    if price<=0: assert metrics['cost_difference_percent'] is None


@pytest.mark.parametrize('existing_peak,expected_energy,expected_peak', [(0,7.6,2), (1,7.6,2), (3,7.3,3)])
def test_conditional_demand_objective_has_hand_solved_optimum(existing_peak,expected_energy,expected_peak):
    from backend.simulator.building import BuildingConfig
    from backend.optimizer.scheduler import ORToolsSchedulingEngine
    raw=dict(operating_hours=dict(start_hour=0,end_hour=24), fixed_demand_kw=[1]*24,
        electricity_prices_usd_per_kwh=[.4,.1]+[.3]*22, building_max_demand_kw=5,
        ev_requirements=[dict(id='two-hour',arrival_hour=0,deadline_hour=2,energy_required_kwh=2,max_charging_power_kw=2)])
    config=BuildingConfig(name='Synthetic conditional demand example',scenario=raw,background_loads_kw={'base':[1]*24},hvac_demand_kw=[0]*24,hvac_max_power_kw=0,
        tariff={'fixed_charge_usd':.5,'demand_charge_usd_per_kw':1,'existing_monthly_peak_kw':existing_peak})
    result=ORToolsSchedulingEngine().optimize(config)
    assert result.status=='optimal'
    optimized=result.optimized
    assert optimized.energy_charges_usd==pytest.approx(expected_energy,abs=2e-7)
    assert optimized.peak_demand_kw==pytest.approx(expected_peak,abs=1e-6)
    expected=expected_energy+.5+max(0,expected_peak-existing_peak)
    assert optimized.baseline_operating_cost_usd==pytest.approx(expected,abs=2e-7)
    # Let x be EV kW at cheap hour 1; other hour is 2-x. Cost is
    # 7.9-0.3*x + max(0, max(3-x,1+x)-history). With history <=1
    # the kink x=1 wins; history=3 leaves energy-only optimum x=2.
