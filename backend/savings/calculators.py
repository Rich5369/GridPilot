"""Decimal arithmetic; round money only at the presentation boundary."""
from decimal import Decimal, ROUND_HALF_UP
from backend.savings.models import Measure


def d(value):
    return Decimal(str(value))


def money(value):
    return float(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def energy(m: Measure):
    if m.category == 'led':
        return d(m.fixture_count) * (d(m.old_watts) - d(m.new_watts)) / 1000 * d(m.hours_per_day) * d(m.days_per_year)
    if m.category in ('shutdown', 'lighting_controls'):
        return d(m.connected_load_kw) * d(m.avoidable_hours_per_day) * d(m.days_per_year)
    if m.category == 'office':
        return d(m.device_count) * (d(m.active_watts) - d(m.low_power_watts)) / 1000 * d(m.avoidable_hours_per_day) * d(m.days_per_year)
    if m.category in ('motor', 'refrigeration'):
        return d(m.before_annual_kwh) - d(m.after_annual_kwh)
    raise ValueError('Unsupported calculation category')


def financials(kwh, m):
    gross = kwh * d(m.rate.usd_per_kwh)
    net = None if m.annual_incremental_cost_usd is None else gross - d(m.annual_incremental_cost_usd)
    cost = None if m.installation_cost_usd is None else d(m.installation_cost_usd)
    return dict(annual_energy_charge_savings_usd=money(gross),
        annual_net_savings_usd=None if net is None else money(net),
        simple_payback_years=float(cost/net) if cost is not None and net is not None and net > 0 else None,
        annual_simple_roi_percent=float(net/cost*100) if cost is not None and cost > 0 and net is not None else None)
