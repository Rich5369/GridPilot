// Run the local backend on :8000 and frontend on :5173. External Playwright required.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { isEvOnlyOptimization } = require('./browser-api.cjs')
const { assertChartRendered } = require('./chart-rendering.cjs')
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      }),
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(
      process.env.GRIDPILOT_FRONTEND_URL || 'http://127.0.0.1:5173',
    )
    await page.getByText('Backend connected', { exact: true }).waitFor()
    const nav = (name) =>
      page
        .getByRole('navigation')
        .getByRole('button', { name, exact: true })
        .click()
    const click = (name) =>
      page.getByRole('button', { name, exact: true }).click()
    const noOverflow = async () =>
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
    await assertChartRendered(page)
    await page.screenshot({
      path: `${process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/scenario-workspace/sources'}/commercial-after-desktop.png`,
      fullPage: true,
    })
    const chart = page.locator('.recharts-surface[role="application"]').first()
    await chart.focus()
    await page.keyboard.press('ArrowRight')
    await page
      .locator('.recharts-tooltip-wrapper')
      .first()
      .getByText('kW', { exact: false })
      .waitFor()
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await assertChartRendered(page)
      await noOverflow()
      await page.screenshot({
        path: `${process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/scenario-workspace/sources'}/commercial-total-${width}.png`,
        fullPage: true,
      })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.waitForTimeout(200)
    await nav('Scenario configuration')
    await page.locator('#current-fixed-demand-mode').selectOption('sources')
    assert(
      await page
        .getByRole('button', { name: 'Run optimization', exact: true })
        .isDisabled(),
    )
    await click('Add Lighting')
    await click('Add Refrigeration')
    for (const [index, value] of [
      [0, '2'],
      [1, '1'],
    ]) {
      await page.locator('.profile-hours').nth(index).locator('summary').click()
      for (let h = 0; h < 24; h++)
        await page
          .locator(`#current-fixed-demand-source-${index}-${h}`)
          .fill(value)
      await page.locator('.profile-hours').nth(index).locator('summary').click()
    }
    await page.locator('#chargers').fill('0')
    await page
      .getByText('Fixed building demand preview', { exact: true })
      .waitFor()
    const toggle = page.getByRole('button', { name: 'Breakdown by source', exact: true })
    await toggle.focus(); await page.keyboard.press('Enter')
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
    const box = page.getByRole('checkbox').first()
    await box.focus(); await page.keyboard.press('Space')
    assert(!(await box.isChecked()))
    await page.keyboard.press('Space')
    await page.getByText('Lighting · fixed', { exact: true }).first().waitFor()
    await page.getByText('View all 24 hourly values', { exact: true }).click()
    assert.equal(await page.locator('.hourly-table tbody tr').count(), 24)
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await assertChartRendered(page)
      await noOverflow()
      await page.screenshot({
        path: `${process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/scenario-workspace/sources'}/commercial-sources-${width}.png`,
        fullPage: true,
      })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    const responsePromise = page.waitForResponse(
      (r) => isEvOnlyOptimization(r) && r.request().method() === 'POST',
    )
    await click('Run optimization')
    const response = await responsePromise
    assert.equal(response.status(), 200)
    const payload = response.request().postDataJSON(),
      result = await response.json()
    assert.deepEqual(payload.fixed_demand_kw, Array(24).fill(3))
    assert.deepEqual(payload.ev_requirements, [])
    assert(!('sources' in payload))
    assert.equal(result.feasibility_status, 'feasible')
    near(
      result.baseline_demand_kw.reduce((a, b) => a + b, 0),
      78,
    )
    for (const [demand, cost, peak] of [
      [
        result.baseline_demand_kw,
        result.baseline_electricity_cost_usd,
        result.baseline_peak_demand_kw,
      ],
      [
        result.optimized_demand_kw,
        result.optimized_electricity_cost_usd,
        result.optimized_peak_demand_kw,
      ],
    ]) {
      near(
        demand.reduce(
          (sum, kw, h) => sum + kw * payload.electricity_prices_usd_per_kwh[h],
          0,
        ),
        cost,
      )
      near(Math.max(...demand), peak)
      near(
        demand.reduce((a, b) => a + b, 0),
        78,
      )
    }
    await page
      .locator('.comparison')
      .getByText('Optimized demand', { exact: true })
      .waitFor()
    await assertChartRendered(page)
    await page.screenshot({
      path: `${process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/scenario-workspace/sources'}/commercial-after-result.png`,
      fullPage: true,
    })
    await nav('Scenario configuration')
    await page.locator('.profile-hours').first().locator('summary').click()
    await page.locator('#current-fixed-demand-source-0-0').fill('4')
    await nav('Optimization')
    await page.getByText('Inputs have changed.', { exact: false }).waitFor()
    await nav('What-if scenarios')
    await click('Create alternative from current')
    await page.locator('.profile-hours').first().locator('summary').click()
    await page.locator('#alternative-fixed-demand-source-0-0').fill('5')
    await click('Compare both scenarios')
    await page
      .getByText('Between scenarios: alternative minus current', {
        exact: true,
      })
      .waitFor()
    await click('Apply alternative to current')
    await click('Restore starting scenario')
    await nav('Scenario configuration')
    assert.equal(
      await page.locator('#current-fixed-demand-source-0-0').inputValue(),
      '4',
    )
    await fs.writeFile(
      '/tmp/gridpilot-commercial-result.json',
      JSON.stringify({ payload, result, errors }, null, 2),
    )
    assert.deepEqual(errors, [])
    console.log(
      'PASS: named source aggregation, real EV-only/no-EV solver, costs/energy/peaks, stale results, What-if/apply/Restore, keyboard toggles, 1440/768/390px screenshots, no overflow or browser errors',
    )
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
