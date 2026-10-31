"""Evidence-gated calculations and ordinal, explainable ranking."""
from datetime import date
from backend.savings.catalog import CATALOG, CALCULATED, METHODS
from backend.savings.models import Recommendation, SavingsResponse
from backend.savings.calculators import energy, financials


def recommend_measure(m, today):
    c = CATALOG[m.category]
    required = c['required_inputs'] if m.category in CALCULATED else []
    missing = [name for name in required if getattr(m, name) is None]
    assumptions = ['Standalone estimate against supplied baseline. Do not sum overlapping measures.',
        'Energy charges only; no demand, fixed-charge, tax, incentive or escalation savings assumed.',
        'Evidence and customer applicability are caller attestations; not independently audited.',
        'Annual projection holds the supplied operating schedule and current flat rate constant; future rates are unknown.',
        'Installation cost is caller-supplied net upfront cost; no incentives or tax benefits inferred.']
    status = 'needs_data'
    applicable = 'confirmed' if m.applicable is True else 'possible'
    result = {}
    if m.applicable is False:
        status, applicable = 'not_applicable', 'not_applicable'
    elif m.category in CALCULATED:
        for field in ('safe_to_switch_off', 'equivalent_service_confirmed'):
            if field in required and getattr(m, field) is not True:
                missing.append(f'{field} must be explicitly true')
        if 'essential_service' in required and m.essential_service is not False:
            missing.append('Confirm essential_service is false; never interrupt critical refrigeration, security, ventilation or safety equipment')
        if not missing:
            kwh = energy(m)
            result['annual_kwh_saved'] = float(kwh)
            applicable = 'confirmed'
            status = 'quantified' if m.evidence_kind == 'measured' else 'scenario_estimate'
            if m.rate is None:
                missing.append('rate: current customer-specific flat avoidable USD/kWh energy rate')
            elif not (m.rate.valid_from <= today <= m.rate.valid_through):
                missing.append('rate: record is expired or not yet effective')
            elif not (m.rate.customer_applicability_confirmed and m.rate.flat_avoidable_energy_rate_confirmed):
                missing.append('rate: confirm customer applicability and flat avoidable energy charges')
            else:
                result.update(financials(kwh, m))
            if m.annual_incremental_cost_usd is None:
                missing.append('annual_incremental_cost_usd: explicitly provide zero if none; needed for net savings and payback')
            if m.installation_cost_usd is None:
                missing.append('installation_cost_usd: needed for payback and ROI')
    else:
        missing = c['required_inputs'].copy()
    net = result.get('annual_net_savings_usd')
    group = ('not_applicable' if status == 'not_applicable' else
             'financial' if net is not None and net > 0 else
             'energy_only' if net is None and result.get('annual_kwh_saved', 0) > 0 else 'investigation')
    reason = {'financial':'Positive documented net benefit; measured evidence precedes scenarios, then annual net savings and payback.',
        'energy_only':'Positive energy reduction; complete financial evidence before investment ranking.',
        'investigation':'Missing evidence or nonpositive benefit; no positive savings presumed.',
        'not_applicable':'Caller explicitly excludes this opportunity.'}[group]
    return Recommendation(id=m.id, category=m.category, title=c['title'],
        explanation=c['eligibility'], applicability=applicable, calculation_status=status,
        upfront_cost_usd=m.installation_cost_usd,
        confidence='caller-reported measured evidence' if m.evidence_kind == 'measured' else 'unverified caller scenario',
        provenance={'kind':m.evidence_kind, 'reference':m.evidence_reference, 'load_id':m.load_id,
            'rate_source':m.rate.source if m.rate else None},
        inputs_used=m.model_dump(mode='json', exclude_none=True, include=set(required) |
            {'id','category','load_id','evidence_kind','evidence_reference','applicable','rate',
             'installation_cost_usd','annual_incremental_cost_usd'}), assumptions=assumptions,
        calculation_method=METHODS.get(m.category,'Investigation only; no numerical model in v1') +
            '; gross USD = kWh * customer USD/kWh; net = gross - annual incremental cost; payback = upfront/net when net > 0; annual simple ROI = net/upfront * 100 when upfront > 0',
        missing_information=list(dict.fromkeys(missing)), sources=c['sources'],
        next_action='Provide: ' + '; '.join(dict.fromkeys(missing)) if missing else 'Validate baseline, equivalent service and costs before implementation.',
        priority_group=group, priority_reason=reason, **result)


async def build_recommendations(request, retail_service, today=None):
    today = today or date.today()
    benchmark = None
    warnings = ['No portfolio total: standalone recommendations may overlap.',
                'No AI inference, PVWatts, URDB or climate API calls are made by this endpoint.']
    if request.location.state:
        try:
            prices = await retail_service.get()
            record = next((r for r in prices.states if r.state == request.location.state), None)
            benchmark = dict(state=request.location.state, sector='COM', currency='USD', unit='USD/kWh',
                average_retail_price=None if record is None or record.cents_per_kwh is None else record.cents_per_kwh/100,
                period=prices.period, source=prices.source, source_url=prices.source_url,
                retrieved_at=prices.source_checked_at.isoformat(), released_at=prices.released_at.isoformat(),
                freshness=prices.status, provenance='historical_public_data',
                notice='Historical regional average; never used as a customer tariff or savings rate.')
        except (OSError, ValueError, RuntimeError):
            warnings.append('EIA service and saved release unavailable; benchmark unknown. Calculators remain available.')
    results = [recommend_measure(m, today) for m in request.measures]
    present = {m.category for m in request.measures}
    from backend.savings.models import Measure
    for category in sorted(CATALOG.keys() - present):
        results.append(recommend_measure(Measure(id='catalog:'+category, category=category, load_id='unknown',
            evidence_kind='user_entered', evidence_reference='No category-specific evidence supplied'), today))
    for r in results:
        if r.category == 'benchmark':
            r.missing_information = [] if benchmark and benchmark['average_retail_price'] is not None else ['Provide a full U.S. state name; ZIP alone is not geocoded.']
            r.explanation = 'Compare actual bill context with the historical state benchmark; another state price is not an available tariff.'
            r.next_action = 'Review benchmark dates and actual energy charges; do not infer savings from the difference.'
    loads = {}
    for m in request.measures:
        loads.setdefault(m.load_id, []).append(m.id)
    for ids in loads.values():
        if len(ids) > 1:
            warnings.append('Potential overlapping baseline: ' + ', '.join(ids) + '. Do not sum; combined modeling is not supported in v1.')
    order = {'financial':0,'energy_only':1,'investigation':2,'not_applicable':3}
    results.sort(key=lambda r:(order[r.priority_group], 0 if r.provenance['kind']=='measured' else 1,
        -(r.annual_net_savings_usd or 0) if r.priority_group=='financial' else 0,
        r.simple_payback_years if r.simple_payback_years is not None else float('inf'), r.id))
    return SavingsResponse(benchmark=benchmark,
        location_notice='50 states and D.C. State names validated; ZIP is syntax-checked only. City, utility and rate plan are unverified caller metadata. No address, utility, tariff or climate is inferred.',
        recommendations=results, warnings=warnings)
