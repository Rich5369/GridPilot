"""Shared engineering validation for legacy and conversational proposals."""
from pydantic import ValidationError
from backend.models.contracts import Scenario
from backend.ai.models import Proposal
from backend.ai.service import fail

def validate_proposal(submitted: Scenario, proposal: Proposal):
    changes = proposal.changes.model_dump(exclude_none=True)
    if (proposal.status == 'proposed') != bool(changes):
        raise fail(502, 'ai_invalid_response', 'Invalid proposal. No changes were applied.')
    scenario = None
    if changes:
        data = submitted.model_dump()
        if 'building_max_demand_kw' in changes:
            data['building_max_demand_kw'] = changes['building_max_demand_kw']
        if 'all_ev_deadline_hour' in changes:
            if not data['ev_requirements']:
                raise fail(422, 'ai_invalid_change', 'There are no EVs to update.')
            for ev in data['ev_requirements']:
                ev['deadline_hour'] = changes['all_ev_deadline_hour']
        if 'peak_price_increase_percent' in changes:
            prices = data['electricity_prices_usd_per_kwh']
            peak = max(prices)
            if peak <= 0 or len(set(prices)) != 2:
                raise fail(422, 'ai_invalid_change', 'Peak price changes require a positive peak and a two-rate tariff.')
            data['electricity_prices_usd_per_kwh'] = [p * (1 + changes['peak_price_increase_percent'] / 100) if p == peak else p for p in prices]
        try:
            scenario = Scenario.model_validate(data)
        except ValidationError:
            raise fail(422, 'ai_invalid_change', 'Proposed values violate the scenario contract. No changes were applied.') from None
    return scenario
