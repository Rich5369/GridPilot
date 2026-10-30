import { useState } from 'react'
import { Globe2, ArrowUpRight, Info } from 'lucide-react'
import states from '../../data/usStates.json'

const markets = [
  {
    id: 'CAISO',
    x: 92,
    y: 287,
    name: 'California ISO',
    source: 'https://oasis.caiso.com/',
    description:
      'California and participating western areas. OASIS publishes nodal day-ahead and real-time prices.',
  },
  {
    id: 'ERCOT',
    x: 440,
    y: 465,
    name: 'Electric Reliability Council of Texas',
    source: 'https://www.ercot.com/mp/data-products',
    description:
      'Most of Texas. Settlement points and trading hubs have distinct prices.',
  },
  {
    id: 'SPP',
    x: 425,
    y: 300,
    name: 'Southwest Power Pool',
    source: 'https://marketplace.spp.org/',
    description:
      'Central U.S. footprint. Prices vary by settlement location and market interval.',
  },
  {
    id: 'MISO',
    x: 580,
    y: 215,
    name: 'Midcontinent ISO',
    source:
      'https://www.misoenergy.org/markets-and-operations/real-time--market-data/market-reports/',
    description:
      'Midcontinent footprint. A schematic operator marker does not represent its service boundary.',
  },
  {
    id: 'PJM',
    x: 755,
    y: 280,
    name: 'PJM Interconnection',
    source: 'https://dataminer2.pjm.com/',
    description:
      'Mid-Atlantic and parts of the Midwest. Data Miner access and usage terms require review.',
  },
  {
    id: 'NYISO',
    x: 820,
    y: 170,
    name: 'New York ISO',
    source: 'https://www.nyiso.com/energy-market-operational-data',
    description:
      'New York. Public CSV reports provide zonal and generator LBMP; zones are not individual nodes.',
  },
  {
    id: 'ISO-NE',
    x: 899,
    y: 140,
    name: 'ISO New England',
    source: 'https://www.iso-ne.com/isoexpress/',
    description:
      'New England. ISO Express publishes location-specific energy market reports.',
  },
]
export function MarketExplorer() {
  const [selected, setSelected] = useState('CAISO')
  const market = markets.find((m) => m.id === selected)!
  return (
    <section className="panel market-panel" aria-labelledby="market-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p>
          <h2 id="market-heading">U.S. electricity markets</h2>
          <p className="panel-subtitle">
            Explore the grid behind your energy. Wholesale prices are separate
            from your scenario tariff.
          </p>
        </div>
        <span className="tag market-unavailable">Prices unavailable</span>
      </div>
      <div
        className="market-filters"
        role="group"
        aria-label="Select electricity market"
      >
        {markets.map((m) => (
          <button
            key={m.id}
            aria-pressed={selected === m.id}
            onClick={() => setSelected(m.id)}
          >
            {m.id}
          </button>
        ))}
      </div>
      <div className="market-layout">
        <div className="market-geography">
          <svg
            viewBox="0 0 975 610"
            role="img"
            aria-labelledby="map-title map-desc"
          >
            <title id="map-title">
              United States electricity market explorer
            </title>
            <desc id="map-desc">
              State outlines with approximate operator markers, not service
              boundaries or pricing nodes. Use the market selection buttons for
              an accessible alternative. No price data is connected.
            </desc>

            {states.map((s) => (
              <path
                key={s.name}
                d={s.path}
                fill="#142635"
                stroke="#344656"
                strokeWidth="0.9"
              />
            ))}
            {markets.map((m) => (
              <g
                key={m.id}
                transform={`translate(${m.x} ${m.y})`}
                className={
                  selected === m.id ? 'map-marker selected' : 'map-marker'
                }
              >
                <circle
                  r={selected === m.id ? 15 : 10}
                  className="marker-halo"
                />
                <circle r="4" />
                <rect x="-34" y="16" width="68" height="27" rx="5" />
                <text y="34" textAnchor="middle">
                  {m.id}
                </text>
              </g>
            ))}
          </svg>
          <div className="map-caption">
            <Globe2 size={13} /> Approximate operator locations · No
            service-area or nodal coverage implied
          </div>
        </div>
        <aside className="market-detail" aria-live="polite">
          <span className="eyebrow">SELECTED MARKET</span>
          <h3>{market.id}</h3>
          <p className="market-name">{market.name}</p>
          <div className="market-price">
            — <span>$/MWh</span>
          </div>
          <span className="market-status">No connected price feed</span>
          <p>{market.description}</p>
          <dl>
            <div>
              <dt>Market type</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Observation time</dt>
              <dd>Unavailable</dd>
            </div>
            <div>
              <dt>Price source</dt>
              <dd>Unavailable</dd>
            </div>
          </dl>
          <a
            className="secondary"
            href={market.source}
            target="_blank"
            rel="noreferrer"
          >
            Official data portal <ArrowUpRight size={14} />
          </a>
        </aside>
      </div>
      <p className="map-integrity">
        <Info size={14} /> Market directory only. No live, historical, or
        demonstration prices are displayed. Your optimization inputs remain
        unchanged.
      </p>
    </section>
  )
}
