"""Detailed building simulation layered over the unchanged shared contract."""
from backend.simulator.building import BuildingConfig, SimulationResult
from backend.simulator.energy import total_energy_kwh, hourly_demand, sum_loads
from backend.simulator.hvac import hvac_schedule
from backend.simulator.interface import baseline_schedules, evaluate_scenario_schedules
from backend.simulator.tariff import hourly_energy_charges, incremental_demand_charge


def building_baseline_schedules(config: BuildingConfig) -> dict[str, list[float]]:
    """Expand shared fixed demand into its named background/HVAC components."""
    schedules = baseline_schedules(config.scenario)
    del schedules["fixed"]
    schedules.update({f"background:{key}": list(value)
                      for key, value in config.background_loads_kw.items()})
    schedules["hvac"] = hvac_schedule(config)
    return schedules


def simulate_building(config: BuildingConfig | dict) -> SimulationResult:
    config = BuildingConfig.model_validate(config)
    return evaluate_building_schedules(config, building_baseline_schedules(config), baseline=True)


def evaluate_building_schedules(config: BuildingConfig | dict,
                                schedules: dict[str, list[float]], *,
                                baseline: bool = False) -> SimulationResult:
    """Recompute metrics from supplied schedules; report every physical violation.

    Fixed background, HVAC and flexible loads must equal baseline schedules.
    The baseline flag describes scheduling provenance, never disables validation.
    """
    config = BuildingConfig.model_validate(config)
    expected = building_baseline_schedules(config)
    if set(schedules) != set(expected):
        raise ValueError("Equipment schedule keys do not match configured building")
    schedules = {key: hourly_demand(value).tolist() for key, value in schedules.items()}
    fixed_violations = [f"Fixed schedule {key} changed" for key, value in expected.items()
                        if not key.startswith("ev:") and schedules[key] != value]
    # Evaluate the supplied fixed components too, so altered fixed loads can never
    # disappear from reported totals even though they fail the preservation check.
    shared = {key: value for key, value in schedules.items()
              if key.startswith(("ev:", "flexible:"))}
    shared["fixed"] = sum_loads(value for key, value in schedules.items()
                               if key == "hvac" or key.startswith("background:"))
    evaluated = evaluate_scenario_schedules(config.scenario, shared)
    violations = fixed_violations + evaluated.constraint_violations
    demand_charge = incremental_demand_charge(evaluated.peak_demand_kw, config.tariff)
    warnings = ["Hourly average peak is not necessarily a utility billing demand.",
                "One day does not establish monthly or annual savings."]
    if demand_charge is None:
        warnings.append("Existing monthly peak unknown; demand charge and full operating cost unavailable.")
    if violations:
        warnings.append("Schedules and costs describe an infeasible schedule; requested energy may be unmet.")
    return SimulationResult(
        feasibility_status="infeasible" if violations else "feasible",
        demand_kw=evaluated.demand_kw, equipment_schedules_kw=schedules,
        total_energy_kwh=total_energy_kwh(evaluated.demand_kw),
        hourly_energy_charges_usd=hourly_energy_charges(
            evaluated.demand_kw, config.scenario.electricity_prices_usd_per_kwh),
        energy_charges_usd=evaluated.electricity_cost_usd,
        peak_demand_kw=evaluated.peak_demand_kw,
        fixed_charge_usd=config.tariff.fixed_charge_usd,
        incremental_demand_charge_usd=demand_charge,
        baseline_operating_cost_usd=(None if demand_charge is None else
            evaluated.electricity_cost_usd + config.tariff.fixed_charge_usd + demand_charge),
        constraint_violations=violations,
        assumptions=["24 one-hour intervals; deadline/end hours exclusive; no DST.",
                     "EV energy is grid-side; efficiency 100%; no discharge.",
                     ("Charge on arrival; flexible equipment runs at earliest availability." if baseline
                      else "Supplied EV schedules evaluated; flexible equipment held at baseline."),
                     "Fractional last-hour power; flexible loads continuously adjustable.",
                     "Fixed schedules authoritative outside business hours; HVAC has no thermal model.",
                     "Fixed fee allocated to modeled day; demand charge is incremental monthly peak exposure.",
                     "Demand estimate assumes all-hour hourly peak, no ratchets or taxes."],
        warnings=warnings,
    )
