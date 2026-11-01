"""Advisory checks only. Never normalize inputs, gate arithmetic or change ranking."""
from backend.savings.models import Measure

# Deliberately round unit-review triggers, NOT equipment ratings or industry maxima.
# 1,000 W = 1 kW per fixture/device; 1,000 kW = 1 MW aggregate.
# These unit boundaries make W/kW and individual/aggregate mistakes worth reviewing,
# while accepting legitimate industrial loads unchanged. Counts have no trigger.
PER_UNIT_WATTS_REVIEW = 1000
AGGREGATE_KW_REVIEW = 1000


def input_warnings(m: Measure) -> list[str]:
    if m.applicable is False:
        return []
    warnings = []
    fields = {'led': ('old_watts', 'new_watts'),
              'office': ('active_watts', 'low_power_watts'),
              'shutdown': ('connected_load_kw',),
              'lighting_controls': ('connected_load_kw',)}.get(m.category, ())
    for field in fields:
        value = getattr(m, field)
        threshold = AGGREGATE_KW_REVIEW if field == 'connected_load_kw' else PER_UNIT_WATTS_REVIEW
        if value is not None and value >= threshold:
            scope = ('aggregate avoidable load in kilowatts, not watts or unrelated facility load'
                     if field == 'connected_load_kw' else
                     'watts per fixture/device, not kilowatts or the total inventory load')
            warnings.append(f'Plausibility: {field} reaches a unit-review trigger ({threshold}). '
                            f'Confirm {scope}. Large equipment can be valid; no value has been changed.')
    if (m.category in ('office', 'shutdown', 'lighting_controls')
            and m.avoidable_hours_per_day is not None and m.avoidable_hours_per_day > 0
            and m.operating_baseline_confirmed is not True):
        warnings.append('Evidence limitation: operating_baseline_confirmed is not true. Confirm actual equipment runtime '
                        'and incremental avoidable hours, not business opening hours alone; use average avoidable power '
                        'accounting for existing occupancy controls, sleep/standby, shutdown schedules, cycling and partial load.')
    if (m.category in ('motor', 'refrigeration')
            and m.before_annual_kwh is not None and m.after_annual_kwh is not None
            and m.comparison_conditions_confirmed is not True):
        conditions = ('temperature requirements and ambient conditions' if m.category == 'refrigeration'
                      else 'production output and operating load')
        warnings.append('Evidence limitation: comparison_conditions_confirmed is not true. Confirm comparable annual '
                        f'periods, runtime, capacity, service requirements and {conditions}. Identify manufacturer '
                        'specification projections versus site measurements in evidence_reference; no normalization is applied.')
    return warnings
