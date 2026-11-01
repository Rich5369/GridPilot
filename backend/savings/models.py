"""Version 1 contracts. All evidence is caller supplied, never AI inferred."""
from datetime import date
from typing import Annotated, Literal
from pydantic import ConfigDict, Field, field_validator, model_validator
from backend.models.contracts import Contract, NonNegative
from backend.ai.advisor import BusinessProfile
from backend.eia.retail import STATES

Number = Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)]
Hours = Annotated[float, Field(ge=0, le=24, allow_inf_nan=False)]
Category = Literal['benchmark', 'tariff_comparison', 'led', 'lighting_controls', 'shutdown',
    'hvac_setpoints', 'hvac_schedule', 'hvac_maintenance', 'solar', 'envelope',
    'demand', 'refrigeration', 'compressed_air', 'motor', 'office', 'scheduling']

class Strict(Contract):
    model_config = ConfigDict(extra='forbid', strict=True)

class Location(Strict):
    state: str | None = None
    zip_code: str | None = Field(default=None, pattern=r'^\d{5}(-\d{4})?$')
    city: str | None = Field(default=None, min_length=1, max_length=120)
    utility: str | None = Field(default=None, min_length=1, max_length=200)
    rate_plan: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator('state')
    @classmethod
    def known_state(cls, value):
        if value is not None and value not in STATES:
            raise ValueError('Use a full U.S. state name or District of Columbia')
        return value

class Rate(Strict):
    usd_per_kwh: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    source: str = Field(min_length=1, max_length=500)
    valid_from: date
    valid_through: date
    customer_applicability_confirmed: bool
    flat_avoidable_energy_rate_confirmed: bool

    @field_validator('valid_from', 'valid_through', mode='before')
    @classmethod
    def iso_date(cls, value):
        return date.fromisoformat(value) if isinstance(value, str) else value

    @model_validator(mode='after')
    def ordered(self):
        if self.valid_through < self.valid_from:
            raise ValueError('Rate validity dates must be ordered')
        return self

class Measure(Strict):
    id: str = Field(min_length=1, max_length=100)
    category: Category
    load_id: str = Field(min_length=1, max_length=100)
    evidence_kind: Literal['user_entered', 'measured', 'synthetic', 'engineering_assumption']
    evidence_reference: str = Field(min_length=1, max_length=500)
    applicable: bool | None = None
    rate: Rate | None = None
    installation_cost_usd: Number | None = None
    annual_incremental_cost_usd: Number | None = None
    annual_operating_cost_savings_usd: Number | None = Field(default=None,
        description='Caller-supplied annual recurring non-energy expense reduction. Excludes electricity savings and one-time incentives. Null means not included, not zero actual savings.')
    operating_cost_savings_reference: str | None = Field(default=None, min_length=1, max_length=500,
        description='Source and basis for the recurring non-energy benefit; required for a positive amount. Caller evidence, not independent verification.')
    fixture_count: int | None = Field(default=None, ge=1, le=10000000)
    old_watts: Number | None = None
    new_watts: Number | None = None
    hours_per_day: Hours | None = None
    days_per_year: int | None = Field(default=None, ge=1, le=366)
    connected_load_kw: Number | None = None
    existing_hours_per_day: Hours | None = None
    avoidable_hours_per_day: Hours | None = None
    safe_to_switch_off: bool | None = None
    essential_service: bool | None = None
    device_count: int | None = Field(default=None, ge=1, le=10000000)
    active_watts: Number | None = None
    low_power_watts: Number | None = None
    before_annual_kwh: Number | None = None
    after_annual_kwh: Number | None = None
    equivalent_service_confirmed: bool | None = None

    operating_baseline_confirmed: bool | None = Field(default=None,
        description='Caller confirms average avoidable power and incremental avoidable hours account for existing controls, standby, cycling and actual equipment runtime; not business opening hours alone.')
    comparison_conditions_confirmed: bool | None = Field(default=None,
        description='Caller confirms before/after annual kWh use comparable periods, runtime, capacity, output, service and ambient conditions, with specification-based projections identified in evidence_reference. Not independent verification.')

    @field_validator('operating_cost_savings_reference')
    @classmethod
    def nonblank_operating_cost_reference(cls, value):
        if value is not None and not value.strip():
            raise ValueError('Operating-cost savings reference must not be blank')
        return value

    @model_validator(mode='after')
    def documented_operating_cost_savings(self):
        if self.annual_operating_cost_savings_usd is not None and self.annual_operating_cost_savings_usd > 0:
            if self.operating_cost_savings_reference is None:
                raise ValueError('Positive annual_operating_cost_savings_usd requires operating_cost_savings_reference documenting a recurring non-energy benefit')
        return self

    @model_validator(mode='after')
    def physical_bounds(self):
        for old, new in [('old_watts', 'new_watts'), ('active_watts', 'low_power_watts')]:
            if getattr(self, old) is not None and getattr(self, new) is not None:
                if getattr(self, old) <= 0 or getattr(self, new) > getattr(self, old):
                    raise ValueError(f'{old} must be positive and at least {new}')
        if (self.existing_hours_per_day is not None and self.avoidable_hours_per_day is not None
                and self.avoidable_hours_per_day > self.existing_hours_per_day):
            raise ValueError('Avoidable hours cannot exceed existing hours')
        if self.category == 'led' and self.new_watts is not None and self.new_watts <= 0:
            raise ValueError('Replacement lighting wattage must be positive')
        return self

class SavingsRequest(Strict):
    profile: BusinessProfile = Field(default_factory=BusinessProfile)
    location: Location = Field(default_factory=Location)
    measures: list[Measure] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def unique_ids(self):
        ids = [m.id for m in self.measures]
        if len(set(ids)) != len(ids):
            raise ValueError('Measure IDs must be unique')
        return self

class Recommendation(Contract):
    id: str
    category: Category
    title: str
    explanation: str
    applicability: Literal['confirmed', 'possible', 'not_applicable']
    calculation_status: Literal['quantified', 'scenario_estimate', 'needs_data', 'not_applicable']
    annual_kwh_saved: float | None = Field(default=None, allow_inf_nan=False)
    annual_energy_charge_savings_usd: float | None = Field(default=None, allow_inf_nan=False)
    annual_operating_cost_savings_usd: float | None = Field(default=None, allow_inf_nan=False,
        description='Supplied recurring non-energy benefit, rounded to cents after energy eligibility passes. Null means not included; does not establish net savings or independent verification.')
    annual_net_savings_usd: float | None = Field(default=None, allow_inf_nan=False,
        description='Gross annual energy-charge savings plus supplied recurring non-energy savings minus explicit annual incremental expenses. Null when required energy, rate or expense evidence is missing.')
    upfront_cost_usd: float | None = Field(default=None, allow_inf_nan=False)
    simple_payback_years: float | None = Field(default=None, allow_inf_nan=False)
    annual_simple_roi_percent: float | None = Field(default=None, allow_inf_nan=False,
        description='Annual net savings / positive upfront cost * 100. Null when required inputs are unknown, upfront cost is zero, or the calculated ROI cannot be represented as a finite API number; numerical-range nulls include a warning. No ROI cap is substituted.')
    confidence: str
    provenance: dict
    inputs_used: dict
    assumptions: list[str]
    calculation_method: str
    missing_information: list[str]
    sources: list[str]
    next_action: str
    warnings: list[str] = Field(default_factory=list,
        description='Nonblocking input-plausibility, evidence and numerical-representation limitations. No numerical corrections or independent verification implied.')
    priority_group: Literal['financial', 'energy_only', 'investigation', 'not_applicable'] = 'investigation'
    priority_reason: str = ''

class SavingsResponse(Contract):
    version: Literal['1'] = '1'
    benchmark: dict | None
    location_notice: str
    recommendations: list[Recommendation]
    portfolio_savings_usd: None = None
    warnings: list[str]
