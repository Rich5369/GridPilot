"""Evidence requirements, not assumed savings percentages."""
from backend.savings.models import Category
from typing import get_args

EIA = 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a'
DOE = 'https://www.energy.gov/energysaver/led-lighting'
FEMP = 'https://www.energy.gov/femp/energy-efficient-products-and-energy-saving-technologies'
NOAA = 'https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals'
URDB = 'https://apps.openei.org/services/doc/rest/util_rates/'
PV = 'https://developer.nlr.gov/docs/solar/pvwatts/v8/'
# category, title, eligibility, required evidence, source, complexity
ROWS = [
('benchmark','Commercial electricity benchmark','Any U.S. commercial business','state',EIA,'low'),
('tariff_comparison','Compare eligible utility plans','Business with eligible alternative plans','verified current and alternative tariffs; effective dates; utility eligibility; interval kWh and demand; seasonal, fixed, minimum and ratchet rules',URDB,'high'),
('led','LED lighting replacement','Existing lighting with an equivalent replacement','fixture_count; old_watts; new_watts; hours_per_day; days_per_year; equivalent_service_confirmed',DOE,'medium'),
('lighting_controls','Lighting occupancy controls','Lighting operating in unoccupied spaces','connected_load_kw; existing_hours_per_day; avoidable_hours_per_day; days_per_year; safe_to_switch_off; essential_service',FEMP,'medium'),
('shutdown','After-hours equipment shutdown','Nonessential equipment running unnecessarily','connected_load_kw; existing_hours_per_day; avoidable_hours_per_day; days_per_year; safe_to_switch_off; essential_service',FEMP,'low'),
('hvac_setpoints','Review HVAC setpoints','Business with conditioned spaces','equipment and occupancy; comfort, humidity, ventilation, inventory and freeze constraints; measured before/after data or validated model',NOAA,'high'),
('hvac_schedule','Review HVAC operating schedules','HVAC runs outside occupancy or process needs','occupancy and HVAC schedule; ventilation and process constraints; measured baseline or validated model',NOAA,'medium'),
('hvac_maintenance','Investigate HVAC maintenance','Business with HVAC equipment','equipment inventory; maintenance history; professional inspection; measured performance',FEMP,'medium'),
('solar','Rooftop solar feasibility','Business with roof access or site control','validated site; roof assessment; capacity, tilt, azimuth, losses; generation model; interval consumption; tariff and export rules; capex and annual costs',PV,'high'),
('envelope','Insulation and air sealing assessment','Business with conditioned building envelope','audit; envelope condition; ventilation, humidity and moisture constraints; validated building model',FEMP,'high'),
('demand','Investigate demand-charge reduction','Customer billed for demand','applicable demand tariff; billing interval data; ratchets, minimums, periods and billing history',URDB,'high'),
('refrigeration','Compare refrigeration consumption','Business using commercial refrigeration','before_annual_kwh; after_annual_kwh; equivalent_service_confirmed',FEMP,'medium'),
('compressed_air','Investigate compressed-air leaks','Business using compressed air','measured leak flow and compressor performance; runtime; safe process constraints',FEMP,'medium'),
('motor','Compare motor/system consumption','Business using motors or driven systems','before_annual_kwh; after_annual_kwh; equivalent_service_confirmed',FEMP,'high'),
('office','Office equipment power management','Business with nonessential office devices','device_count; active_watts; low_power_watts; existing_hours_per_day; avoidable_hours_per_day; days_per_year; safe_to_switch_off; essential_service',FEMP,'low'),
('scheduling','EV and flexible-load scheduling','Business with interruptible flexible loads or EVs','validated Scenario; customer hourly tariff; equipment windows and safety constraints; POST /api/optimize',FEMP,'medium'),
]
CALCULATED = {'led','lighting_controls','shutdown','office','motor','refrigeration'}
METHODS = {
'led':'fixture_count * (old_watts - new_watts) / 1000 * hours_per_day * days_per_year',
'lighting_controls':'connected_load_kw * avoidable_hours_per_day * days_per_year',
'shutdown':'connected_load_kw * avoidable_hours_per_day * days_per_year',
'office':'device_count * (active_watts - low_power_watts) / 1000 * avoidable_hours_per_day * days_per_year',
'motor':'before_annual_kwh - after_annual_kwh',
'refrigeration':'before_annual_kwh - after_annual_kwh',
}
CATALOG = {row[0]: dict(category=row[0], title=row[1], eligibility=row[2],
    business_types=['commercial; equipment evidence determines applicability'],
    required_inputs=row[3].split('; '), optional_inputs=['rate','installation_cost_usd','annual_incremental_cost_usd'],
    calculation_method=METHODS.get(row[0], 'Investigation only in v1'), sources=[row[4]],
    data_quality_requirements='Document source, units, equivalent service and baseline period; no nameplate-only consumption claims.',
    implementation_complexity=row[5], numerical_savings_supported=row[0] in CALCULATED) for row in ROWS}
assert set(CATALOG) == set(get_args(Category))
