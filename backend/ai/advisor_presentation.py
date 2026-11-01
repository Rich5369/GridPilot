"""Readable advisor replies; engineering evidence stays in the advisor backend."""
import re

from backend.ai.service import fail
from backend.ai.cost_attribution import TOLERANCE_USD


def wants_details(request):
    return bool(re.search(
        r'\b(detail(?:s|ed)?|technical|in[- ]depth|step[- ]by[- ]step|'
        r'tell me more|explain more|go deeper|elaborate)\b', request, re.I))


def validate_reply(answer, next_step, questions, detailed):
    """Reject an invalid completion rather than cutting off advice or a warning."""
    prose = ' '.join([answer, next_step or '', *questions])
    if (len(prose.split()) > (300 if detailed else 80)
            or prose.count('?') > 1
            or any(mark in prose for mark in ('{', '}', '[', ']', '```'))):
        raise fail(502, 'ai_invalid_response',
                   'The advisor could not format a clear reply. Please try again. No changes were applied.')


def brief_cost_answer(result):
    if result is None:
        return 'Results for this setup are unavailable. Run optimization to see whether a different schedule could lower your costs.'
    if result.feasibility_status != 'feasible':
        return 'This plan cannot meet the submitted requirements, so no optimized energy-cost reduction is established. Review your building’s power limit and equipment needs before trying again.'
    difference = result.baseline_electricity_cost_usd - result.optimized_electricity_cost_usd
    direction = ('lower' if difference > TOLERANCE_USD else
                 'higher' if difference < -TOLERANCE_USD else 'effectively unchanged')
    return (f'The result shows {direction} modeled daily energy charges: about '
            f'${result.baseline_electricity_cost_usd:.2f} before and '
            f'${result.optimized_electricity_cost_usd:.2f} with this plan. '
            'The comparison uses your electricity prices and scheduled power use. '
            'It does not mean your equipment used less energy or predict your full electricity bill.')


def result_notices(result, keys):
    """Keep essential validity warnings visible after removing raw evidence cards."""
    if result is None:
        return (['Savings and equipment schedules have not been verified for this setup. Run optimization to check.']
                if set(keys) & {'cost', 'peak', 'devices', 'insights'} else [])
    notices = []
    if result.feasibility_status != 'feasible':
        notices.append('This plan cannot meet all submitted requirements. Savings are not confirmed.')
        descriptions = {
            'device_window_capacity': 'Equipment needs more time or power to finish its required work.',
            'fixed_demand_above_site_limit': 'Power use that cannot be moved exceeds your building’s power limit.',
            'shared_window_capacity': 'Equipment needs more energy than your building can supply during the allowed hours.',
        }
        for item in result.infeasibility_evidence or []:
            notices.append(descriptions.get(item.code,
                'The equipment requirements and available power conflict. Review your power limit and allowed operating times.'))
    if result.operating_plan:
        translations = {
            'Billing peak unknown: optimizing energy only; demand and total cost remain null.':
                'Your billing peak is unknown, so demand charges and the full bill cannot be calculated.',
            'Peak tie-break is feasible without a peak optimality proof.':
                'The plan can work, but the lowest possible peak power use has not been confirmed.',
            'Peak tie-break unresolved; returning the verified primary optimum.':
                'The energy-cost result is verified, but the lowest possible peak power use has not been confirmed.',
            'Primary solution is feasible without optimality proof; peak tie-break not run.':
                'The plan can work, but the lowest possible cost and peak power use have not been confirmed.',
        }
        notices.extend(translations.get(warning, warning) for warning in result.operating_plan.warnings)
    return list(dict.fromkeys(notices))
