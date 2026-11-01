"""Server-authored specifics that model prose may reference without inventing numbers."""
import re

from backend.ai.advisor_presentation import brief_cost_answer
from backend.ai.service import fail


def hour(value):
    return f'{value:02d}:00'


def first_window(hours):
    """A contiguous example, never a claim that disconnected hours are continuous."""
    start = end = hours[0]
    for value in hours[1:]:
        if value != end + 1:
            break
        end = value
    return f'{hour(start)}–{hour(end + 1)}'


def scenario_specifics(scenario, result):
    prices = scenario.electricity_prices_usd_per_kwh
    low, high = min(prices), max(prices)
    if low == high:
        price = (f'The submitted electricity price is ${low:g}/kWh throughout the day, '
                 'so changing timing alone cannot lower energy charges at this rate.')
    else:
        expensive = first_window([h for h, value in enumerate(prices) if value == high])
        price = (f'In the submitted scenario, {expensive} is a highest-priced window at ${high:g}/kWh; '
                 f'the lowest daily price is ${low:g}/kWh.')
    snippets = {'@price_context': price}
    if scenario.ev_requirements:
        ev = scenario.ev_requirements[0]
        allowed = list(range(ev.arrival_hour, ev.deadline_hour))
        cheapest = min(prices[h] for h in allowed)
        window = first_window([h for h in allowed if prices[h] == cheapest])
        snippets['@charging_context'] = (
            f'For the first configured vehicle, {window} is a cheapest-priced window within its '
            f'{hour(ev.arrival_hour)}–{hour(ev.deadline_hour)} charging availability; '
            'this is not a verified charging plan.')
    if result is not None:
        snippets['@result_context'] = brief_cost_answer(result)
    return snippets


def expand_specifics(text, snippets):
    """Only exact server-owned text can introduce quantities into model prose."""
    def replace(match):
        token = match.group()
        if token not in snippets:
            raise fail(502, 'ai_invalid_response', 'The advisor referenced unavailable scenario details. Please try again.')
        return snippets[token]
    return re.sub(r'@[A-Za-z_]+', replace, text)
