import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import { DollarSign, Gauge, TrendingDown, ShieldCheck } from 'lucide-react'
import type { OptimizationResult, Scenario } from '../../types/api'
import { money } from '../../data/demoScenario'
const tooltip = {
  background: '#15212e',
  border: '1px solid #3a4c60',
  borderRadius: 8,
  color: '#edf3fc',
  fontSize: 12,
}
function Sparkline({ values, color }: { values: number[]; color: string }) {
  return (
    <div className="kpi-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          accessibilityLayer={false}
          data={values.map((value) => ({ value }))}
        >
          <Area
            dataKey="value"
            type="stepAfter"
            stroke={color}
            fill={color}
            fillOpacity={0.08}
            strokeWidth={1.6}
            isAnimationActive={false}
          />
        </AreaChart>
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
      color: '#20dbad',
      values: result?.optimized_demand_kw?.map(
        (v, i) => v * scenario!.electricity_prices_usd_per_kwh[i],
      ),
    },
    {
      label: 'Peak building demand',
      value: peak == null ? '—' : `${peak.toFixed(2)} kW`,
      context: result
        ? `Baseline ${result.baseline_peak_demand_kw.toFixed(2)} kW`
        : 'Whole-building scheduled demand',
      icon: Gauge,
      color: '#43a8ff',
      values: result?.optimized_demand_kw,
    },
    {
      label: 'Daily cost difference',
      value: difference == null ? '—' : money(difference),
      context: 'Baseline minus optimized · energy only',
      icon: TrendingDown,
      color: '#a58aff',
      values: result?.optimized_demand_kw?.map(
        (v, i) =>
          (result.baseline_demand_kw[i] - v) *
          scenario!.electricity_prices_usd_per_kwh[i],
      ),
    },
    {
      label: 'Remaining peak capacity',
      value: capacity == null ? '—' : `${capacity.toFixed(2)} kW`,
      context: scenario
        ? `Submitted site limit ${scenario.building_max_demand_kw} kW`
        : 'Site limit minus optimized peak',
      icon: ShieldCheck,
      color: '#e9b55f',
      values: result?.optimized_demand_kw?.map(
        (v) => scenario!.building_max_demand_kw - v,
      ),
    },
  ]
  return (
    <section
      className="command-metrics"
      aria-label="Submitted scenario metrics"
    >
      {cards.map(({ label, value, context, icon: Icon, color, values }) => (
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
            <Sparkline values={values} color={color} />
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
      ))}
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
  const rows = scenario.electricity_prices_usd_per_kwh.map((price, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    price,
  }))
  const costs = result
    ? [
        {
          name: 'Daily energy charges',
          baseline: result.baseline_electricity_cost_usd,
          optimized: result.optimized_electricity_cost_usd,
        },
      ]
    : []
  return (
    <div className="scenario-analytics">
      <section className="panel compact-chart">
        <p className="eyebrow">{draft ? 'DRAFT INPUTS' : 'SUBMITTED INPUTS'}</p>
        <h2>Electricity tariff</h2>
        <p className="panel-subtitle">
          24 hourly inputs · $/kWh · retail scenario tariff
        </p>
        <div className="analytics-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={rows}
              margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#253343" />
              <XAxis
                dataKey="hour"
                interval={5}
                tick={{ fill: '#9eafc4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={48}
                tick={{ fill: '#9eafc4', fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltip}
                formatter={(v) => [`$${Number(v).toFixed(4)}/kWh`, 'Tariff']}
              />
              <Area
                dataKey="price"
                type="stepAfter"
                stroke="#aa8aff"
                fill="#aa8aff"
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
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
                    <th>{r.hour}</th>
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
          USD · one day · excludes fixed and demand charges
        </p>
        {result ? (
          <>
            <div className="analytics-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={costs}
                  barGap={14}
                  margin={{ right: 12, top: 12, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#253343" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9eafc4', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={48}
                    tick={{ fill: '#9eafc4', fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltip}
                    formatter={(v) => money(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="baseline"
                    name="Baseline"
                    fill="#76869e"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="optimized"
                    name="Optimized"
                    fill="#20dbad"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="cost-note">
              Baseline {money(result.baseline_electricity_cost_usd)} · Optimized{' '}
              {result.optimized_electricity_cost_usd == null
                ? 'unavailable'
                : money(result.optimized_electricity_cost_usd)}
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
