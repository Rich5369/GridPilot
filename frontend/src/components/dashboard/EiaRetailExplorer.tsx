import { useEffect, useState } from 'react'
import { ArrowUpRight, Info } from 'lucide-react'
import states from '../../data/usStates.json'
import { apiRequest } from '../../services/api'

import { isRetailPrices, type RetailPrices } from '../../services/retailPrices'

const month = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const date = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const color = (value?: number | null) => value == null ? '#213342' : value < 10 ? '#1c5c66' : value < 15 ? '#248889' : value < 20 ? '#43b9a7' : value < 25 ? '#aec99a' : '#e5bf7c'

export function EiaRetailExplorer() {
  const [data, setData] = useState<RetailPrices | null>(null)
  const [selected, setSelected] = useState('California')
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
      try {
        const response = await apiRequest<RetailPrices>('/api/retail-prices', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) })
        if (!isRetailPrices(response)) throw new Error('Invalid retail response')
        if (!controller.signal.aborted) { setData(response); setFailed(false) }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 6 * 60 * 60 * 1000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [retry])
  const byState = new Map(data?.states.map((row) => [row.state, row]))
  const price = byState.get(selected)
  const status = loading ? 'Loading published data…' : failed ? data ? 'Saved release · connection unavailable' : 'Data unavailable' : data?.status === 'saved' ? 'Saved release · refresh unavailable' : data?.status === 'delayed' ? 'Older release · check source' : 'Published monthly · not live'
  const current = price?.cents_per_kwh
  const previous = price?.previous_year_cents_per_kwh
  return (
    <section className="panel market-panel retail-panel" aria-labelledby="retail-heading">
      <div className="section-heading">
        <div><p className="eyebrow">COMMERCIAL ELECTRICITY BENCHMARKS</p>
          <h2 id="retail-heading">What businesses pay, by state</h2>
          <p className="panel-subtitle">Monthly commercial retail averages · {data ? month(data.period) : 'Reporting month unavailable'}. A benchmark for context, separate from your scenario tariff.</p>
        </div>
        <span className="tag">{status}</span>
      </div>
      <div className="retail-controls">
        <label htmlFor="retail-state">Explore a state or D.C.</label>
        <select id="retail-state" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {[...states].sort((a, b) => a.name.localeCompare(b.name)).map((state) => <option key={state.name}>{state.name}</option>)}
        </select>
        <span>{data ? `${data.states.filter((s) => s.cents_per_kwh !== null).length}/51 areas reported` : '50 states + District of Columbia'}</span>
      </div>
      <div className="market-layout">
        <div className="market-geography">
          <svg viewBox="0 0 975 610" role="group" aria-label="Monthly commercial retail electricity averages by state">
            {states.map((state) => {
              const value = byState.get(state.name)?.cents_per_kwh
              const label = `${state.name}: ${value == null ? 'unavailable' : `${value.toFixed(2)} cents per kWh`}`
              return <path key={state.name} d={state.path} fill={color(value)} stroke={selected === state.name ? '#ffffff' : '#132432'} strokeWidth={selected === state.name ? 3 : 1} className="retail-state" role="button" tabIndex={0} aria-label={`Select ${state.name}`} aria-pressed={selected === state.name} onClick={() => setSelected(state.name)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(state.name) } }}><title>{label}</title></path>
            })}
          </svg>
          <div className="retail-legend" aria-label="Map legend in cents per kilowatt-hour">
            {[['<10', 5], ['10–<15', 12], ['15–<20', 17], ['20–<25', 22], ['≥25', 27], ['Unavailable', null]].map(([label, value]) => <span key={String(label)}><i style={{ background: color(value as number | null) }} />{label}</span>)}
            <span>¢/kWh</span>
          </div>
          <p className="map-caption">State averages, not utility service boundaries. Alaska and Hawaii shown as insets. Select small areas using the state menu.</p>
        </div>
        <aside className="market-detail retail-detail" aria-live="polite">
          <span className="eyebrow">SELECTED AREA</span><h3>{selected}</h3>
          <p className="market-name">Commercial retail · monthly average</p>
          <div className="market-price">{current == null ? '—' : current.toFixed(2)} <span>¢/kWh</span></div>
          <p>{current == null ? 'No reported commercial price available for this area.' : `$${(current / 100).toFixed(4)} per kWh · state benchmark`}</p>
          {data && <><dl>
            <div><dt>Reporting month</dt><dd>{month(data.period)}</dd></div>
            <div><dt>EIA publication</dt><dd>{date(data.released_at)}</dd></div>
            <div><dt>Source last checked</dt><dd>{date(data.source_checked_at)} UTC</dd></div>
            <div><dt>Data basis</dt><dd>{data.preliminary ? 'Preliminary estimates; subject to revision' : 'Published estimates'}</dd></div>
          </dl>
          {current != null && previous != null && <div className="retail-comparison">
            <p>Same month, previous year</p><strong>{previous.toFixed(2)} ¢/kWh</strong><span>{month(data.previous_year_period)}</span>
            {previous > 0 && <p>{current >= previous ? '+' : ''}{((current / previous - 1) * 100).toFixed(1)}% year over year · price comparison</p>}
          </div>}
          <p className="retail-caveat">EIA calculates average revenue per kWh for delivered electricity. This is not a utility rate; your tariff and bill can differ.</p>
          </>}
        </aside>
      </div>
      {(failed || data?.notice) && <p className="retail-notice" role="status">{failed ? 'The price release could not be loaded or validated. Any retained values remain dated to their reporting month.' : data?.notice}</p>}
      {failed && <button type="button" className="secondary" onClick={() => { setLoading(true); setRetry(n => n + 1) }} disabled={loading}>Retry price release</button>}
      <p className="map-integrity"><Info size={14} />Monthly retail averages are not real-time or day-ahead wholesale prices. They do not update optimizer inputs or establish utility-bill savings.</p>
      <p className="retail-attribution">Source: {data?.source ?? 'U.S. Energy Information Administration · Electric Power Monthly, Table 5.6.A'}{data ? ` (${date(data.released_at)})` : ''}. <a href={data?.source_url ?? 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a'} target="_blank" rel="noreferrer">Data and notes <ArrowUpRight size={12} /></a> · <a href={data?.reuse_url ?? "https://www.eia.gov/about/copyrights_reuse.php"} target="_blank" rel="noreferrer">Reuse policy</a></p>
    </section>
  )
}
