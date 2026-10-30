// Local, real solver results. No intercepted responses or invented history.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const AxeBuilder = require('@axe-core/playwright').default
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const output = 'artifacts/premium-analytics'
  const evidence = { errors: [], cases: [] }
  await fs.mkdir(output, { recursive: true })
  try {
    for (const [version, port] of [['before', 5194], ['after', 5193]]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
      const page = await context.newPage()
      page.on('pageerror', error => evidence.errors.push(error.message))
      await page.goto(`http://localhost:${port}`)
      await page.getByText('Backend connected', { exact: true }).waitFor()
      await page.locator('#scheduling-mode').selectOption('joint')
      const response = page.waitForResponse(r => r.url().includes('/api/optimize?') && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Run optimization', exact: true }).click()
      const http = await response
      assert.equal(http.status(), 200)
      const result = await http.json()
      const scenario = http.request().postDataJSON()
      assert.equal(result.feasibility_status, 'feasible')
      await page.getByRole('navigation').getByRole('button', { name: 'Energy overview', exact: true }).click()
      await page.locator('.kpi-number').first().filter({hasText:'$'}).waitFor()
      const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      assert.equal(await page.locator('.kpi-number').first().innerText(), money(result.optimized_electricity_cost_usd))
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        await page.waitForTimeout(400)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${version} overflow at ${width}`)
        await page.screenshot({ path: `${output}/${version}-${width}.png`, fullPage: true })
        await page.locator('.comparison').screenshot({ path: `${output}/${version}-demand-${width}.png` })
        await page.locator('.command-metrics').screenshot({path:`${output}/${version}-kpis-${width}.png`})
        await page.locator('.scenario-analytics').screenshot({ path: `${output}/${version}-analytics-${width}.png` })
        if (version === 'after') {
          const chart = page.locator('.comparison .chart')
          await chart.scrollIntoViewIfNeeded()
          const box = await chart.boundingBox()
          assert(box.width > 150 && box.height > 150)
          await page.mouse.move(box.x + box.width * .55, box.y + box.height * .45)
          await page.locator('.analytics-tooltip').first().waitFor({ state: 'visible' })
          const tooltip = await page.locator('.analytics-tooltip').first().innerText()
          assert(tooltip.includes('kW') && tooltip.includes('1-hour interval'))
          assert.equal(await page.locator('.cost-totals').last().locator('strong').last().innerText(), money(result.optimized_electricity_cost_usd))
          assert.equal(await page.locator('.hourly-cost-chart .recharts-line-curve').count(), 2)
          assert.equal(await page.locator('.comparison .recharts-area-area, .scenario-analytics .recharts-area-area, .scenario-analytics .recharts-bar').count(), 0)
          await page.locator('.cost-hourly-table summary').click()
          const costCells = await page.locator('.cost-hourly-table tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(td => td.textContent)))
          assert.equal(costCells.length, 24)
          for (let h = 0; h < 24; h++) {
            assert.deepEqual(costCells[h], [result.baseline_demand_kw[h], result.optimized_demand_kw[h]].map(kw => (kw * scenario.electricity_prices_usd_per_kwh[h]).toFixed(4)))
          }
          for (const kind of ['baseline', 'optimized']) {
            const sum = result[`${kind}_demand_kw`].reduce((total, kw, h) => total + kw * scenario.electricity_prices_usd_per_kwh[h], 0)
            assert(Math.abs(sum - result[`${kind}_electricity_cost_usd`]) <= 1e-5)
          }
          await page.locator('.cost-hourly-table summary').click()
          const costChart = page.locator('.hourly-cost-chart')
          const costSection = page.locator('.scenario-analytics .compact-chart').last()
          await costSection.scrollIntoViewIfNeeded()
          const costBox = await costChart.boundingBox()
          await page.mouse.move(costBox.x + costBox.width * .65, costBox.y + costBox.height * .4)
          await page.locator('.analytics-tooltip').filter({hasText:'USD'}).waitFor({state:'visible'})
          await costSection.screenshot({path:`${output}/after-cost-tooltip-${width}.png`})
          await costChart.scrollIntoViewIfNeeded()
          const endBox = await costChart.boundingBox()
          await page.mouse.move(endBox.x + endBox.width - 14, endBox.y + endBox.height * .5)
          await page.locator('.analytics-tooltip').filter({hasText:'23:00–24:00'}).waitFor({state:'visible'})
          await page.locator('.comparison .hourly-table summary').click()
          const row = page.locator('.comparison tbody tr').first()
          const cells = await row.locator('td').allTextContents()
          assert.equal(cells[0], result.baseline_demand_kw[0].toFixed(2))
          assert.equal(cells[1], result.optimized_demand_kw[0].toFixed(2))
          await page.locator('.comparison .hourly-table summary').click()
          const tariff = page.locator('.compact-chart').first().locator('.analytics-chart')
          await tariff.scrollIntoViewIfNeeded()
          const t = await tariff.boundingBox()
          await page.mouse.move(t.x + t.width * .6, t.y + t.height * .4)
          await page.locator('.analytics-tooltip').filter({ hasText: '$/kWh' }).waitFor({ state: 'visible' })
          await page.locator('.scenario-analytics').screenshot({path:`${output}/after-tooltip-${width}.png`})
        }
        evidence.cases.push({version, width, optimizedCost: result.optimized_electricity_cost_usd, overflow:false})
      }
      if (version === 'after') {
        const a11y = await new AxeBuilder({ page }).include('.command-metrics').include('.comparison').include('.scenario-analytics').analyze()
        await fs.writeFile(`${output}/accessibility.json`, JSON.stringify(a11y, null, 2))
        assert.deepEqual(a11y.violations, [])
      }
      if (version === 'after') {
        await page.setViewportSize({width:1440,height:1100})
        const nav = name => page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
        await nav('Scenario configuration')
        await page.locator('#peak').fill('0.31')
        await nav('Energy overview')
        assert((await page.locator('.comparison').innerText()).includes('STALE'))
        await page.locator('.cost-hourly-table summary').click()
        const previous = await page.locator('.cost-hourly-table tbody tr').nth(17).locator('td').allTextContents()
        assert.deepEqual(previous, [result.baseline_demand_kw[17], result.optimized_demand_kw[17]].map(kw => (kw * scenario.electricity_prices_usd_per_kwh[17]).toFixed(4)))
        await page.locator('.cost-hourly-table summary').click()
        await page.locator('.scenario-analytics').screenshot({path:`${output}/after-stale.png`})
        await nav('Scenario configuration')
        await page.locator('#limit').fill('1')
        const pending = page.waitForResponse(r => r.url().includes('/api/optimize?') && r.request().method() === 'POST')
        await page.getByRole('button',{name:'Run optimization',exact:true}).click()
        const infeasible = await (await pending).json()
        assert.equal(infeasible.feasibility_status,'infeasible')
        await nav('Energy overview')
        await page.locator('.scenario-analytics').getByText('Optimized hourly costs unavailable.',{exact:true}).waitFor()
        assert.equal(await page.locator('.hourly-cost-chart .recharts-line-curve').count(),1)
        assert.equal(await page.locator('.cost-totals').last().locator('strong').last().innerText(),'Unavailable')
        await page.locator('.scenario-analytics').screenshot({path:`${output}/after-infeasible.png`})
        evidence.staleSnapshotPassed = true
        evidence.infeasibleUnavailablePassed = true
      }
      await context.close()
    }
    assert.deepEqual(evidence.errors, [])
  } finally { await fs.writeFile(`${output}/verification.json`, JSON.stringify(evidence, null, 2)); await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
