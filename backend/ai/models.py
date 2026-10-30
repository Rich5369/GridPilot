"""Narrow, strict AI contracts; scenario remains the existing engineering contract."""
from typing import Literal
from pydantic import ConfigDict, Field
from backend.models.contracts import Contract, Scenario

class Changes(Contract):
    model_config = ConfigDict(extra='forbid', strict=True)
    building_max_demand_kw: float | None = Field(default=None, gt=0, le=100000, allow_inf_nan=False)
    all_ev_deadline_hour: int | None = Field(default=None, ge=1, le=24)
    peak_price_increase_percent: float | None = Field(default=None, ge=-100, le=1000, allow_inf_nan=False)

class Proposal(Contract):
    status: Literal['proposed', 'clarification', 'unsupported']
    message: str = Field(max_length=500)
    changes: Changes

class InterpretRequest(Contract):
    request: str = Field(min_length=1, max_length=2000)
    scenario: Scenario

class InterpretResponse(Proposal):
    source: Literal['meta', 'mock']
    proposed_scenario: Scenario | None

class ExplainRequest(Contract):
    scenario: Scenario
    result_id: str | None = Field(default=None, max_length=64)
    scheduling_mode: Literal['ev_only', 'joint'] = 'ev_only'

class ExplanationSelection(Contract):
    points: list[Literal['outcome', 'cost', 'peak', 'constraints', 'method']] = Field(min_length=1, max_length=5)

class ExplainResponse(Contract):
    source: Literal['meta', 'mock']
    explanation: list[str]
    limitations: str
