import { hourInterval } from '../data/chartPresentation'

type Entry = {
  dataKey?: string | number
  name?: string | number
  value?: unknown
  color?: string
  type?: string
}

/** Presentation only: callers retain interval semantics and numerical precision. */
export function AnalyticsTooltip({
  active,
  payload,
  label,
  unit = 'kW',
  precision = 2,
}: {
  active?: boolean
  payload?: readonly Entry[]
  label?: unknown
  unit?: string
  precision?: number
}) {
  if (!active || !payload?.length) return null
  const entries = payload.filter(
    (entry, index) =>
      entry.value != null &&
      entry.type !== 'none' &&
      payload.findIndex((p) => p.dataKey === entry.dataKey) === index,
  )
  return (
    <div className="analytics-tooltip">
      <p>
        {hourInterval(label)} <span>1-hour interval</span>
      </p>
      <small>Original hourly value · connections are visual interpolation</small>
      {entries.map((entry) => (
        <div key={entry.dataKey}>
          <span>
            <i style={{ background: entry.color }} />
            {entry.name}
          </span>
          <strong>
            {Number(entry.value).toFixed(precision)} <small>{unit}</small>
          </strong>
        </div>
      ))}
    </div>
  )
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[]
}) {
  return (
    <div className="analytics-legend" role="group" aria-label="Chart legend">
      {items.map((item) => (
        <span key={item.label}>
          <i
            style={{
              borderColor: item.color,
              borderTopStyle: item.dashed ? 'dashed' : 'solid',
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
