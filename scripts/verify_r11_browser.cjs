// Local production preview :5173 and real backend :8000. No AI or fabricated solver responses.
// NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_r11_browser.cjs
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const output = process.env.GRIDPILOT_QA_OUTPUT || 'artifacts/r1-1'
const { isEvOnlyOptimization, isJointOptimization } = require('./browser-api.cjs')
const { assertChartRendered } = require('./chart-rendering.cjs')
function contrast(foreground, background) {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
    .map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  const evidence = { contrast: [], modes: [], results: [], errors: [] }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', e => evidence.errors.push(e.message))
    const click = name => page.getByRole('button', { name, exact: true }).click()
    const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    const noOverflow = async () => {
      // ResizeObserver and native scrolling settle after a viewport change.
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth,
        undefined, { timeout: 3000 }).catch(() => {})
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > innerWidth + 1)
          .filter(n => n.closest('nav') === null).slice(0, 30).map(n => ({ tag: n.tagName, class: n.className, right: n.getBoundingClientRect().right, width: n.getBoundingClientRect().width, overflow: getComputedStyle(n).overflowX })) }))
      assert(geometry.scrollWidth <= geometry.width, JSON.stringify(geometry))
    }
    const optimize = async (mode = 'ev_only') => {
      const response = page.waitForResponse(mode === 'joint' ? isJointOptimization : isEvOnlyOptimization)
      await click('Run optimization')
      const r = await response, result = await r.json(), scenario = r.request().postDataJSON()
      assert.equal(r.status(), 200)
      assert.equal(result.feasibility_status, 'feasible')
      for (const prefix of ['baseline', 'optimized']) {
        const demand = result[`${prefix}_demand_kw`]
        const cost = demand.reduce((sum, kw, h) => sum + kw * scenario.electricity_prices_usd_per_kwh[h], 0)
        assert(Math.abs(cost - result[`${prefix}_electricity_cost_usd`]) < 1e-6)
        assert(Math.abs(Math.max(...demand) - result[`${prefix}_peak_demand_kw`]) < 1e-6)
      }
      assert(Math.abs(result.baseline_demand_kw.reduce((a,b) => a+b,0) - result.optimized_demand_kw.reduce((a,b) => a+b,0)) < 1e-6)
      evidence.results.push({ mode, scenario, result })
      await page.getByText('Backend result received for the submitted scenario.', { exact: true }).waitFor({ state: 'attached' })
      return scenario
    }
    await page.goto(process.env.GRIDPILOT_FRONTEND_URL || 'http://127.0.0.1:5173')
    await page.getByText('Backend connected', { exact: true }).waitFor()
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme })
      for (const width of [1440, 1024, 1000, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        for (const selector of ['.sidebar-note > .tag', '.workspace span', '.nav-label', '.nav-item', '.nav-active']) {
          const element = page.locator(selector).first()
          if (!await element.isVisible()) continue
          const colors = await element.evaluate(node => {
            let current = node
            while (current && getComputedStyle(current).backgroundColor === 'rgba(0, 0, 0, 0)') current = current.parentElement
            return { foreground: getComputedStyle(node).color, background: getComputedStyle(current).backgroundColor }
          })
          // Workspace uses a translucent overlay over the rail; composite it first.
          if (colors.background.startsWith('rgba')) {
            const values = colors.background.match(/[\d.]+/g).map(Number)
            colors.background = `rgb(${values.slice(0,3).map((v,i) => Math.round(v * values[3] + [21,60,50][i] * (1-values[3]))).join(', ')})`
          }
          const ratio = contrast(colors.foreground, colors.background)
          evidence.contrast.push({ selector, width, colorScheme, ...colors, ratio })
          assert(ratio >= 4.5, `${selector}: ${ratio.toFixed(2)}:1 at ${width}/${colorScheme}`)
        }
        for (const mode of ['ev_only', 'joint']) {
          await page.locator('#scheduling-mode').selectOption(mode)
          const disclosure = page.locator('.mode-explanation'), summary = disclosure.locator('summary')
          assert(await summary.isVisible())
          if (await disclosure.getAttribute('open') !== null) await summary.click()
          await summary.focus(); await page.keyboard.press('Enter')
          assert(await disclosure.locator('p').isVisible())
          const snapshot = await disclosure.ariaSnapshot()
          assert(snapshot.includes(mode === 'joint' ? 'interruptible and continuously adjustable' : 'Equipment and fixed building demand stay unchanged'))
          if (mode === 'joint') assert(snapshot.includes('Uninterrupted machine cycles are not modeled'))
          assert.equal(await page.locator('#scheduling-mode').getAttribute('aria-describedby'), await summary.getAttribute('id'))
          evidence.modes.push({ width, colorScheme, mode, keyboardExpanded: true, accessibleText: snapshot })
          await noOverflow()
          if (colorScheme === 'light' && mode === 'joint' && [1440, 768, 390].includes(width)) {
            await page.evaluate(() => scrollTo(0,0))
            await page.screenshot({ path: path.join(output, `after-${width}.png`), fullPage: true })
          }
          await page.keyboard.press('Space')
          assert.equal(await disclosure.getAttribute('open'), null)
        }
      }
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.locator('#scheduling-mode').selectOption('ev_only')
    await nav('Scenario configuration')
    await page.locator('#current-fixed-demand-mode').selectOption('custom')
    await page.getByText('Edit 24 hourly demand values (kW)', { exact: true }).click()
    const customValues = Array.from({ length: 24 }, (_, h) => String(1 + h / 8))
    customValues[0] = '0'; customValues[12] = '2.123456789'
    for (let h = 0; h < 24; h++) await page.locator(`#current-fixed-demand-${h}`).fill(customValues[h])
    const customScenario = await optimize()
    assert.deepEqual(customScenario.fixed_demand_kw, customValues.map(Number))
    async function inspectSubmitted(expected, named = false) {
      await page.mouse.move(0, 0)
      await page.getByText('Submitted scenario & result provenance', { exact: true }).click()
      const submitted = page.getByRole('region', { name: 'Submitted snapshot', exact: true })
      await submitted.getByText('All scenario settings', { exact: true }).focus(); await page.keyboard.press('Enter')
      const tableRegion = submitted.getByRole('region', { name: 'Submitted snapshot hourly fixed-demand inputs', exact: true })
      assert(await tableRegion.isVisible())
      const rows = tableRegion.locator('tbody tr')
      assert.equal(await rows.count(), 24)
      assert((await tableRegion.locator('caption').innerText()).includes('Submitted snapshot'))
      for (let h = 0; h < 24; h++) assert.deepEqual(await rows.nth(h).locator('td').allTextContents(), expected[h])
      assert.equal(await tableRegion.locator('input').count(), 0)
      for (const width of [1440, 768, 390]) {
        await page.mouse.move(0, 0)
        await page.setViewportSize({ width, height: 1000 }); await assertChartRendered(page); await noOverflow()
        await tableRegion.focus()
        assert(await tableRegion.evaluate(node => document.activeElement === node))
        if (await tableRegion.evaluate(node => node.scrollWidth > node.clientWidth)) {
          await page.keyboard.press('ArrowRight')
          await page.waitForFunction(node => node.scrollLeft > 0, await tableRegion.elementHandle())
        }
        await page.evaluate(() => scrollTo(0, 0))
        await page.screenshot({ path: path.join(output, `${named ? 'named' : 'custom'}-submitted-${width}.png`), fullPage: true })
      }
    }
    await inspectSubmitted(customValues.map(v => [v]))
    await nav('Scenario configuration')
    await page.getByText('Edit 24 hourly demand values (kW)', { exact: true }).click()
    await page.locator('#current-fixed-demand-0').fill('9')
    await nav('Energy overview')
    await page.getByText('PREVIOUS SCENARIO · STALE', { exact: true }).waitFor()
    await inspectSubmitted(customValues.map(v => [v]))
    await nav('Scenario configuration')
    await page.locator('#current-fixed-demand-mode').selectOption('sources')
    await click('Add Lighting'); await click('Add Refrigeration')
    for (let i = 0; i < 2; i++) {
      await page.locator('.profile-hours').nth(i).locator('summary').click()
      for (let h = 0; h < 24; h++) await page.locator(`#current-fixed-demand-source-${i}-${h}`).fill(i === 0 ? '2.125' : '1')
    }
    await page.locator('#scheduling-mode').selectOption('joint')
    const namedScenario = await optimize('joint')
    assert.deepEqual(namedScenario.fixed_demand_kw, Array(24).fill(3.125))
    await inspectSubmitted(Array.from({ length: 24 }, () => ['2.125', '1', '3.125']), true)
    const submittedRegion = page.getByRole('region', { name: 'Submitted snapshot', exact: true })
    assert((await submittedRegion.innerText()).includes('Lighting (kW)'))
    assert((await submittedRegion.innerText()).includes('Refrigeration (kW)'))
    // Editing a named-source draft must not mutate the visible submitted inputs.
    await nav('Scenario configuration')
    await page.locator('.profile-hours').first().locator('summary').click()
    await page.locator('#current-fixed-demand-source-0-0').fill('4')
    await nav('Energy overview'); await page.getByText('PREVIOUS SCENARIO · STALE', { exact: true }).waitFor()
    await inspectSubmitted(Array.from({ length: 24 }, () => ['2.125', '1', '3.125']), true)
    await nav('What-if scenarios'); await click('Create alternative from current')
    await page.locator('#alternative-limit').fill('20'); await click('Compare both scenarios')
    await page.getByText('Between scenarios: alternative minus current', { exact: true }).waitFor()
    await click('Apply alternative to current'); await nav('Scenario configuration')
    assert.equal(await page.locator('#limit').inputValue(), '20')
    await nav('What-if scenarios'); await click('Restore starting scenario'); await nav('Scenario configuration')
    assert.equal(await page.locator('#limit').inputValue(), '25')
    await nav('Energy overview'); await assertChartRendered(page)
    assert.deepEqual(evidence.errors, [])
    evidence.pass = true
    console.log('PASS: R1.1 contrast, light/dark preferences and responsive breakpoints; native disclosure keyboard/accessibility; 24 custom/named submitted entries and stale isolation; real EV/joint numerical results; What-if Apply/Restore.')
  } finally {
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(evidence, null, 2))
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
