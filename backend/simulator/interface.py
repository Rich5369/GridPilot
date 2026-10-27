"""EE-owned baseline functions, independent of HTTP and UI frameworks."""
from backend.models.contracts import BaselineResult, Scenario
from backend.optimizer.constraints import demand_limit_violations, equipment_window_violations
from backend.simulator.energy import peak_demand_kw, sum_loads
from backend.simulator.tariff import total_energy_charges


def _charge_on_arrival(start, end, energy, power):
    schedule = [0.0] * 24
    remaining = energy
    for h in range(start, end):
        schedule[h] = min(power, remaining)
        remaining = max(0.0, remaining - schedule[h])
    return schedule


def baseline_schedules(scenario: Scenario) -> dict[str, list[float]]:
    """Start immediately at max power, with fractional final-hour average.

    No capacity-aware shifting: an uncontrolled baseline may exceed the building
    limit. Impossible energy requests produce partial loads plus explicit reasons
    in simulate_baseline, never a silently successful result.
    """
    schedules = {"fixed": list(scenario.fixed_demand_kw)}
    for ev in scenario.ev_requirements:
        schedules[f"ev:{ev.id}"] = _charge_on_arrival(
            ev.arrival_hour, ev.deadline_hour, ev.energy_required_kwh, ev.max_charging_power_kw)
    for item in scenario.flexible_equipment:
        schedules[f"flexible:{item.id}"] = _charge_on_arrival(
            item.available_hours.start_hour, item.available_hours.end_hour,
            item.energy_required_kwh, item.max_power_kw)
    return schedules


def simulate_baseline(scenario: Scenario) -> BaselineResult:
    """Shared v0.1 energy-only contract; inspect constraint_violations."""
    scenario = Scenario.model_validate(scenario)
    demand = sum_loads(baseline_schedules(scenario).values())
    return BaselineResult(
        demand_kw=demand,
        electricity_cost_usd=total_energy_charges(demand, scenario.electricity_prices_usd_per_kwh),
        peak_demand_kw=peak_demand_kw(demand),
        constraint_violations=(equipment_window_violations(scenario)
                               + demand_limit_violations(demand, scenario.building_max_demand_kw)),
    )


def evaluate_scenario_schedules(scenario: Scenario,
                                schedules: dict[str, list[float]]) -> BaselineResult:
    """Evaluate supplied loads, requiring fixed/flexible baseline preservation.

    This is also used for solver verification; no loads are rescheduled here.
    BaselineResult's historical name does not change its energy-only semantics.
    """
    from backend.optimizer.constraints import schedule_violations
    from backend.simulator.energy import hourly_demand

    expected = {key: values for key, values in baseline_schedules(scenario).items()
                if not key.startswith("ev:")}
    if set(schedules) != set(expected) | {f"ev:{ev.id}" for ev in scenario.ev_requirements}:
        raise ValueError("Equipment schedule keys do not match configured scenario")
    checked = {key: hourly_demand(values).tolist() for key, values in schedules.items()}
    violations = schedule_violations(scenario, checked, expected)
    demand = sum_loads(checked.values())
    return BaselineResult(
        demand_kw=demand,
        electricity_cost_usd=total_energy_charges(demand, scenario.electricity_prices_usd_per_kwh),
        peak_demand_kw=peak_demand_kw(demand), constraint_violations=violations)
