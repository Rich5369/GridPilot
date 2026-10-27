"""Detailed building simulation layered over the unchanged shared contract."""
from backend.simulator.building import BuildingConfig, SimulationResult
from backend.simulator.energy import total_energy_kwh
from backend.simulator.hvac import hvac_schedule
from backend.simulator.interface import baseline_schedules, simulate_baseline
from backend.simulator.tariff import hourly_energy_charges, incremental_demand_charge


def simulate_building(config: BuildingConfig | dict) -> SimulationResult:
    config = BuildingConfig.model_validate(config)
    baseline = simulate_baseline(config.scenario)
    schedules = baseline_schedules(config.scenario)
    del schedules["fixed"]
    schedules.update({f"background:{key}": list(value)
                      for key, value in config.background_loads_kw.items()})
    schedules["hvac"] = hvac_schedule(config)
    demand_charge = incremental_demand_charge(baseline.peak_demand_kw, config.tariff)
    warnings = ["Hourly average peak is not necessarily a utility billing demand.",
                "One day does not establish monthly or annual savings."]
    if demand_charge is None:
        warnings.append("Existing monthly peak unknown; demand charge and full operating cost unavailable.")
    if baseline.constraint_violations:
        warnings.append("Schedules and costs describe an infeasible baseline; requested energy may be unmet.")
    return SimulationResult(
        feasibility_status="infeasible" if baseline.constraint_violations else "feasible",
        demand_kw=baseline.demand_kw, equipment_schedules_kw=schedules,
        total_energy_kwh=total_energy_kwh(baseline.demand_kw),
        hourly_energy_charges_usd=hourly_energy_charges(
            baseline.demand_kw, config.scenario.electricity_prices_usd_per_kwh),
        energy_charges_usd=baseline.electricity_cost_usd,
        peak_demand_kw=baseline.peak_demand_kw,
        fixed_charge_usd=config.tariff.fixed_charge_usd,
        incremental_demand_charge_usd=demand_charge,
        baseline_operating_cost_usd=(None if demand_charge is None else
            baseline.electricity_cost_usd + config.tariff.fixed_charge_usd + demand_charge),
        constraint_violations=baseline.constraint_violations,
        assumptions=["24 one-hour intervals; deadline/end hours exclusive; no DST.",
                     "EV energy is grid-side; efficiency 100%; no discharge.",
                     "Charge on arrival; flexible equipment runs at earliest availability.",
                     "Fractional last-hour power; flexible loads continuously adjustable.",
                     "Fixed schedules authoritative outside business hours; HVAC has no thermal model.",
                     "Fixed fee allocated to modeled day; demand charge is incremental monthly peak exposure.",
                     "Demand estimate assumes all-hour hourly peak, no ratchets or taxes."],
        warnings=warnings,
    )
