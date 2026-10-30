import { chartAxis, chartCursor } from '../../data/chartPresentation'
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DollarSign, Gauge, TrendingDown, ShieldCheck } from 'lucide-react'
import type { OptimizationResult, Scenario } from '../../types/api'
import { money } from '../../data/demoScenario'
import { hourlyAnalytics } from '../../data/hourlyAnalytics'
import { intervalRows } from '../../data/demandChart'
import { AnalyticsTooltip, ChartLegend } from '../ChartPrimitives'
function Sparkline({
  values,
  comparison,
  color,
}: {
  values: number[]
  comparison?: number[] | null
  color: string
}) {
  return (
    <div className="kpi-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer={false}
          data={[...values, values[values.length - 1]].map((value, h) => ({
            value,
            baseline: comparison?.[Math.min(h, 23)],
          }))}
        >
          {comparison && (
            <Line
              dataKey="baseline"
              type="stepAfter"
              stroke="#8292aa"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="value"
            type="stepAfter"
            stroke={color}
            dot={false}
            activeDot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
export function CommandMetrics({
  result,
  scenario,
  stale,
}: {
  result: OptimizationResult | null
  scenario: Scenario | null
  stale: boolean
}) {
  const profiles = hourlyAnalytics(result, scenario)
  const cost = result?.optimized_electricity_cost_usd
  const peak = result?.optimized_peak_demand_kw
  const difference =
    result && cost != null ? result.baseline_electricity_cost_usd - cost : null
  const capacity =
    scenario && peak != null ? scenario.building_max_demand_kw - peak : null
  const cards = [
    {
      label: 'Modeled daily energy cost',
      value: cost == null ? '—' : money(cost),
      context: result
        ? `Baseline ${money(result.baseline_electricity_cost_usd)}`
        : 'Awaiting a submitted solver result',
      icon: DollarSign,
      color: '#52d9ba',
      values: profiles.optimized,
      comparison: profiles.baseline,
    },
    {
      label: 'Peak building demand',
      value: peak == null ? '—' : `${peak.toFixed(2)} kW`,
      context: result
        ? `Baseline ${result.baseline_peak_demand_kw.toFixed(2)} kW`
        : 'Whole-building scheduled demand',
      icon: Gauge,
      color: '#73a9e8',
      values: result?.optimized_demand_kw,
      comparison: result?.baseline_demand_kw,
    },
    {
      label: 'Daily cost difference',
      value: difference == null ? '—' : money(difference),
      context: 'Baseline minus optimized · energy only',
      icon: TrendingDown,
      color: '#a58aff',
      values: profiles.difference,
    },
    {
      label: 'Remaining peak capacity',
      value: capacity == null ? '—' : `${capacity.toFixed(2)} kW`,
      context: scenario
        ? `Submitted site limit ${scenario.building_max_demand_kw} kW`
        : 'Site limit minus optimized peak',
      icon: ShieldCheck,
      color: '#7ec7bd',
      values: profiles.headroom,
    },
  ]
  return (
    <section
      className="command-metrics"
      aria-label="Submitted scenario metrics"
    >
      {cards.map(
        ({ label, value, context, icon: Icon, color, values, comparison }) => (
          <article className="panel command-kpi" key={label}>
            <div className="kpi-label">
              <span style={{ color }}>
                <Icon size={18} />
              </span>
              <h2>{label}</h2>
            </div>
            <strong className="kpi-number">{value}</strong>
            <p>{context}</p>
            {values ? (
              <Sparkline
                values={values}
                comparison={comparison}
                color={color}
              />
            ) : (
              <div className="kpi-no-data">No calculated hourly profile</div>
            )}
            <div className="kpi-footer">
              <span>
                {stale
                  ? 'Previous submitted scenario'
                  : '24-hour modeled scenario'}
              </span>
              <span>00–24h</span>
            </div>
          </article>
        ),
      )}
    </section>
  )
}
export function ScenarioAnalytics({
  scenario,
  result,
  draft = false,
}: {
  scenario: Scenario
  result: OptimizationResult | null
  draft?: boolean
}) {
  const profiles = hourlyAnalytics(result, draft ? null : scenario)
  const costSeries = [
    ...(profiles.baseline
      ? [
          {
            key: 'baseline',
            label: 'Baseline hourly energy cost',
            values: profiles.baseline,
          },
        ]
      : []),
    ...(profiles.optimized
      ? [
          {
            key: 'optimized',
            label: 'Optimized hourly energy cost',
            values: profiles.optimized,
          },
        ]
      : []),
  ]
  const costRows = intervalRows(costSeries)
  const rows = scenario.electricity_prices_usd_per_kwh.map((price, hour) => ({
    hour,
    price,
  }))
  // Extend the last hourly tariff to its true 24:00 boundary.
  const plotRows = [...rows, { hour: 24, price: rows[23].price }]
  return (
    <div className="scenario-analytics">
      <section className="panel compact-chart">
        <p className="eyebrow">{draft ? 'DRAFT INPUTS' : 'SUBMITTED INPUTS'}</p>
        <h2>Electricity tariff</h2>
        <p className="panel-subtitle">
          24 hourly inputs · $/kWh · retail scenario tariff
        </p>
        <div
          className="tariff-range cost-totals" role="group"
          aria-label="Hourly tariff range"
        >
          <div>
            <span>Lowest hourly rate</span>
            <strong>
              {Math.min(...scenario.electricity_prices_usd_per_kwh).toFixed(4)}{' '}
              <small>$/kWh</small>
            </strong>
          </div>
          <div>
            <span>Highest hourly rate</span>
            <strong>
              {Math.max(...scenario.electricity_prices_usd_per_kwh).toFixed(4)}{' '}
              <small>$/kWh</small>
            </strong>
          </div>
        </div>
        <ChartLegend items={[{ label: 'Hourly tariff', color: '#aa8aff' }]} />
        <div className="analytics-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={plotRows}
              margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#ffffff0c" />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 24]}
                ticks={[0, 6, 12, 18, 24]}
                tickFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`}
                tick={chartAxis}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={48}
                tick={chartAxis}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<AnalyticsTooltip unit="$/kWh" precision={4} />}
                cursor={chartCursor}
              />
              <Line
                dataKey="price"
                name="Tariff"
                type="stepAfter"
                stroke="#aa8aff"
                dot={false}
                activeDot={{ r: 3, stroke: '#101823', strokeWidth: 2 }}
                strokeWidth={1.6}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <details className="hourly-table">
          <summary>View tariff inputs</summary>
          <div className="table-scroll">
            <table>
              <caption>
                {draft ? 'Draft' : 'Submitted'} tariff · one-hour intervals
              </caption>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>$/kWh</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hour}>
                    <th>{String(r.hour).padStart(2, '0')}:00</th>
                    <td>{r.price.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="panel compact-chart">
        <p className="eyebrow">MODELED DAILY OUTCOME</p>
        <h2>Baseline vs. optimized cost</h2>
        <p className="panel-subtitle">
          Hourly energy cost · USD per 1-hour interval · energy only
        </p>
        {result ? (
          <>
            <div className="cost-totals" role="group" aria-label="Daily energy cost totals">
              <div>
                <span>Baseline · daily total</span>
                <strong>{money(result.baseline_electricity_cost_usd)}</strong>
              </div>
              <div>
                <span>Optimized · daily total</span>
                <strong>
                  {result.optimized_electricity_cost_usd == null
                    ? 'Unavailable'
                    : money(result.optimized_electricity_cost_usd)}
                </strong>
              </div>
            </div>
            {costSeries.length > 0 ? (
              <>
                <ChartLegend
                  items={costSeries.map((s) => ({
                    label: s.label.replace(' hourly energy cost', ''),
                    color: s.key === 'baseline' ? '#8292aa' : '#52d9ba',
                    dashed: s.key === 'baseline',
                  }))}
                />
                <div
                  className="analytics-chart hourly-cost-chart"
                  role="group"
                  aria-label="Hourly baseline and optimized energy costs in USD per one-hour interval"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={costRows}
                      margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="#ffffff0c" />
                      <XAxis
                        dataKey="hour"
                        type="number"
                        domain={[0, 24]}
                        ticks={[0, 6, 12, 18, 24]}
                        tickFormatter={(h) =>
                          `${String(h).padStart(2, '0')}:00`
                        }
                        tick={chartAxis}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={48}
                        domain={[
                          (min: number) => Math.min(0, min),
                          'auto',
                        ]}
                        tick={chartAxis}
                        tickFormatter={(v) => money(Number(v))}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<AnalyticsTooltip unit="USD" precision={4} />}
                        cursor={chartCursor}
                      />
                      {costSeries.map((series) => (
                        <Line
                          key={series.key}
                          dataKey={series.key}
                          name={
                            series.key === 'baseline' ? 'Baseline' : 'Optimized'
                          }
                          type="stepAfter"
                          stroke={
                            series.key === 'baseline' ? '#8292aa' : '#52d9ba'
                          }
                          strokeDasharray={
                            series.key === 'baseline' ? '4 3' : undefined
                          }
                          strokeWidth={series.key === 'baseline' ? 1.5 : 1.8}
                          dot={false}
                          activeDot={{
                            r: 3,
                            stroke: '#101823',
                            strokeWidth: 2,
                          }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {!profiles.optimized && (
                  <p className="cost-note">
                    Optimized hourly costs unavailable.
                  </p>
                )}
                <details className="hourly-table cost-hourly-table">
                  <summary>View all 24 hourly energy costs</summary>
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Submitted hourly energy costs · USD per one-hour
                        interval · daily totals above
                      </caption>
                      <thead>
                        <tr>
                          <th>Hour</th>
                          {costSeries.map((s) => (
                            <th key={s.key}>{s.label} (USD)</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {costRows.slice(0, 24).map((row) => (
                          <tr key={row.hour}>
                            <th>
                              {String(row.hour).padStart(2, '0')}:00–
                              {String(row.hour + 1).padStart(2, '0')}:00
                            </th>
                            {costSeries.map((s) => (
                              <td key={s.key}>
                                {s.values[row.hour].toFixed(4)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p className="analytics-empty">
                Hourly cost comparison unavailable. Daily totals above are
                reported by the solver.
              </p>
            )}
            <p className="cost-note">
              Baseline minus optimized ·{' '}
              {result.optimized_electricity_cost_usd == null
                ? 'difference unavailable'
                : `${money(result.baseline_electricity_cost_usd - result.optimized_electricity_cost_usd)} daily difference`}
            </p>
          </>
        ) : (
          <div className="analytics-empty">
            Run optimization to compare verified solver costs.
            <span>No calculated savings yet.</span>
          </div>
        )}
      </section>
    </div>
  )
}
