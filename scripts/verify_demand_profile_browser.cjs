// Start local frontend and unchanged backend first. Requires external Playwright install.
// NODE_PATH=/tmp/gridpilot-browser/node_modules GRIDPILOT_FRONTEND_URL=http://127.0.0.1:5175 node scripts/verify_demand_profile_browser.cjs
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { isEvOnlyOptimization, isJointOptimization } = require('./browser-api.cjs')
const { assertChartRendered } = require('./chart-rendering.cjs')
const output = process.env.GRIDPILOT_QA_OUTPUT || '/tmp/gridpilot-demand-qa'
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.env.GRIDPILOT_FRONTEND_URL || 'http://127.0.0.1:5173')
    await page.getByText('Backend connected', { exact: true }).waitFor()
    const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    const click = name => page.getByRole('button', { name, exact: true }).click()
    const input = (hour, prefix = 'current') => page.locator(`#${prefix}-fixed-demand-${hour}`)
    const fillHour = async (hour, value, prefix = 'current') => {
      const field = input(hour, prefix)
      if (!await field.isVisible()) await field.locator('xpath=ancestor::details').locator('summary').click()
      await field.fill(value)
    }
    const optimize = async (predicate = isEvOnlyOptimization) => {
      const response = page.waitForResponse(predicate)
      await click('Run optimization')
      return await response
    }
    const check = async response => {
      assert.equal(response.status(), 200)
      const scenario = response.request().postDataJSON(), result = await response.json()
      assert.equal(result.feasibility_status, 'feasible')
      const baseline = [...scenario.fixed_demand_kw]
      for (const item of [...scenario.ev_requirements.map(ev => ({ start: ev.arrival_hour, end: ev.deadline_hour, energy: ev.energy_required_kwh, power: ev.max_charging_power_kw })), ...scenario.flexible_equipment.map(item => ({ start: item.available_hours.start_hour, end: item.available_hours.end_hour, energy: item.energy_required_kwh, power: item.max_power_kw }))]) {
        let remaining = item.energy
        for (let h = item.start; h < item.end; h++) { const power = Math.min(item.power, remaining); baseline[h] += power; remaining -= power }
      }
      baseline.forEach((v, h) => near(v, result.baseline_demand_kw[h]))
      const cost = demand => demand.reduce((sum, kw, h) => sum + kw * scenario.electricity_prices_usd_per_kwh[h], 0)
      near(cost(baseline), result.baseline_electricity_cost_usd)
      near(cost(result.optimized_demand_kw), result.optimized_electricity_cost_usd)
      near(Math.max(...result.optimized_demand_kw), result.optimized_peak_demand_kw)
      near(result.optimized_demand_kw.reduce((a, b) => a + b, 0), baseline.reduce((a, b) => a + b, 0))
      assert(Math.max(...result.optimized_demand_kw) <= scenario.building_max_demand_kw + 1e-6)
      result.optimized_demand_kw.forEach((kw, h) => assert(kw >= scenario.fixed_demand_kw[h] - 1e-6))
      return { scenario, result }
    }
    const original = await check(await optimize())
    near(original.result.baseline_electricity_cost_usd, 20.576)
    near(original.result.baseline_peak_demand_kw, 23.9)
    await nav('Scenario configuration')
    const source = page.locator('#current-fixed-demand-mode')
    assert.equal(await source.inputValue(), 'demo')
    // Native select and details must be keyboard operable.
    await source.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
    assert.equal(await source.inputValue(), 'custom')
    const summary = page.getByText('Edit 24 hourly demand values (kW)', { exact: true })
    await summary.focus(); await page.keyboard.press('Enter')
    assert(await input(0).isVisible())
    assert.equal(await page.locator('.profile-hour-grid input').count(), 24)
    const values = Array.from({ length: 24 }, (_, h) => 2 + h * 0.25)
    for (let h = 0; h < 24; h++) await fillHour(h, String(values[h]))
    await fillHour(0, '-1')
    assert.equal(await input(0).getAttribute('aria-invalid'), 'true')
    assert(await page.getByRole('button', { name: 'Run optimization', exact: true }).isDisabled())
    await fillHour(0, '')
    assert(await page.getByRole('button', { name: 'Run optimization', exact: true }).isDisabled())
    await fillHour(0, String(values[0]))
    assert(await input(0).isVisible(), 'Correcting input should not collapse the editor')
    await source.selectOption('demo'); await source.selectOption('custom')
    assert.equal(await input(10).inputValue(), String(values[10]))
    await fillHour(10, String(values[10]))
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await assertChartRendered(page)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: `${output}/custom-editor-${width}.png`, fullPage: true })
    }
    const custom = await check(await optimize())
    assert.deepEqual(custom.scenario, { ...original.scenario, fixed_demand_kw: values })
    await page.getByText('Submitted scenario & result provenance', { exact: true }).click()
    await page.getByText('Optimizer-calculated result · Submitted inputs: User-configured', { exact: false }).waitFor()
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `${output}/custom-result-mobile.png`, fullPage: true })
    await nav('Scenario configuration')
    await fillHour(0, '3')
    await nav('Optimization')
    await page.getByText('Inputs have changed.', { exact: false }).waitFor()
    await nav('Scenario configuration'); await fillHour(0, String(values[0]))
    await nav('What-if scenarios'); await click('Create alternative from current')
    const alternativeValues = [...values]; alternativeValues[10] = 11.5
    // Reused editor remains compact by default in the alternative.
    await page.getByText('Edit 24 hourly demand values (kW)', { exact: true }).click()
    await fillHour(10, '11.5', 'alternative')
    const responses = []
    const listener = r => { if (isEvOnlyOptimization(r)) responses.push(r) }
    page.on('response', listener)
    await click('Compare both scenarios')
    await page.getByText('Between scenarios: alternative minus current', { exact: true }).waitFor()
    page.off('response', listener)
    assert.equal(responses.length, 2)
    const pair = await Promise.all(responses.map(check))
    assert.deepEqual(pair[0].scenario.fixed_demand_kw, values)
    assert.deepEqual(pair[1].scenario.fixed_demand_kw, alternativeValues)
    await fillHour(10, '12', 'alternative')
    await page.getByText('Outdated comparison results are hidden', { exact: false }).waitFor()
    await fillHour(10, '11.5', 'alternative')
    await click('Apply alternative to current'); await nav('Scenario configuration')
    assert.equal(await input(10).inputValue(), '11.5')
    await nav('What-if scenarios'); await click('Restore starting scenario'); await nav('Scenario configuration')
    assert.equal(await input(10).inputValue(), String(values[10]))
    // Mode changes preserve the profile and execute real joint optimization.
    await page.locator('#scheduling-mode').selectOption('joint')
    assert.equal(await input(10).inputValue(), String(values[10]))
    const joint = await optimize(isJointOptimization)
    const jointCustom = await check(joint)
    await page.getByText('Submitted scenario & result provenance', { exact: true }).click()
    await page.getByText('Displayed result mode: EV + flexible equipment', { exact: true }).waitFor()
    assert.deepEqual(joint.request().postDataJSON().fixed_demand_kw, values)
    await page.locator('#scheduling-mode').selectOption('ev_only')
    await nav('Scenario configuration')
    await fillHour(0, '30')
    const infeasible = await optimize()
    assert.equal(infeasible.status(), 200)
    const bad = await infeasible.json()
    assert.equal(bad.feasibility_status, 'infeasible')
    assert.equal(bad.optimized_demand_kw, null)
    await page.getByText('Infeasible — reported by backend', { exact: false }).waitFor()
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `${output}/custom-infeasible-mobile.png`, fullPage: true })
    await nav('Scenario configuration'); await click('Reset to Default Scenario')
    assert.equal(await source.inputValue(), 'demo')
    const reset = await check(await optimize())
    assert.deepEqual(reset.scenario, original.scenario)
    assert.deepEqual(errors, [])
    await fs.writeFile(`${output}/verified-results.json`, JSON.stringify({ original, custom, jointCustom, pair, infeasible: bad }, null, 2))
    console.log('PASS: default behavior, keyboard profile selection/expansion, 24 exact values without double counting, validation, real baseline and optimized calculations, stale results, independent What-if payloads/apply/restore, real joint custom-profile optimization, infeasibility, reset, responsive layouts and no page errors.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
