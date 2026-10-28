"""Reusable constraint checks; violations of an uncontrolled baseline aren't
proof that every possible optimized schedule is infeasible.
"""
from pydantic import TypeAdapter
from backend.models.contracts import HourlyDemand, Scenario

TOLERANCE = 1e-8


def movable_equipment(scenario: Scenario, *, optimize_flexible: bool = False):
    """(key, label, start, exclusive end, kWh, kW) for the selected LP mode."""
    items = [(f"ev:{ev.id}", f"EV {ev.id}", ev.arrival_hour, ev.deadline_hour,
              ev.energy_required_kwh, ev.max_charging_power_kw)
             for ev in scenario.ev_requirements]
    if optimize_flexible:
        items += [(f"flexible:{item.id}", f"Equipment {item.id}",
                   item.available_hours.start_hour, item.available_hours.end_hour,
                   item.energy_required_kwh, item.max_power_kw)
                  for item in scenario.flexible_equipment]
    return items


def demand_limit_violations(demand_kw, limit_kw: float) -> list[str]:
    return [f"Hour {h}: demand {power:g} kW exceeds building limit {limit_kw:g} kW"
            for h, power in enumerate(TypeAdapter(HourlyDemand).validate_python(demand_kw))
            if power > limit_kw + TOLERANCE]


def equipment_window_violations(scenario: Scenario) -> list[str]:
    reasons = []
    for item in scenario.ev_requirements:
        if item.energy_required_kwh > (item.deadline_hour - item.arrival_hour) * item.max_charging_power_kw + TOLERANCE:
            reasons.append(f"EV {item.id}: required energy exceeds availability-window capacity")
    for item in scenario.flexible_equipment:
        window = item.available_hours
        if item.energy_required_kwh > (window.end_hour - window.start_hour) * item.max_power_kw + TOLERANCE:
            reasons.append(f"Equipment {item.id}: required energy exceeds availability-window capacity")
    return reasons


def schedule_violations(scenario: Scenario, schedules: dict[str, list[float]],
                        expected_fixed: dict[str, list[float]],
                        tolerance: float = 1e-6, *,
                        optimize_flexible: bool = False) -> list[str]:
    """Check supplied schedules independently of solver expressions.

    Caller validates vector shape/finite values. Fixed keys must match exactly;
    EV and flexible energy, bounds and windows are checked at full precision.
    Small floating-point discrepancies use an absolute kW/kWh tolerance.
    """
    reasons = []
    expected_keys = set(expected_fixed) | {
        item[0] for item in movable_equipment(scenario, optimize_flexible=optimize_flexible)}
    if set(schedules) != expected_keys:
        return ["Equipment schedule keys do not match the configured building"]
    for key, expected in expected_fixed.items():
        matches = schedules[key] == expected
        if key == "fixed":
            matches = all(abs(a - b) <= 1e-8 for a, b in zip(schedules[key], expected))
        if not matches:
            reasons.append(f"Fixed schedule {key} changed")
    # Every item is checked, including flexible loads held fixed in EV-only mode.
    equipment = movable_equipment(scenario, optimize_flexible=True)
    for key, label, start, end, energy, power in equipment:
        values = schedules[key]
        if abs(sum(values) - energy) > tolerance:
            reasons.append(f"{label}: delivered energy does not equal required {energy:g} kWh")
        for h, value in enumerate(values):
            if value < -tolerance or value > power + tolerance:
                reasons.append(f"{label}: hour {h} violates charger/equipment power bounds")
            if not start <= h < end and abs(value) > tolerance:
                reasons.append(f"{label}: hour {h} lies outside availability window")
    for h in range(24):
        demand = sum(values[h] for values in schedules.values())
        if demand > scenario.building_max_demand_kw + tolerance:
            reasons.append(f"Hour {h}: demand {demand:g} kW exceeds building limit {scenario.building_max_demand_kw:g} kW")
    return reasons
