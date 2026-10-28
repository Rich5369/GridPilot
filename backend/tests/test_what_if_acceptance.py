"""EE acceptance of the frontend's illustrative deadline/site-cap comparisons.

The fixed profiles and default requirements below mirror demoScenario.ts. They
are test inputs, not a new model/API. Browser captures are checked against these
complete Scenarios during acceptance, including fixed HVAC and flexible loads.
"""
import pytest

from backend.models.contracts import Scenario
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.scheduler import ORToolsSchedulingEngine
from backend.optimizer.solver import OBJECTIVE_TOLERANCE_USD, PHYSICAL_TOLERANCE
from backend.simulator.building import BuildingConfig

HVAC_KW = [0, 0, 0, 0, 0, 0, 1, 2, 4, 5, 5, 6, 6, 6, 6, 5, 5, 4, 2, 1, 0, 0, 0, 0]
COST_TOLERANCE = 2 * OBJECTIVE_TOLERANCE_USD


def what_if_config(deadline_hour: int, limit_kw: float) -> BuildingConfig:
    """Frontend defaults, with two 14.4 kWh EVs arriving at 15:00."""
    scenario = Scenario.model_validate(dict(
        operating_hours={'start_hour': 8, 'end_hour': 18},
        fixed_demand_kw=[1.5 + power for power in HVAC_KW],
        electricity_prices_usd_per_kwh=[0.28 if 14 <= h < 20 else 0.12 for h in range(24)],
        building_max_demand_kw=limit_kw,
        ev_requirements=[dict(id=f'office-ev-{i + 1}', arrival_hour=15,
                              deadline_hour=deadline_hour, energy_required_kwh=14.4,
                              max_charging_power_kw=7.2) for i in range(2)],
        flexible_equipment=[dict(id='office-equipment',
                                 available_hours={'start_hour': 10, 'end_hour': 16},
                                 energy_required_kwh=6, max_power_kw=3)],
    ))
    return BuildingConfig(
        name='Illustrative frontend What-if acceptance', scenario=scenario,
        background_loads_kw={'background': [1.5] * 24},
        hvac_demand_kw=HVAC_KW, hvac_max_power_kw=6,
    )


@pytest.fixture(scope='module')
def cases():
    configs = {(deadline, cap): what_if_config(deadline, cap)
               for deadline, cap in ((18, 25), (22, 25), (22, 15), (18, 15))}
    return {key: (config, ORToolsSchedulingEngine().optimize(config))
            for key, config in configs.items()}


def proven_minimum(result):
    """Feasibility alone does not establish the optimum used in inequalities."""
    assert result.status == 'optimal'
    assert result.solver_metadata.primary_status == 'optimal'
    assert result.solver_metadata.objective == 'energy_only'
    assert result.solver_metadata.primary_optimum_usd is not None
    return result.solver_metadata.primary_optimum_usd


@pytest.mark.parametrize('key,minimum,peak,cheap_ev_kwh', [
    ((18, 25), 25.184, 15.766666666666667, 0),
    ((22, 25), 20.576, 15.9, 28.8),
    ((22, 15), 20.864, 15, 27),
])
def test_demonstration_feasible_outcomes_and_independent_physics(cases, key, minimum, peak, cheap_ev_kwh):
    config, result = cases[key]
    assert proven_minimum(result) == pytest.approx(minimum, abs=COST_TOLERANCE, rel=0)
    assert result.solver_metadata.peak_tiebreak_status == 'optimal'
    optimized = result.optimized
    assert optimized is not None and optimized.constraint_violations == []
    assert result.constraints_satisfied and result.comparison.valid
    schedules = optimized.equipment_schedules_kw
    assert schedules['background:background'] == [1.5] * 24
    assert schedules['hvac'] == HVAC_KW
    # Held equipment consumes 6 kWh: 3 kW at 10:00 and 11:00, unchanged.
    assert schedules['flexible:office-equipment'] == [0] * 10 + [3, 3] + [0] * 12
    assert sum(config.scenario.fixed_demand_kw) == 94
    assert sum(schedules['flexible:office-equipment']) == 6
    for ev in config.scenario.ev_requirements:
        values = schedules[f'ev:{ev.id}']
        assert sum(values) == pytest.approx(14.4, abs=PHYSICAL_TOLERANCE, rel=0)
        assert all(0 <= value <= 7.2 + PHYSICAL_TOLERANCE for value in values)
        assert all(abs(value) <= PHYSICAL_TOLERANCE for h, value in enumerate(values)
                   if not 15 <= h < ev.deadline_hour)
    cheap = sum(sum(schedules[f'ev:{ev.id}'][20:22]) for ev in config.scenario.ev_requirements)
    assert cheap == pytest.approx(cheap_ev_kwh, abs=PHYSICAL_TOLERANCE, rel=0)
    demand = [sum(values[h] for values in schedules.values()) for h in range(24)]
    charges = [demand[h] * config.scenario.electricity_prices_usd_per_kwh[h] for h in range(24)]
    assert max(demand) <= config.scenario.building_max_demand_kw + PHYSICAL_TOLERANCE
    assert demand == pytest.approx(optimized.demand_kw, abs=PHYSICAL_TOLERANCE, rel=0)
    assert sum(demand) == pytest.approx(128.8, abs=PHYSICAL_TOLERANCE, rel=0)
    assert optimized.total_energy_kwh == pytest.approx(128.8, abs=PHYSICAL_TOLERANCE, rel=0)
    assert sum(charges) == pytest.approx(optimized.energy_charges_usd, abs=COST_TOLERANCE, rel=0)
    assert optimized.hourly_energy_charges_usd == pytest.approx(charges, abs=COST_TOLERANCE, rel=0)
    assert optimized.energy_charges_usd == pytest.approx(minimum, abs=COST_TOLERANCE, rel=0)
    assert max(demand) == pytest.approx(optimized.peak_demand_kw, abs=PHYSICAL_TOLERANCE, rel=0)
    assert max(demand) == pytest.approx(peak, abs=PHYSICAL_TOLERANCE, rel=0)
    # The shared boundary exposes the same energy-only metrics, not optimality.
    shared = optimize_scenario(config.scenario)
    assert shared.feasibility_status == 'feasible'
    assert shared.optimized_electricity_cost_usd == pytest.approx(minimum, abs=COST_TOLERANCE, rel=0)
    assert shared.optimized_peak_demand_kw == pytest.approx(peak, abs=PHYSICAL_TOLERANCE, rel=0)
    assert result.baseline.total_energy_kwh == pytest.approx(128.8, abs=PHYSICAL_TOLERANCE, rel=0)
    assert result.baseline.energy_charges_usd == pytest.approx(25.184, abs=COST_TOLERANCE, rel=0)
    assert result.baseline.peak_demand_kw == pytest.approx(20.9, abs=PHYSICAL_TOLERANCE, rel=0)


def test_later_deadline_preserves_service_and_cannot_increase_minimum(cases):
    early_config, early = cases[18, 25]
    later_config, later = cases[22, 25]
    assert early_config.scenario.fixed_demand_kw == later_config.scenario.fixed_demand_kw
    assert early_config.scenario.flexible_equipment == later_config.scenario.flexible_equipment
    for before, after in zip(early_config.scenario.ev_requirements, later_config.scenario.ev_requirements):
        assert before.energy_required_kwh == after.energy_required_kwh == 14.4
        assert before.max_charging_power_kw == after.max_charging_power_kw == 7.2
        assert before.arrival_hour == after.arrival_hour == 15
    assert proven_minimum(later) <= proven_minimum(early) + COST_TOLERANCE
    assert proven_minimum(early) - proven_minimum(later) == pytest.approx(4.608, abs=COST_TOLERANCE, rel=0)
    # The cheaper energy solution can have a higher peak: cost is primary.
    assert later.optimized.peak_demand_kw > early.optimized.peak_demand_kw


@pytest.mark.parametrize('deadline', [18, 22])
def test_tighter_cap_cannot_lower_proven_minimum_and_can_be_infeasible(cases, deadline):
    loose_config, loose = cases[deadline, 25]
    tight_config, tight = cases[deadline, 15]
    expected = loose_config.scenario.model_dump()
    expected['building_max_demand_kw'] = 15
    assert tight_config.scenario.model_dump() == expected
    loose_minimum = proven_minimum(loose)
    if deadline == 22:
        assert proven_minimum(tight) >= loose_minimum - COST_TOLERANCE
        assert proven_minimum(tight) - loose_minimum == pytest.approx(0.288, abs=COST_TOLERANCE, rel=0)
    else:
        assert tight.status == 'infeasible' and tight.optimized is None and tight.comparison is None
        assert any('26.5 kWh' in reason and '28.8 kWh' in reason for reason in tight.infeasibility_reasons)
        # Independent necessary bound: three available hourly site headrooms.
        assert sum(15 - tight_config.scenario.fixed_demand_kw[h] for h in range(15, 18)) == 26.5
        assert sum(ev.energy_required_kwh for ev in tight_config.scenario.ev_requirements) == 28.8
        shared = optimize_scenario(tight_config.scenario)
        assert shared.feasibility_status == 'infeasible' and shared.constraint_violations
        assert shared.optimized_demand_kw is None
        assert shared.optimized_electricity_cost_usd is None and shared.optimized_peak_demand_kw is None
        # Both baselines deliver full requested work even when they violate the cap.
        assert tight.baseline.total_energy_kwh == pytest.approx(128.8, abs=PHYSICAL_TOLERANCE, rel=0)
        assert tight.baseline.constraint_violations


def test_between_scenario_difference_is_not_each_baseline_benefit(cases):
    _, early = cases[18, 25]
    _, later = cases[22, 25]
    _, capped = cases[22, 15]
    assert early.comparison.energy_charge_reduction_usd == pytest.approx(0, abs=COST_TOLERANCE, rel=0)
    assert later.comparison.energy_charge_reduction_usd == pytest.approx(4.608, abs=COST_TOLERANCE, rel=0)
    assert capped.comparison.energy_charge_reduction_usd == pytest.approx(4.32, abs=COST_TOLERANCE, rel=0)
    # The UI's between-scenario sign is alternative minus current.
    assert later.optimized.energy_charges_usd - early.optimized.energy_charges_usd == pytest.approx(-4.608, abs=COST_TOLERANCE, rel=0)
    assert capped.optimized.energy_charges_usd - later.optimized.energy_charges_usd == pytest.approx(0.288, abs=COST_TOLERANCE, rel=0)
    assert later.optimized.total_energy_kwh == pytest.approx(early.optimized.total_energy_kwh, abs=PHYSICAL_TOLERANCE, rel=0)
    assert capped.optimized.total_energy_kwh == pytest.approx(later.optimized.total_energy_kwh, abs=PHYSICAL_TOLERANCE, rel=0)
