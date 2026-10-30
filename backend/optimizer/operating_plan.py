"""Serialize and reconcile one existing verified outcome; never invoke a solver."""
from backend.models.contracts import DeviceSchedule, HourWindow, OperatingPlan
from backend.optimizer.constraints import movable_equipment
from backend.optimizer.solver import OBJECTIVE_TOLERANCE_USD, PHYSICAL_TOLERANCE
from backend.simulator.energy import sum_loads
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules
from backend.simulator.tariff import total_energy_charges


def _reconcile(scenario, schedules, metrics):
    demand = sum_loads(schedules.values())
    if (any(abs(a-b) > PHYSICAL_TOLERANCE for a, b in zip(demand, metrics.demand_kw))
            or abs(sum(demand)-sum(metrics.demand_kw)) > PHYSICAL_TOLERANCE
            or abs(max(demand)-metrics.peak_demand_kw) > PHYSICAL_TOLERANCE
            or abs(total_energy_charges(demand, scenario.electricity_prices_usd_per_kwh)
                   - metrics.electricity_cost_usd) > 2*OBJECTIVE_TOLERANCE_USD):
        raise ValueError('Returned device schedules do not reconcile with aggregate demand, energy, cost or peak')


def build_operating_plan(scenario, baseline, outcome, *, optimize_flexible):
    """Copy actual arrays; a failed/infeasible solve never becomes an actionable plan."""
    feasible = outcome.status in ('optimal', 'feasible')
    if feasible and (outcome.schedules is None or outcome.evaluated is None):
        raise ValueError('Successful outcome is missing verified schedules or metrics')
    if not feasible and (outcome.schedules is not None or outcome.evaluated is not None):
        raise ValueError('Infeasible outcome must not contain optimized values')
    uncontrolled = baseline_schedules(scenario)
    devices = []
    for key, _, start, end, energy, power in movable_equipment(scenario, optimize_flexible=True):
        kind, identifier = key.split(':', 1)
        optimized = list(outcome.schedules[key]) if feasible else None
        devices.append(DeviceSchedule(
            device_id=identifier, device_type=kind,
            scheduling_role='held_at_baseline' if kind == 'flexible' and not optimize_flexible else 'optimized',
            required_energy_kwh=energy, available_hours=HourWindow(start_hour=start, end_hour=end),
            max_power_kw=power, baseline_power_kw=list(uncontrolled[key]),
            baseline_delivered_energy_kwh=sum(uncontrolled[key]), optimized_power_kw=optimized,
            optimized_delivered_energy_kwh=None if optimized is None else sum(optimized)))
    plan = OperatingPlan(
        scheduling_mode='joint' if optimize_flexible else 'ev_only', solver_status=outcome.status,
        primary_status=outcome.primary_status, peak_tiebreak_status=outcome.secondary_status,
        primary_optimum_usd=outcome.primary_optimum_usd,
        verification_status='passed' if feasible else 'unavailable', warnings=list(outcome.warnings),
        baseline_constraint_violations=list(baseline.constraint_violations), device_schedules=devices)
    def reconstruct(field):
        return {'fixed': list(scenario.fixed_demand_kw), **{
            f'{d.device_type}:{d.device_id}': getattr(d, field) for d in plan.device_schedules}}
    _reconcile(scenario, reconstruct('baseline_power_kw'), baseline)
    if feasible:
        # Validate the actual serialized arrays, not a different optimal allocation.
        schedules = reconstruct('optimized_power_kw')
        evaluated = evaluate_scenario_schedules(scenario, schedules, optimize_flexible=optimize_flexible)
        if evaluated.constraint_violations:
            raise ValueError('; '.join(evaluated.constraint_violations))
        if set(schedules) != set(outcome.schedules) or any(
                schedules[key] != outcome.schedules[key] for key in schedules):
            raise ValueError('Serialized plan must preserve the exact same-solve component arrays')
        _reconcile(scenario, schedules, outcome.evaluated)
    return plan
