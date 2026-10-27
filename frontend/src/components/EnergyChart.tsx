import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SimulationResult } from '../types/dashboard'

export function EnergyChart({ result }: { result: SimulationResult }) {
  return (
    <section className="panel chart-panel" aria-labelledby="energy-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">24-HOUR LOAD PROFILE</p>
          <h2 id="energy-title">Building electricity demand</h2>
          <p className="muted text-sm mt-1">
            Hourly average power · not cumulative energy
          </p>
        </div>
        <span className="tag">
          {result.source === 'demo' ? 'DEMO DATA' : 'SIMULATION'}
        </span>
      </div>
      <div
        className="chart"
        aria-label="24 hourly demand intervals in kilowatts. Exact values are available in the table below."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={result.hours}
            margin={{ top: 15, right: 15, bottom: 5, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#e5ebe8"
            />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={20}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              unit=" kW"
              width={60}
              domain={[0, 'auto']}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v, name) => [`${Number(v).toFixed(2)} kW`, name]}
              contentStyle={{ borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
            <Area
              type="stepAfter"
              dataKey="background"
              name="Background"
              stackId="load"
              stroke="#9aaea6"
              fill="#cbd8d2"
              isAnimationActive={false}
            />
            <Area
              type="stepAfter"
              dataKey="hvac"
              name="HVAC"
              stackId="load"
              stroke="#409b8c"
              fill="#83c3b5"
              isAnimationActive={false}
            />
            <Area
              type="stepAfter"
              dataKey="ev"
              name="EV charging"
              stackId="load"
              stroke="#6889bc"
              fill="#a4bce0"
              isAnimationActive={false}
            />
            <Area
              type="stepAfter"
              dataKey="flexible"
              name="Flexible equipment"
              stackId="load"
              stroke="#c1a45f"
              fill="#e2cf99"
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="total"
              name="Total demand"
              stroke="#173f34"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              y={result.scenario.building_max_demand_kw}
              stroke="#b46a41"
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={{
                value: `Limit ${result.scenario.building_max_demand_kw} kW`,
                position: 'insideTopRight',
                fill: '#99552f',
                fontSize: 11,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer">
        <span>24 × 1-hour intervals · 00:00–24:00</span>
        <span>Limit belongs to displayed scenario</span>
      </div>
      <details className="hourly-table">
        <summary>View all 24 hourly values</summary>
        <div className="table-scroll">
          <table>
            <caption>
              Demo demand and energy charges; each row represents one hour.
            </caption>
            <thead>
              <tr>
                {[
                  'Hour',
                  'Background kW',
                  'HVAC kW',
                  'EV kW',
                  'Flexible kW',
                  'Total kW',
                  'Energy kWh',
                  '$/kWh',
                  'Charge USD',
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.hours.map((h) => (
                <tr key={h.hour}>
                  {[
                    h.label,
                    h.background,
                    h.hvac,
                    h.ev.toFixed(1),
                    h.flexible,
                    h.total.toFixed(1),
                    h.energyKwh.toFixed(1),
                    h.price.toFixed(2),
                    h.energyCostUsd.toFixed(3),
                  ].map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
