// Real local solver + explicitly unavailable provider. No fabricated market prices.
const { chromium } = require('playwright')
const AxeBuilder = require('@axe-core/playwright').default
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const evidence = { errors: [], screens: [], accessibility: [], results: [] }
  const output = 'artifacts/command-center/after'
  fs.mkdirSync(output, { recursive: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => evidence.errors.push(e.message))
    await page.goto('http://localhost:5187')
    await page.getByText('Backend connected', { exact: true }).waitFor()
    const nav = (label) =>
      page
        .getByRole('navigation')
        .getByRole('button', { name: label, exact: true })
        .click()
    async function capture(name) {
      await page.waitForTimeout(350)
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'Page overflow',
      )
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
      evidence.screens.push(name)
    }
    await capture('desktop-draft')
    assert.equal(
      await page
        .locator('.kpi-number')
        .allTextContents()
        .then((a) => a.join('')),
      '————',
    )
    await page.getByRole('button', { name: 'NYISO', exact: true }).click()
    assert(
      (await page.locator('.market-detail').innerText()).includes(
        'New York ISO',
      ),
    )
    await page.getByRole('button', { name: 'PJM', exact: true }).focus()
    await page.keyboard.press('Enter')
    assert.equal(
      await page
        .getByRole('button', { name: 'PJM', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    )
    await page.locator('.advisor-disclosure>summary').click()
    assert(!(await page.locator('#ai-request').isVisible()))
    await page.locator('.advisor-disclosure>summary').click()
    for (const mode of ['ev_only', 'joint']) {
      await page.locator('#scheduling-mode').selectOption(mode)
      const response = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/optimize?scheduling_mode=${mode}`) &&
          r.request().method() === 'POST',
      )
      await page
        .getByRole('button', { name: 'Run optimization', exact: true })
        .click()
      const r = await response
      assert.equal(r.status(), 200)
      const result = await r.json()
      evidence.results.push({ mode, result })
      await nav('Energy overview')
      await page
        .locator('.kpi-number')
        .first()
        .filter({ hasText: '$' })
        .waitFor()
      assert(
        (await page.locator('.kpi-number').first().innerText()).includes(
          result.optimized_electricity_cost_usd.toFixed(2),
        ),
      )
      assert(
        (await page.locator('.kpi-number').nth(1).innerText()).includes(
          result.optimized_peak_demand_kw.toFixed(2),
        ),
      )
      await capture(`desktop-${mode}`)
    }
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await capture(`overview-${width}`)
      const a = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      evidence.accessibility.push({
        width,
        violations: a.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      })
    }
    await nav('Scenario configuration')
    await page.locator('#limit').fill('1')
    await nav('Energy overview')
    assert(
      (await page.locator('.command-metrics').innerText()).includes(
        'Previous submitted scenario',
      ),
    )
    await page
      .getByRole('button', { name: 'Run optimization', exact: true })
      .click()
    await page
      .getByText('No feasible schedule was found.', { exact: true })
      .waitFor()
    await nav('Energy overview')
    assert.equal(await page.locator('.kpi-number').first().innerText(), '—')
    await capture('mobile-infeasible')
    await nav('AI assistant')
    // Fail closed without contacting Meta: verifies presentation only, never live-provider acceptance.
    await page.route('**/api/ai/conversation', (route) =>
      route.fulfill({
        status: 503,
        json: {
          detail: { message: 'Advisor unavailable during local acceptance.' },
        },
      }),
    )
    await page.locator('#ai-request').fill('Explain this result')
    await page
      .getByRole('button', { name: 'Send to advisor', exact: true })
      .click()
    await page
      .getByText('Advisor unavailable during local acceptance.', {
        exact: true,
      })
      .waitFor()
    await capture('mobile-advisor-unavailable')
    assert.deepEqual(evidence.errors, [])
  } finally {
    fs.writeFileSync(
      'artifacts/command-center/verification.json',
      JSON.stringify(evidence, null, 2),
    )
    await browser.close()
  }
  console.log(
    'PASS: real EV/joint metrics, unavailable market selection, advisor collapse/error, stale/infeasible results, responsive captures. See verification.json for axe findings.',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
