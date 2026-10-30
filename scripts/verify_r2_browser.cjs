// Real local production build + backend; no intercepted responses or AI provider.
// NODE_PATH=/tmp/gridpilot-r2-browser/node_modules node scripts/verify_r2_browser.cjs
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { assertChartRendered } = require('./chart-rendering.cjs')
const output = process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/r2'
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value) < .005 ? 0 : value)
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const evidence = { results: [], layouts: [], errors: [] }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.on('pageerror', e => evidence.errors.push(e.message))
    const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    const click = name => page.getByRole('button', { name, exact: true }).click()
    const insights = () => page.getByRole('region', { name: 'Deterministic energy insights', exact: true })
    const verify = async (response) => {
      assert.equal(response.status(), 200)
      const scenario = response.request().postDataJSON(), result = await response.json()
      const calculated = {}
      for (const prefix of ['baseline', 'optimized']) {
        const demand = result[`${prefix}_demand_kw`]
        if (!demand) continue
        const periods = demand.map((kw, h) => ({ hour: h, demand: kw, price: scenario.electricity_prices_usd_per_kwh[h], cost: kw * scenario.electricity_prices_usd_per_kwh[h] }))
        const cost = periods.reduce((s, p) => s + p.cost, 0), peak = Math.max(...demand)
        assert(Math.abs(cost - result[`${prefix}_electricity_cost_usd`]) <= 2e-7)
        assert(Math.abs(peak - result[`${prefix}_peak_demand_kw`]) <= 1e-6)
        calculated[prefix] = { cost, peak, top: [...periods].sort((a, b) => b.cost - a.cost || a.hour - b.hour).slice(0, 3) }
      }
      evidence.results.push({ mode: new URL(response.url()).searchParams.get('scheduling_mode'), scenario, result, calculated })
      return { scenario, result, calculated }
    }
    const optimize = async () => {
      const response = page.waitForResponse(r => r.url().includes('/api/optimize?') && r.request().method() === 'POST')
      await click('Run optimization')
      const data = await verify(await response)
      await insights().waitFor()
      return data
    }
    await page.goto(process.env.GRIDPILOT_FRONTEND_URL || 'http://127.0.0.1:5182')
    await page.getByText('Backend connected', { exact: true }).waitFor()
    assert.equal(await insights().count(), 0)
    for (const mode of ['ev_only', 'joint']) {
      await page.locator('#scheduling-mode').selectOption(mode)
      const { calculated } = await optimize()
      const amounts = await insights().locator('.insight-periods').first().locator('li > strong').allTextContents()
      assert.deepEqual(amounts, calculated.optimized.top.map(p => money(p.cost)))
      assert((await insights().innerText()).includes(`${calculated.optimized.peak.toFixed(2)} kW`))
      await assertChartRendered(page)
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
        assert(await insights().isVisible())
        evidence.layouts.push({ mode, width, noPageOverflow: true })
        await insights().screenshot({ path: `${output}/${mode}-${width}.png` })
      }
      const disclosure = insights().getByText('Constraints & calculation evidence', { exact: true })
      await disclosure.focus(); await page.keyboard.press('Enter')
      assert(await insights().getByText('No constraint violations were reported', { exact: false }).isVisible())
      await page.keyboard.press('Enter')
    }
    const before = await insights().locator('.insight-periods').first().innerText()
    await nav('Scenario configuration'); await page.locator('#peak').fill('0.99'); await page.locator('#limit').fill('20')
    await nav('Energy overview')
    assert((await insights().innerText()).includes('previous submitted inputs'))
    assert.equal(await insights().locator('.insight-periods').first().innerText(), before)
    await insights().screenshot({ path: `${output}/stale-mobile.png` })
    await nav('What-if scenarios'); await click('Create alternative from current')
    await page.locator('#alternative-limit').fill('25')
    const pairResponses = []
    const listener = async r => { if (r.url().includes('/api/optimize?') && r.request().method() === 'POST') pairResponses.push(r) }
    page.on('response', listener)
    await click('Compare both scenarios')
    await page.getByText('Between scenarios: alternative minus current', { exact: true }).waitFor()
    page.off('response', listener)
    assert.equal(pairResponses.length, 2)
    for (const response of pairResponses) await verify(response)
    assert.equal(await insights().count(), 2)
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
    await page.screenshot({ path: `${output}/what-if-mobile.png`, fullPage: true })
    await page.locator('#alternative-peak').fill('0.88')
    assert.equal(await insights().count(), 0)
    await nav('Scenario configuration'); await page.locator('#limit').fill('1')
    const infeasible = await optimize()
    assert.equal(infeasible.result.feasibility_status, 'infeasible')
    assert((await insights().innerText()).includes('Optimized hourly costs unavailable'))
    assert(!(await insights().innerText()).includes('Optimized expenditure'))
    await insights().getByText('Constraints & calculation evidence', { exact: true }).click()
    for (const reason of infeasible.result.constraint_violations) assert((await insights().innerText()).includes(reason))
    await insights().screenshot({ path: `${output}/infeasible-mobile.png` })
    assert.deepEqual(evidence.errors, [])
    evidence.pass = true
    console.log('PASS: real HTTP EV/joint arithmetic, UI cost ranking, capacity, desktop/tablet/mobile, keyboard disclosure, stale snapshots, independent What-if results and infeasibility evidence.')
  } finally {
    await fs.writeFile(`${output}/verification.json`, JSON.stringify(evidence, null, 2))
    await browser.close()
  }
})().catch(e => { console.error(e); process.exitCode = 1 })
