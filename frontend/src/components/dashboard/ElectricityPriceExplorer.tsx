import { useState } from 'react'
import { MarketExplorer } from './MarketExplorer'
import { EiaRetailExplorer } from './EiaRetailExplorer'

export function ElectricityPriceExplorer() {
  const [view, setView] = useState<'retail' | 'wholesale'>('retail')
  return <div className="electricity-explorer">
    <div className="market-filters price-view-tabs" role="group" aria-label="Electricity price view">
      <button aria-pressed={view === 'retail'} onClick={() => setView('retail')}>State retail averages</button>
      <button aria-pressed={view === 'wholesale'} onClick={() => setView('wholesale')}>Wholesale market directory</button>
    </div>
    {view === 'retail' ? <EiaRetailExplorer /> : <><p className="wholesale-withheld">Wholesale observations are withheld pending display permissions. This directory contains operator geography and official links only.</p><MarketExplorer /></>}
  </div>
}
