"""Accounting of returned schedules, never a new solve or counterfactual cause."""
import re
from math import isclose

TOLERANCE_USD = 2e-7


def is_cost_explanation(request):
    text = request.lower()
    return (bool(re.search(r'\b(why|explain|how\s+did|what\s+(?:caused|made))\b', text))
            and bool(re.search(r'\b(optimization|optimized|result|results|retained|modeled|schedule)\b', text))
            and bool(re.search(r'\b(cost|costs|savings|charges|bill|cheaper|expense|expenses|money|result|results)\b', text)))


def describe_cost_change(scenario, mode, result):
    """Return safe aggregate prose and, only if reconciled, device cost evidence."""
    if result is None:
        return ('The exact optimization execution is unavailable here. Run optimization explicitly to create a new result before asking for its explanation.', None)
    if result.feasibility_status != 'feasible':
        return ('The retained result is infeasible, so no optimized energy-cost reduction is established. Review the returned constraint evidence before proposing changes.', None)
    delta = result.baseline_electricity_cost_usd - result.optimized_electricity_cost_usd
    direction = ('lower' if delta > TOLERANCE_USD else
                 'higher' if delta < -TOLERANCE_USD else 'effectively unchanged')
    answer = (f'The retained result shows {direction} modeled daily energy charges for the submitted scenario. '
              'The difference is calculated from submitted hourly prices and returned hourly demand; it does not establish lower business consumption or forecast a full utility bill.')
    plan = result.operating_plan
    if not plan or not plan.device_schedules or plan.scheduling_mode != mode or plan.verification_status != 'passed':
        return answer + ' Device-level contributions are not established by the retained evidence.', None
    prices = scenario.electricity_prices_usd_per_kwh
    rows = []
    for kind in ('baseline', 'optimized'):
        aggregate = getattr(result, f'{kind}_demand_kw')
        schedules = [getattr(d, f'{kind}_power_kw') for d in plan.device_schedules]
        if any(values is None for values in schedules):
            return answer + ' Device-level contributions are not established by the retained evidence.', None
        if any(not isclose(fixed + sum(values[h] for values in schedules), aggregate[h], abs_tol=1e-6, rel_tol=0)
               for h, fixed in enumerate(scenario.fixed_demand_kw)):
            return answer + ' Device-level contributions are not established by the retained evidence.', None
        cost = sum(p * demand for p, demand in zip(prices, aggregate))
        if not isclose(cost, getattr(result, f'{kind}_electricity_cost_usd'), abs_tol=TOLERANCE_USD, rel_tol=0):
            return answer + ' Device-level contributions are not established by the retained evidence.', None
    for device in plan.device_schedules:
        baseline = sum(p * v for p, v in zip(prices, device.baseline_power_kw))
        optimized = sum(p * v for p, v in zip(prices, device.optimized_power_kw))
        difference = baseline - optimized
        if abs(difference) <= TOLERANCE_USD:
            difference = 0.0
        rows.append(f'{device.device_type} {device.device_id}: baseline USD {baseline:.4f}; optimized USD {optimized:.4f}; difference USD {difference:.4f}')
    evidence = ('Verified same-execution device energy-charge accounting: ' + '; '.join(rows)
                + '. Differences describe the returned schedules, not a unique causal allocation or real-world savings guarantee.')
    # No device names in causal prose, even when accounting is available.
    return answer + ' Device energy-charge differences are reconciled separately in the scenario evidence.', evidence
