import { useState } from 'react'
import { money } from '../../data/demoScenario'
export function calculateCosts(
  energy: number,
  fixed: number,
  rate: number | null,
  peak: number | null,
  days: number,
) {
  const demand = rate !== null && peak !== null ? rate * peak : null
  return {
    demand,
    dailyAllocation: demand === null ? null : demand / days,
    total: energy + fixed + (demand === null ? 0 : demand / days),
  }
}
export const defaultBillingInputs = {
  fixed: '0',
  rate: '',
  peak: '',
  days: '30',
}
type BillingInputs = typeof defaultBillingInputs
export function CostBreakdown({
  energy,
  inputs,
  setInputs,
  applied,
  setApplied,
}: {
  energy: number
  inputs: BillingInputs
  setInputs: (value: BillingInputs) => void
  applied: BillingInputs
  setApplied: (value: BillingInputs) => void
}) {
  const [error, setError] = useState('')
  const costs = calculateCosts(
    energy,
    Number(applied.fixed),
    applied.rate === '' ? null : Number(applied.rate),
    applied.peak === '' ? null : Number(applied.peak),
    Number(applied.days),
  )
  return (
    <section className="panel cost-panel">
      <p className="eyebrow">COST MODEL · USD</p>
      <h2>Daily cost breakdown</h2>
      <p className="muted">Calculated from the displayed demo profile.</p>
      <dl className="cost-list">
        <div>
          <dt>Energy charges</dt>
          <dd>{money(energy)}</dd>
        </div>
        <div>
          <dt>Fixed utility charges / day</dt>
          <dd>{money(Number(applied.fixed))}</dd>
        </div>
        <div>
          <dt>Demand allocation / day</dt>
          <dd>
            {costs.dailyAllocation === null
              ? 'Unavailable'
              : money(costs.dailyAllocation)}
          </dd>
        </div>
        <div className="cost-total">
          <dt>
            {costs.demand === null
              ? 'Known daily subtotal'
              : 'Total modeled daily cost'}
          </dt>
          <dd>{money(costs.total)}</dd>
        </div>
      </dl>
      <p className="cost-note">
        Energy = Σ(kW × 1 hour × $/kWh).{' '}
        {costs.demand === null
          ? 'Demand charges excluded until billing assumptions are supplied.'
          : `Estimated billing-period demand exposure: ${money(costs.demand)}; allocated across ${applied.days} days.`}
      </p>
      <details>
        <summary>Configure billing assumptions</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (
              !Number.isFinite(
                Number(inputs.rate) * Number(inputs.peak) +
                  Number(inputs.fixed) +
                  energy,
              ) ||
              inputs.fixed.trim() === '' ||
              inputs.days.trim() === '' ||
              Object.values(inputs).some(
                (v) =>
                  v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0),
              ) ||
              !Number.isInteger(Number(inputs.days)) ||
              Number(inputs.days) < 1 ||
              (inputs.rate === '') !== (inputs.peak === '')
            ) {
              setError(
                'Use nonnegative numbers, positive whole billing days, and supply both demand rate and billing peak or leave both blank.',
              )
              return
            }
            setApplied({ ...inputs })
            setError('')
          }}
        >
          {(
            [
              ['fixed', 'Fixed utility charge ($/day)'],
              ['rate', 'Demand rate ($/kW per billing period)'],
              ['peak', 'Assumed billing-period peak (kW)'],
              ['days', 'Billing-period days'],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`cost-${key}`}>{label}</label>
              <input
                id={`cost-${key}`}
                type="number"
                min={key === 'days' ? 1 : 0}
                step={key === 'days' ? 1 : 'any'}
                value={inputs[key]}
                onChange={(e) =>
                  setInputs({ ...inputs, [key]: e.target.value })
                }
              />
            </div>
          ))}
          <p className="cost-note">
            User assumptions only. Default fixed charge: $0/day. Supply a
            billing-period peak independently; this one-day hourly model cannot
            establish actual billing peak, ratchets or utility measurement
            intervals. Taxes excluded.
          </p>
          <button className="secondary">Apply cost assumptions</button>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </form>
      </details>
    </section>
  )
}
