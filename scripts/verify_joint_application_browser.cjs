// Production preview :5177 + real API :8007. External Playwright; no solver mocks.
// NODE_PATH=/tmp/gridpilot-browser/node_modules node scripts/verify_joint_application_browser.cjs
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const ts = require('../frontend/node_modules/typescript')
const { assertChartRendered } = require('./chart-rendering.cjs')
const output = 'docs/verification/joint-application-captures.json'
const frontend = 'http://127.0.0.1:5177'
const backend = 'http://127.0.0.1:8007'
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const cleanZero = v => v.toFixed(2) === '-0.00' ? '0.00' : v.toFixed(2)
const data = { testedFrontendCommit: revision, testedBackendCommit: revision,
  frontend, backend, build: 'Vite production build; VITE_API_BASE_URL=' + backend,
  responseMocking: false, startedAt: new Date().toISOString(), requests: [], pairs: [], checks: [], screenshots: [], errors: [] }

;(async () => {
  const source = await fs.readFile('frontend/src/data/demoScenario.ts', 'utf8')
  data.productSourceDiffAtRun = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'backend', 'frontend'], { encoding: 'utf8' }).trim()
  assert.equal(data.productSourceDiffAtRun, '', 'Acceptance requires unchanged product sources')
  data.buildAssets = {}
  for (const name of await fs.readdir('frontend/dist/assets')) {
    data.buildAssets[name] = createHash('sha256').update(await fs.readFile('frontend/dist/assets/'+name)).digest('hex')
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const adapter = {}
  new Function('exports', 'require', compiled)(adapter, require)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.on('pageerror', e => data.errors.push(e.message))
    const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    const click = name => page.getByRole('button', { name, exact: true }).click()
    const isOptimization = r => new URL(r.url()).origin === backend && new URL(r.url()).pathname === '/api/optimize' && r.request().method() === 'POST'
    const snapshot = async (prefix = 'current', inherited = null) => {
      const editor = inherited ? structuredClone(inherited) : {}
      for (const key of Object.keys(adapter.defaultEditor)) {
        const field = page.locator('#' + (prefix === 'current' ? key : 'alternative-' + key))
        if (await field.count()) editor[key] = await field.inputValue()
      }
      const mode = await page.locator(`#${prefix}-fixed-demand-mode`).inputValue()
      editor.demandProfile = { mode, values: [] }
      if (mode === 'custom') {
        for (let h = 0; h < 24; h++) editor.demandProfile.values.push(await page.locator(`#${prefix}-fixed-demand-${h}`).inputValue())
      } else if (mode === 'sources') {
        const sources = page.locator('.demand-profile').filter({ has: page.locator(`#${prefix}-fixed-demand-mode`) }).locator('.profile-hours')
        editor.demandProfile.sources = []
        for (let i = 0; i < await sources.count(); i++) {
          const category = (await sources.nth(i).locator('summary').innerText()).replace(' · fixed', '')
          const values = []
          for (let h = 0; h < 24; h++) values.push(await page.locator(`#${prefix}-fixed-demand-source-${i}-${h}`).inputValue())
          editor.demandProfile.sources.push({ category, values })
        }
      }
      return editor
    }
    const capture = async (response, id, editor) => {
      assert.equal(response.status(), 200)
      const scenario = response.request().postDataJSON(), result = await response.json()
      const mode = new URL(response.url()).searchParams.get('scheduling_mode')
      assert.equal(mode, 'joint')
      assert.deepEqual(scenario, adapter.toScenario(editor), 'DOM submission snapshot must produce exact request')
      const record = { id, url: response.url(), scheduling_mode: mode, status: response.status(),
        editorSnapshot: editor, snapshotOrigin: 'DOM controls at submission; alternative inherits non-editable fields from captured current editor',
        scenario, response: result }
      data.requests.push(record)
      return record
    }
    const checkComparison = async (section, record) => {
      const r = record.response
      const expected = [adapter.money(r.baseline_electricity_cost_usd),
        r.optimized_electricity_cost_usd === null ? 'Unavailable' : adapter.money(r.optimized_electricity_cost_usd),
        r.optimized_electricity_cost_usd === null ? 'Unavailable' : adapter.money(r.baseline_electricity_cost_usd - r.optimized_electricity_cost_usd),
        r.optimized_peak_demand_kw === null ? 'Unavailable' : `${(r.baseline_peak_demand_kw - r.optimized_peak_demand_kw).toFixed(2)} kW`]
      assert.deepEqual(await section.locator('.comparison-metrics strong').allTextContents(), expected)
      record.displayedBenefitMetrics = expected
      record.chartGeometry = await assertChartRendered(page, section.locator('.chart'))
      const table = section.locator('details.hourly-table')
      await table.locator('summary').click()
      const rows = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(td => td.textContent)))
      assert.equal(rows.length, 24)
      const vectors = r.optimized_demand_kw ? [r.baseline_demand_kw, r.optimized_demand_kw] : [r.baseline_demand_kw]
      rows.forEach((row, h) => assert.deepEqual(row, vectors.map(v => v[h].toFixed(2))))
      record.displayedHourlyTable = rows
      await table.locator('summary').click()
    }
    const screenshots = async name => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 900 : 1100 })
        await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
        for (let i = 0; i < await page.locator('.comparison .chart:visible').count(); i++)
          await assertChartRendered(page, page.locator('.comparison .chart:visible').nth(i))
        await page.evaluate(() => scrollTo(0, 0))
        const path = `docs/screenshots/joint-ee-${name}-${width}.png`
        await page.screenshot({ path, fullPage: true })
        data.screenshots.push(path)
      }
      await page.setViewportSize({ width: 1440, height: 1100 })
    }
    const run = async id => {
      await nav('Scenario configuration')
      const editor = await snapshot()
      const pending = page.waitForResponse(isOptimization)
      await click('Run optimization')
      const record = await capture(await pending, id, editor)
      await page.getByText('Displayed result mode: EV + flexible equipment', { exact: true }).waitFor()
      await checkComparison(page.locator('.comparison'), record)
      return record
    }
    const compare = async (id, current) => {
      const alternative = await snapshot('alternative', current)
      const responses = []
      const listener = r => { if (isOptimization(r)) responses.push(r) }
      page.on('response', listener)
      await click('Compare both scenarios')
      await page.getByText('Between scenarios: alternative minus current', { exact: true }).waitFor()
      page.off('response', listener)
      assert.equal(responses.length, 2)
      const records = [await capture(responses[0], id+'-current', current), await capture(responses[1], id+'-alternative', alternative)]
      for (let i = 0; i < 2; i++) await checkComparison(page.locator('.what-if-grid article').nth(i).locator('.comparison'), records[i])
      const values = await page.locator('.what-if > dl dd').allTextContents()
      if (records.every(x => x.response.feasibility_status === 'feasible')) {
        const a = records[0].response, b = records[1].response
        assert.deepEqual(values, [adapter.money(b.optimized_electricity_cost_usd - a.optimized_electricity_cost_usd),
          cleanZero(b.optimized_peak_demand_kw - a.optimized_peak_demand_kw)+' kW',
          cleanZero(b.optimized_demand_kw.reduce((a,b)=>a+b,0)-a.optimized_demand_kw.reduce((a,b)=>a+b,0))+' kWh'])
      } else {
        assert.deepEqual(values, [])
        await page.getByText('Between-scenario differences are unavailable unless both scenarios have feasible solver results.', { exact: true }).waitFor()
      }
      data.pairs.push({ id, current: records[0].id, alternative: records[1].id, displayedAlternativeMinusCurrent: values })
      return records
    }
    await page.goto(frontend)
    await page.getByText('Backend connected', { exact: true }).waitFor()
    await page.locator('#scheduling-mode').selectOption('joint')
    await run('demo-dashboard')
    await screenshots('demo-result')
    await nav('Scenario configuration')
    await page.locator('#current-fixed-demand-mode').selectOption('custom')
    await page.getByText('Edit 24 hourly demand values (kW)', { exact: true }).click()
    for (let h=0;h<24;h++) await page.locator(`#current-fixed-demand-${h}`).fill(String(2+h*0.25))
    await run('custom-dashboard')
    await screenshots('custom-result')
    await nav('Scenario configuration')
    await page.locator('#current-fixed-demand-mode').selectOption('sources')
    await click('Add Lighting'); await click('Add Refrigeration')
    for (let i=0;i<2;i++) {
      const details = page.locator('.profile-hours').nth(i)
      await details.locator('summary').click()
      for (let h=0;h<24;h++) await page.locator(`#current-fixed-demand-source-${i}-${h}`).fill(String(i===0?2:1))
      await details.locator('summary').click()
    }
    await page.locator('#arrival').fill('15'); await page.locator('#deadline').fill('22')
    const named = await run('sources-dashboard')
    await screenshots('sources-result')
    await nav('Scenario configuration')
    await page.locator('#limit').fill('24')
    await nav('Optimization')
    await page.getByText('Inputs have changed.', { exact: false }).waitFor()
    data.checks.push('Dashboard input edit marks old result stale')
    await nav('Scenario configuration'); await page.locator('#limit').fill('25')
    const current = await snapshot()
    await nav('What-if scenarios'); await click('Create alternative from current')
    await page.locator('#alternative-limit').fill('15')
    await compare('tight-cap-pair', current)
    await screenshots('whatif-feasible')
    await page.locator('#alternative-limit').fill('14')
    await page.getByText('Outdated comparison results are hidden', { exact: false }).waitFor()
    assert.equal(await page.locator('.what-if article').count(), 0)
    data.checks.push('What-if input edit hides prior results')
    await page.locator('#alternative-limit').fill('15')
    await click('Apply alternative to current')
    await nav('Scenario configuration')
    const applied = await snapshot()
    assert.deepEqual(applied, {...current,limit:'15'})
    assert.equal(await page.locator('#scheduling-mode').inputValue(),'joint')
    await nav('What-if scenarios'); await click('Restore starting scenario')
    await nav('Scenario configuration')
    assert.deepEqual(await snapshot(),current)
    data.applyRestore = { original: current, applied, restored: await snapshot() }
    data.checks.push('Apply/Restore preserves named profiles, other inputs and joint mode')
    await nav('What-if scenarios')
    await compare('restored-pair',current)
    await page.locator('#scheduling-mode').selectOption('ev_only')
    await page.getByText('Outdated comparison results are hidden', { exact: false }).waitFor()
    assert.equal(await page.locator('.what-if article').count(),0)
    assert.equal(await page.getByText('Displayed result mode: EV + flexible equipment', {exact:true}).count(),0)
    await page.locator('#scheduling-mode').selectOption('joint')
    assert.equal(await page.locator('.what-if article').count(),0)
    data.checks.push('Mode change clears dashboard and hides What-if; switching back does not revive prior comparison')
    await page.locator('#alternative-limit').fill('2')
    await compare('infeasible-pair',current)
    await screenshots('whatif-infeasible')
    // Exercise the full joint workflow again at a real mobile viewport.
    await page.setViewportSize({width:390,height:900})
    await page.locator('#alternative-limit').fill('15')
    await compare('mobile-pair',current)
    data.checks.push('Mobile viewport submits two genuine joint What-if requests and renders comparison')
    await nav('Scenario configuration')
    await page.locator('#limit').fill('2')
    await run('infeasible-dashboard')
    await screenshots('dashboard-infeasible')
    assert.equal(named.editorSnapshot.demandProfile.sources.length,2)
    assert.deepEqual(data.errors,[])
    data.completedAt = new Date().toISOString()
    data.status='PASS'
    console.log(`PASS: ${data.requests.length} real joint responses; profiles, charts, What-if, Apply/Restore and stale/mode checks`)
  } catch(error) {
    data.status='FAIL'; data.failure=error.stack; throw error
  } finally {
    await fs.writeFile(output,JSON.stringify(data,null,2)+'\n')
    await browser.close()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
