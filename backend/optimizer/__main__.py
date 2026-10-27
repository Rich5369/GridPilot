"""Reproducible EV-only demonstrations: python -m backend.optimizer [--json]."""
import argparse
import json
from pathlib import Path

from backend.models.contracts import Scenario
from backend.optimizer.scheduler import ORToolsSchedulingEngine
from backend.simulator.building import BuildingConfig


def demonstration_configs() -> dict[str, BuildingConfig]:
    """Keep the existing office fixture untouched; other cases are synthetic."""
    office = BuildingConfig.model_validate_json(
        (Path(__file__).resolve().parents[2] / 'sample_data/commercial_office.json').read_text())
    simple = Scenario.model_validate(dict(
        operating_hours={'start_hour':8, 'end_hour':18}, fixed_demand_kw=[1]*24,
        electricity_prices_usd_per_kwh=[0.4, 0.1]+[0.3]*22, building_max_demand_kw=5,
        ev_requirements=[dict(id='a', arrival_hour=0, deadline_hour=2,
                              energy_required_kwh=2, max_charging_power_kw=2)]))
    def building(scenario, name):
        return BuildingConfig(name=name, scenario=scenario,
                              background_loads_kw={'base':scenario.fixed_demand_kw},
                              hvac_demand_kw=[0]*24, hvac_max_power_kw=0)
    tight = simple.model_dump()
    tight.update(building_max_demand_kw=3, electricity_prices_usd_per_kwh=[0.2]*24)
    tight['ev_requirements'].append({**tight['ev_requirements'][0], 'id':'b'})
    impossible = json.loads(json.dumps(tight))
    impossible['ev_requirements'][0]['energy_required_kwh'] = 5
    return {'commercial_office':office, 'price_shift':building(simple, 'Price shift'),
            'tight_cap':building(Scenario.model_validate(tight), 'Tight cap'),
            'infeasible':building(Scenario.model_validate(impossible), 'Impossible deadline')}


def _show_metrics(label, result):
    total = result.baseline_operating_cost_usd
    demand = result.incremental_demand_charge_usd
    print(f'  {label}: energy={result.total_energy_kwh:.6f} kWh, '
          f'energy_charge=${result.energy_charges_usd:.9f}, peak={result.peak_demand_kw:.9f} kW, '
          f'constraints={result.feasibility_status}')
    print(f'    Conditional demand increment={demand!r} USD; '
          f'allocated fixed={result.fixed_charge_usd:g} USD; modeled cost={total!r} USD')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='Emit full results and per-EV schedules')
    args = parser.parse_args()
    results = {}
    for name, config in demonstration_configs().items():
        result = ORToolsSchedulingEngine().optimize(config)
        results[name] = result.model_dump(mode='json')
        if args.json:
            continue
        print(f'{name}: {result.status}, objective={result.solver_metadata.objective}')
        _show_metrics('Baseline', result.baseline)
        if result.optimized is not None:
            _show_metrics('Optimized', result.optimized)
            print(f'    Energy-charge reduction={result.comparison.energy_charge_reduction_usd!r} USD; '
                  f'conditional demand reduction={result.comparison.conditional_demand_charge_reduction_usd!r} USD')
        for ev in config.scenario.ev_requirements:
            key = f'ev:{ev.id}'
            base_delivered = sum(result.baseline.equipment_schedules_kw[key])
            optimized = result.optimized
            delivered = None if optimized is None else sum(optimized.equipment_schedules_kw[key])
            last_interval = None if optimized is None else max(
                (h+1 for h, p in enumerate(optimized.equipment_schedules_kw[key]) if p > 0), default=None)
            print(f'    {ev.id}: required={ev.energy_required_kwh:g} kWh, '
                  f'baseline={base_delivered:g}, optimized={delivered!r}; '
                  f'last charging interval ends={last_interval}, deadline={ev.deadline_hour}')
        for message in result.infeasibility_reasons + result.failure_reasons + result.solver_metadata.warnings:
            print(f'    {message}')
    if args.json:
        print(json.dumps(results, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
