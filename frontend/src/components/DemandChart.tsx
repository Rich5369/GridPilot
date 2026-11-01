import { formatHour, formatWindow } from '../data/time'
import { chartAxis, chartCursor } from '../data/chartPresentation'
import { useState } from 'react'
import { AnalyticsTooltip, ChartLegend } from './ChartPrimitives'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { intervalRows, type DemandSeries } from '../data/demandChart'
const colors = [
  'var(--chart-primary)',
  'var(--chart-secondary)',
  'var(--chart-limit)',
  'var(--chart-secondary)',
  'var(--chart-rose)',
  'var(--chart-cyan)',
  'var(--chart-olive)',
  'var(--chart-gray)',
]
export function DemandChart({
  total,
  baseline,
  fixed,
  sources = [],
  limit,
  title = 'Building electricity demand',
}: {
  total: DemandSeries
  fixed?: DemandSeries
  baseline?: DemandSeries
  sources?: DemandSeries[]
  limit?: number
  title?: string
}) {
  const [presentation, setPresentation] = useState('chart')
  const [view, setView] = useState('total')
  const [hidden, setHidden] = useState<string[]>([])
  const breakdown = view === 'sources' && sources.length > 0
  const series = breakdown
    ? sources.filter((s) => !hidden.includes(s.key))
    : baseline
      ? [baseline, total, ...(fixed ? [fixed] : [])]
      : [total, ...(fixed ? [fixed] : [])]
  const rows = intervalRows(series).slice(0, 24)
  return (
    <>
      <div className="plan-tabs" role="group" aria-label="Chart or table">
        <button className="secondary" aria-pressed={presentation === 'chart'} onClick={() => setPresentation('chart')}>Chart</button>
        <button className="secondary" aria-pressed={presentation === 'table'} onClick={() => setPresentation('table')}>Table</button>
      </div>
      <div
        className="demand-chart-controls"
        role="group"
        aria-label="Demand chart view"
      >
        <button
          className="secondary"
          aria-pressed={!breakdown}
          onClick={() => setView('total')}
        >
          {baseline ? 'Total demand' : total.label}
        </button>
        {sources.length > 0 && (
          <button
            className="secondary"
            aria-pressed={breakdown}
            onClick={() => setView('sources')}
          >
            Breakdown by source
          </button>
        )}
      </div>
      <p className="muted">
        {breakdown
          ? 'Modeled or entered sources only, shown as separate hourly lines. Straight connections are visual interpolation, not subhourly readings. Hiding a source does not change building demand or the limit.'
          : 'Hourly average electricity demand (kW). 24 hourly averages; straight connections are visual interpolation, not subhourly readings.'}
      </p>
      {breakdown && (
        <div
          className="source-toggles"
          role="group"
          aria-label="Visible demand sources"
        >
          {sources.map((s, i) => (
            <label
              key={s.key}
              style={{ borderLeft: `4px solid ${colors[i % colors.length]}` }}
            >
              <input
                type="checkbox"
                checked={!hidden.includes(s.key)}
                onChange={() =>
                  setHidden((h) =>
                    h.includes(s.key)
                      ? h.filter((k) => k !== s.key)
                      : [...h, s.key],
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      )}
      {!breakdown &&
        baseline &&
        baseline.values.every(
          (v, h) => Math.abs(v - total.values[h]) < 1e-6,
        ) && (
          <p className="field-hint">
            Baseline and optimized demand overlap at this display precision.
            Both series use the returned hourly values.
          </p>
        )}
      {!breakdown && (
        <ChartLegend
          items={[
            ...(baseline
              ? [{ label: baseline.label, color: 'var(--chart-baseline)', dashed: true }]
              : []),
            { label: total.label, color: 'var(--chart-primary)' },
            ...(fixed ? [{ label: fixed.label, color: 'var(--chart-secondary)' }] : []),
          ]}
        />
      )}
      <div
        hidden={presentation !== 'chart'}
        className="chart"
        role="group"
        aria-label={`${title}. Demand in kilowatts; use arrow keys in the chart or read the hourly table below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            accessibilityLayer
            data={rows}
            margin={{ top: 25, right: 12, bottom: 5, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--gp-line)"
              strokeDasharray="2 6"
            />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={[0, 4, 8, 12, 16, 20, 23]}
              tickFormatter={(h) => formatHour(h)}
              tick={chartAxis}
              tickLine={false}
              axisLine={false}
              minTickGap={12}
            />
            <YAxis
              unit=" kW"
              width={64}
              domain={[0, 'auto']}
              tick={chartAxis}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<AnalyticsTooltip />} cursor={chartCursor} />
            {breakdown ? (
              series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={colors[sources.indexOf(s) % colors.length]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, stroke: 'var(--gp-surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))
            ) : (
              <>
                {fixed && (
                  <Line
                    dataKey={fixed.key}
                    name={fixed.label}
                    type="linear"
                    stroke="var(--chart-secondary)"
                    dot={false}
                    activeDot={{ r: 3, stroke: 'var(--gp-surface)', strokeWidth: 2 }}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                )}
                {baseline && (
                  <Line
                    dataKey={baseline.key}
                    name={baseline.label}
                    type="linear"
                    stroke="var(--chart-baseline)"
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 3, stroke: 'var(--gp-surface)', strokeWidth: 2 }}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  dataKey={total.key}
                  name={total.label}
                  type="linear"
                  stroke="var(--chart-primary)"
                  strokeWidth={1.8}
                  dot={false}
                  activeDot={{ r: 3, stroke: 'var(--gp-surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </>
            )}
            {limit !== undefined && (
              <ReferenceLine
                y={limit}
                ifOverflow="extendDomain"
                stroke="var(--chart-limit)"
                strokeDasharray="6 4"
                label={{
                  value: `Building limit ${limit} kW`,
                  position: 'insideTopRight',
                  fill: 'var(--chart-limit)',
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="hourly-table" open={presentation === 'table'}>
        <summary>View all 24 hourly values</summary>
        <div className="table-scroll">
          <table>
            <caption>
              {title} · hourly average demand (kW). Each interval lasts one
              hour; kW × 1 h gives kWh.
            </caption>
            <thead>
              <tr>
                <th>Hour</th>
                {limit !== undefined && <th>Site limit (kW)</th>}
                {series.map((s) => (
                  <th key={s.key}>{s.label} (kW)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 24).map((row) => (
                <tr key={row.hour}>
                  <th>{formatWindow(row.hour, row.hour + 1)}</th>
                  {limit !== undefined && <td>{limit.toFixed(2)}</td>}
                  {series.map((s) => (
                    <td key={s.key}>{s.values[row.hour].toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}
