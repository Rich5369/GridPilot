"""Reusable constraint checks; violations of an uncontrolled baseline aren't
proof that every possible optimized schedule is infeasible.
"""
from pydantic import TypeAdapter
from backend.models.contracts import HourlyDemand, Scenario

TOLERANCE = 1e-8


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
