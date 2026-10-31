"""Independent checks from raw JSON, using no production evaluator or solver.

All intervals are one hour. The exhaustive oracle applies only to small,
quarter-kW/kWh synthetic cases. Exact rational arithmetic avoids sharing the
production floating-point cost/evaluation implementation.
"""
from fractions import Fraction
from itertools import product
from math import fsum, isclose, isfinite

POWER_ABS = 1e-6
ENERGY_ABS = 1e-6
MONEY_ABS = 2e-7
RELATIVE = 1e-12


def near(actual, expected, absolute):
    assert isfinite(actual) and isclose(actual, expected, abs_tol=absolute, rel_tol=RELATIVE), (actual, expected)


def devices(scenario):
    for d in scenario.get('ev_requirements', []):
        yield 'ev', d['id'], d['arrival_hour'], d['deadline_hour'], d['energy_required_kwh'], d['max_charging_power_kw']
    for d in scenario.get('flexible_equipment', []):
        w = d['available_hours']
        yield 'flexible', d['id'], w['start_hour'], w['end_hour'], d['energy_required_kwh'], d['max_power_kw']


def arrival_schedule(start, end, energy, power):
    # Closed-form independent of the iterative production baseline generator.
    return [min(power, max(0, energy - (h-start)*power)) if start <= h < end else 0.0 for h in range(24)]


def check_result(scenario, result, mode):
    """Recompute both schedule sets and certify raw-output feasibility evidence.

    Raises AssertionError on a failed check, returns recomputed metrics. This is
    an audit of supplied output, not a way to trust arbitrary external results.
    A solver-only certificate cannot be independently proved by arithmetic here.
    """
    plan = result['operating_plan']
    assert plan['scheduling_mode'] == mode
    expected = {(kind, name): (start, end, energy, power) for kind, name, start, end, energy, power in devices(scenario)}
    schedules = plan['device_schedules']
    assert [(d['device_type'], d['device_id']) for d in schedules] == list(expected)
    metrics = {}
    feasible = result['feasibility_status'] == 'feasible'
    assert bool(result['constraint_violations']) != feasible
    for kind in ('baseline', 'optimized'):
        if kind == 'optimized' and not feasible:
            for d in schedules:
                assert d['optimized_power_kw'] is d['optimized_delivered_energy_kwh'] is None
            assert all(result[f'optimized_{suffix}'] is None for suffix in ('demand_kw', 'electricity_cost_usd', 'peak_demand_kw'))
            continue
        vectors = [scenario['fixed_demand_kw']]
        device_costs = {}
        for d in schedules:
            start, end, energy, power = expected[(d['device_type'], d['device_id'])]
            assert (d['available_hours']['start_hour'], d['available_hours']['end_hour'], d['required_energy_kwh'], d['max_power_kw']) == (start, end, energy, power)
            role = 'held_at_baseline' if d['device_type'] == 'flexible' and mode == 'ev_only' else 'optimized'
            assert d['scheduling_role'] == role
            values = d[f'{kind}_power_kw']
            assert len(values) == 24 and all(isfinite(v) for v in values)
            for h, value in enumerate(values):
                assert -POWER_ABS <= value <= power + POWER_ABS
                if not start <= h < end:
                    near(value, 0, POWER_ABS)
            delivered = fsum(values)
            near(delivered, d[f'{kind}_delivered_energy_kwh'], ENERGY_ABS)
            if kind == 'baseline' or role == 'held_at_baseline':
                reference = arrival_schedule(start, end, energy, power)
                for actual, target in zip(values, reference):
                    near(actual, target, POWER_ABS)
                near(delivered, min(energy, (end-start)*power), ENERGY_ABS)
            if kind == 'optimized':
                near(delivered, energy, ENERGY_ABS)
            vectors.append(values)
            device_costs[f"{d['device_type']}:{d['device_id']}"] = fsum(v*p for v, p in zip(values, scenario['electricity_prices_usd_per_kwh']))
        aggregate = [fsum(v[h] for v in vectors) for h in range(24)]
        for calculated, reported in zip(aggregate, result[f'{kind}_demand_kw']):
            near(calculated, reported, POWER_ABS)
        hourly_cost = [kw*price for kw, price in zip(aggregate, scenario['electricity_prices_usd_per_kwh'])]
        cost = fsum(hourly_cost)
        peak = max(aggregate)
        near(cost, result[f'{kind}_electricity_cost_usd'], MONEY_ABS)
        near(peak, result[f'{kind}_peak_demand_kw'], POWER_ABS)
        fixed_cost = fsum(v*p for v, p in zip(vectors[0], scenario['electricity_prices_usd_per_kwh']))
        near(fixed_cost + fsum(device_costs.values()), cost, MONEY_ABS)
        if kind == 'optimized':
            assert peak <= scenario['building_max_demand_kw'] + POWER_ABS
            near(fsum(aggregate), fsum(scenario['fixed_demand_kw']) + fsum(item[4] for item in devices(scenario)), ENERGY_ABS)
        metrics[kind] = dict(energy_kwh=fsum(aggregate), cost_usd=cost, peak_kw=peak, hourly_cost_usd=hourly_cost, device_cost_usd=device_costs)
    if feasible:
        metrics['cost_difference_usd'] = metrics['baseline']['cost_usd'] - metrics['optimized']['cost_usd']
        # No universal savings percent for a zero/negative baseline cost.
        base = metrics['baseline']['cost_usd']
        metrics['cost_difference_percent'] = 100 * metrics['cost_difference_usd'] / base if base > 0 else None
        near(metrics['baseline']['energy_kwh'], metrics['optimized']['energy_kwh'], ENERGY_ABS)
    check_certificates(scenario, result, mode)
    return metrics


def check_certificates(scenario, result, mode):
    expected = {(k, i): (a, b, e, p) for k, i, a, b, e, p in devices(scenario)}
    held = [0.0]*24
    if mode == 'ev_only':
        for (kind, _), (a, b, e, p) in expected.items():
            if kind == 'flexible':
                held = [x+y for x, y in zip(held, arrival_schedule(a, b, e, p))]
    fixed = [x+y for x, y in zip(scenario['fixed_demand_kw'], held)]
    for item in result.get('infeasibility_evidence') or []:
        assert item['context']['scheduling_mode'] == mode
        if item['code'] == 'solver_infeasible':
            assert item['proof_source'] == 'solver_infeasible'
            assert not item['devices'] and all(item[k] is None for k in ('window', 'required', 'available', 'unit'))
            assert result['operating_plan']['primary_status'] == 'infeasible'
            continue
        a, b = item['window']['start_hour'], item['window']['end_hour']
        keys = [(d['device_type'], d['device_id']) for d in item['devices']]
        assert all(key in expected for key in keys)
        if item['code'] == 'device_window_capacity':
            start, end, required, power = expected[keys[0]]
            assert (a, b) == (start, end) and item['unit'] == 'kWh'
            available = (b-a)*power
        elif item['code'] == 'fixed_demand_above_site_limit':
            assert b == a+1 and item['unit'] == 'kW'
            required, available = fixed[a], scenario['building_max_demand_kw']
        else:
            contained = {key for key, (start, end, _, _) in expected.items() if start >= a and end <= b and (mode == 'joint' or key[0] == 'ev')}
            assert set(keys) == contained and item['unit'] == 'kWh'
            required = fsum(expected[key][2] for key in keys)
            available = fsum(max(0, scenario['building_max_demand_kw']-fixed[h]) for h in range(a, b))
        near(item['required'], required, ENERGY_ABS)
        near(item['available'], available, ENERGY_ABS)
        assert required > available + item['context']['tolerance']


def exhaustive_cost(scenario, mode):
    """Exact primary optimum or None, by exhaustive quarter-unit allocation.

    Requires fixed/cap/energy/power on a 0.25 grid and device windows <=3 h.
    The device-to-hour flow constraints form a capacitated bipartite network.
    Integer capacities/supplies imply an integral optimal vertex after scaling
    by four, so this grid contains a continuous-LP primary optimum. The peak
    tie-break can be off-grid and is deliberately NOT compared to this oracle.
    """
    def units(value):
        scaled = Fraction(str(value))*4
        assert scaled.denominator == 1
        return int(scaled)
    cap = units(scenario['building_max_demand_kw'])
    fixed = [units(v) for v in scenario['fixed_demand_kw']]
    options = []
    for kind, _, start, end, energy, power in devices(scenario):
        e, p = units(energy), units(power)
        assert end-start <= 3
        if e > (end-start)*p:
            return None
        if kind == 'flexible' and mode == 'ev_only':
            fixed = [x + units(y) for x, y in zip(fixed, arrival_schedule(start, end, energy, power))]
            continue
        rows = []
        for values in product(range(p+1), repeat=end-start):
            if sum(values) == e:
                rows.append((start, values))
        options.append(rows)
    if any(v > cap for v in fixed):
        return None
    prices = [Fraction(str(v)) for v in scenario['electricity_prices_usd_per_kwh']]
    best = None
    for combination in product(*options):
        total = list(fixed)
        for start, values in combination:
            for h, value in enumerate(values, start):
                total[h] += value
        if max(total) > cap:
            continue
        cost = sum(v*p/4 for v, p in zip(total, prices))
        if best is None or cost < best:
            best = cost
    return best


def small_case(seed):
    import random
    rng = random.Random(seed)
    origin = 21 if seed % 2 else 0
    evs, flexible = [], []
    for n in range(3):
        start = rng.randrange(origin, origin+3)
        end = rng.randrange(start+1, origin+4)
        item = dict(id=f'device-{n}', energy_required_kwh=rng.randrange(0, 7)/4)
        if n < 2:
            evs.append({**item, 'arrival_hour':start, 'deadline_hour':end, 'max_charging_power_kw':rng.randrange(1, 4)/4})
        else:
            flexible.append({**item, 'available_hours':dict(start_hour=start,end_hour=end), 'max_power_kw':rng.randrange(1,4)/4})
    prices = [rng.choice([-0.3, 0, 0.1, 0.9, 4.0]) for _ in range(24)]
    if seed % 7 == 0:
        prices = [0.2]*24
    case = dict(operating_hours=dict(start_hour=8,end_hour=18), fixed_demand_kw=[rng.randrange(0,3)/4 for _ in range(24)],
                building_max_demand_kw=rng.randrange(1,9)/4, electricity_prices_usd_per_kwh=prices,
                ev_requirements=evs, flexible_equipment=flexible)
    if seed >= 60:
        # Construct a joint-feasible witness with randomized individual allocations;
        # the oracle must still discover the cheaper optimum independently.
        total = list(case['fixed_demand_kw'])
        for kind, identifier, start, end, energy, power in list(devices(case)):
            energy = min(energy, (end-start)*power)
            item = next(d for d in (evs if kind == 'ev' else flexible) if d['id'] == identifier)
            item['energy_required_kwh'] = energy
            remaining = int(energy*4)
            slots = [h for h in range(start,end) for _ in range(int(power*4))]
            rng.shuffle(slots)
            for h in slots[:remaining]: total[h] += .25
        case['building_max_demand_kw'] = max(.25, max(total))
    return case
