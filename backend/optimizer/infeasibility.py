"""Numerical certificates for existing checks; no optimization or inferred repairs.

Internal records feed the additive HTTP extension. Legacy messages and every
existing comparison are preserved; the solver never depends on HTTP models.
"""
from dataclasses import asdict, dataclass
from typing import Literal

from backend.models.contracts import Scenario
from backend.optimizer.constraints import TOLERANCE, movable_equipment
from backend.simulator.interface import baseline_schedules


@dataclass(frozen=True)
class DeviceReference:
    device_type: Literal['ev', 'flexible']
    device_id: str


@dataclass(frozen=True)
class EvidenceContext:
    scheduling_mode: Literal['ev_only', 'joint']
    tolerance: float | None
    site_limit_kw: float | None = None
    max_power_kw: float | None = None
    immutable_fixed_power_kw: float | None = None
    held_flexible_power_kw: float | None = None
    immutable_fixed_energy_kwh: float | None = None
    held_flexible_energy_kwh: float | None = None


@dataclass(frozen=True)
class InfeasibilityEvidence:
    code: Literal['device_window_capacity', 'fixed_demand_above_site_limit',
                  'shared_window_capacity', 'solver_infeasible']
    message: str
    proof_source: Literal['analytical_necessary_condition', 'solver_infeasible']
    devices: tuple[DeviceReference, ...]
    window: dict[str, int] | None
    required: float | None
    available: float | None
    unit: Literal['kW', 'kWh'] | None
    context: EvidenceContext

    def to_dict(self):
        result = asdict(self)
        result['devices'] = list(result['devices'])
        return result


def _reference(key):
    kind, identifier = key.split(':', 1)
    return DeviceReference(kind, identifier)


def analytical_evidence(scenario: Scenario, fixed_demand, *, optimize_flexible=False,
                        physical_tolerance=1e-6):
    """Exact existing analytical comparisons, including original text/order.

    fixed_demand is the solver's immutable aggregate for its selected mode.
    Window energy is integrated over one-hour intervals, never instantaneous kW.
    """
    mode = 'joint' if optimize_flexible else 'ev_only'
    source = 'analytical_necessary_condition'
    records = []
    for key, label, start, end, energy, power in movable_equipment(scenario, optimize_flexible=True):
        capacity = (end-start)*power
        if energy > capacity + TOLERANCE:
            records.append(InfeasibilityEvidence(
                'device_window_capacity', f'{label}: required energy exceeds availability-window capacity',
                source, (_reference(key),), {'start_hour': start, 'end_hour': end},
                energy, capacity, 'kWh', EvidenceContext(mode, TOLERANCE, max_power_kw=power)))
    held = {} if optimize_flexible else {
        key: values for key, values in baseline_schedules(scenario).items() if key.startswith('flexible:')}
    held_demand = [sum(values[h] for values in held.values()) for h in range(24)]
    fixed_label = ('immutable background/HVAC demand' if optimize_flexible
                   else 'fixed demand including held flexible loads')
    limit = scenario.building_max_demand_kw
    for h, power in enumerate(fixed_demand):
        if power > limit + physical_tolerance:
            records.append(InfeasibilityEvidence(
                'fixed_demand_above_site_limit',
                f'Hour {h}: {fixed_label} ({power:g} kW) exceeds site cap ({limit:g} kW)',
                source, tuple(_reference(key) for key, values in held.items() if values[h] > 0),
                {'start_hour': h, 'end_hour': h+1}, power, limit, 'kW',
                EvidenceContext(mode, physical_tolerance, site_limit_kw=limit,
                                immutable_fixed_power_kw=scenario.fixed_demand_kw[h],
                                held_flexible_power_kw=held_demand[h])))
    items = movable_equipment(scenario, optimize_flexible=optimize_flexible)
    endpoints = sorted({0, 24} | {item[2] for item in items} | {item[3] for item in items})
    for start in endpoints:
        for end in endpoints:
            if end <= start:
                continue
            contained = [item for item in items if item[2] >= start and item[3] <= end]
            required = sum(item[4] for item in contained)
            capacity = sum(max(0.0, limit-fixed_demand[h]) for h in range(start, end))
            if required > capacity + physical_tolerance:
                label = 'EVs and flexible equipment' if optimize_flexible else 'EVs'
                capacity_label = 'shared capacity' if optimize_flexible else 'shared charging capacity'
                records.append(InfeasibilityEvidence(
                    'shared_window_capacity',
                    f'Window [{start}, {end}): {label} require {required:g} kWh '
                    f'but {capacity_label} is at most {capacity:g} kWh', source,
                    tuple(_reference(item[0]) for item in contained),
                    {'start_hour': start, 'end_hour': end}, required, capacity, 'kWh',
                    EvidenceContext(mode, physical_tolerance, site_limit_kw=limit,
                                    immutable_fixed_energy_kwh=sum(scenario.fixed_demand_kw[start:end]),
                                    held_flexible_energy_kwh=sum(held_demand[start:end]))))
    return records


def select_evidence(records):
    """Keep strongest bound for repeated device sets; retain distinct conflicts."""
    chosen = {}
    for item in records:
        if item.code == 'shared_window_capacity':
            key = item.devices
            rank = (item.available, item.window['end_hour']-item.window['start_hour'], item.window['start_hour'])
            if key not in chosen or rank < chosen[key][0]:
                chosen[key] = (rank, item)
    return [item for item in records if item.code != 'shared_window_capacity'
            or chosen[item.devices][1] is item]


def solver_infeasible_evidence(*, optimize_flexible=False):
    """Only call after an actual primary solver INFEASIBLE status."""
    return InfeasibilityEvidence(
        'solver_infeasible',
        'GLOP proved the submitted constraints infeasible; no specific analytical certificate is available.',
        'solver_infeasible', (), None, None, None, None,
        EvidenceContext('joint' if optimize_flexible else 'ev_only', None))
