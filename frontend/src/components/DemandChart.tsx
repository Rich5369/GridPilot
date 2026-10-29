import { useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { intervalRows, type DemandSeries } from '../data/demandChart'
const colors = [
  '#167264',
  '#567db0',
  '#a66f23',
  '#8468a7',
  '#b75f69',
  '#54838b',
  '#69785a',
  '#676c78',
]
export function DemandChart({
  total,
  baseline,
  sources = [],
  limit,
  title = 'Building electricity demand',
}: {
  total: DemandSeries
  baseline?: DemandSeries
  sources?: DemandSeries[]
  limit?: number
  title?: string
}) {
  const [view, setView] = useState('total')
  const [hidden, setHidden] = useState<string[]>([])
  const breakdown = view === 'sources' && sources.length > 0
  const series = breakdown
    ? sources.filter((s) => !hidden.includes(s.key))
    : baseline
      ? [baseline, total]
      : [total]
  const rows = intervalRows(series)
  return (
    <>
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
          Total demand
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
          ? 'Modeled or entered sources only. Hidden sources change the visible subtotal, not the building demand or limit.'
          : 'Hourly average electricity demand (kW). Each step covers one full hour.'}
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
      <div
        className="chart"
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
              stroke="#e5ebe8"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 24]}
              ticks={[0, 4, 8, 12, 16, 20, 24]}
              tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={12}
            />
            <YAxis
              unit=" kW"
              width={64}
              domain={[0, 'auto']}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              filterNull
              labelFormatter={(h) =>
                Number(h) === 24
                  ? '23:00–24:00 · end of day'
                  : `${String(h).padStart(2, '0')}:00–${String(Number(h) + 1).padStart(2, '0')}:00`
              }
              formatter={(v, name) => [`${Number(v).toFixed(2)} kW`, name]}
              contentStyle={{
                borderRadius: 10,
                maxWidth: 'min(320px, 80vw)',
                fontSize: 12,
                whiteSpace: 'normal',
              }}
            />
            {!breakdown && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {breakdown ? (
              series.map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="stepAfter"
                  stackId="sources"
                  stroke={colors[sources.indexOf(s) % colors.length]}
                  fill={colors[sources.indexOf(s) % colors.length]}
                  fillOpacity={0.4}
                  isAnimationActive={false}
                />
              ))
            ) : (
              <>
                <Area
                  dataKey={total.key}
                  type="stepAfter"
                  fill="#167264"
                  fillOpacity={0.08}
                  stroke="none"
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                />
                {baseline && (
                  <Line
                    dataKey={baseline.key}
                    name={baseline.label}
                    type="stepAfter"
                    stroke="#697789"
                    strokeDasharray="4 3"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  dataKey={total.key}
                  name={total.label}
                  type="stepAfter"
                  stroke="#167264"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            )}
            {limit !== undefined && (
              <ReferenceLine
                y={limit}
                ifOverflow="extendDomain"
                stroke="#a05a36"
                strokeDasharray="6 4"
                label={{
                  value: `Building limit ${limit} kW`,
                  position: 'insideTopRight',
                  fill: '#925031',
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="hourly-table">
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
                {series.map((s) => (
                  <th key={s.key}>{s.label} (kW)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 24).map((row) => (
                <tr key={row.hour}>
                  <th>
                    {String(row.hour).padStart(2, '0')}:00–
                    {String(row.hour + 1).padStart(2, '0')}:00
                  </th>
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
