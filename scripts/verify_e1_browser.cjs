// Real production frontend and local API. No response interception or second solve.
const {chromium} = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const output = 'artifacts/e1'
;(async () => {
  await fs.mkdir(output,{recursive:true})
  const browser = await chromium.launch({headless:true})
  const evidence = {source:'real_local_http_and_chromium',baseRevision:'c3d52a4',cases:[],errors:[]}
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}})
    page.on('pageerror', e => evidence.errors.push(e.message))
    const nav = name => page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
    const region = () => page.getByRole('region',{name:'Device operating schedule',exact:true})
    async function run(name) {
      const pending = page.waitForResponse(r => r.url().includes('/api/optimize?') && r.request().method() === 'POST')
      await page.getByRole('button',{name:'Run optimization',exact:true}).click()
      const response = await pending; assert.equal(response.status(),200)
      const scenario = response.request().postDataJSON(), result = await response.json(), plan = result.operating_plan
      const record = {name,scheduling_mode:plan.scheduling_mode,scenario,response:result,reconciliation:{},screenshots:[]}
      evidence.cases.push(record)
      await region().waitFor()
      await region().getByRole('button',{name:'Baseline',exact:true}).waitFor()
      const feasible = result.feasibility_status === 'feasible'
      if(feasible) await region().getByRole('button',{name:'Optimized',exact:true}).click()
      const shown = feasible ? 'optimized' : 'baseline'
      assert.equal(await region().locator('.device-row').count(),plan.device_schedules.length)
      for(const [i,d] of plan.device_schedules.entries()) {
        const row = region().locator('.device-row').nth(i)
        assert((await row.innerText()).includes(d.device_id))
        assert((await row.innerText()).includes(`max ${Number(d.max_power_kw.toPrecision(7))} kW`))
        const labels = await row.locator('.hour-cell').evaluateAll(nodes => nodes.map(n=>n.getAttribute('aria-label')))
        for(let h=0;h<24;h++) assert(labels[h].includes(`${String(d[`${shown}_power_kw`][h])} kW`))
        await row.locator('summary').click()
        const baseline = await row.locator('tbody tr td:nth-child(2)').allTextContents()
        const optimized = await row.locator('tbody tr td:nth-child(3)').allTextContents()
        assert.deepEqual(baseline,d.baseline_power_kw.map(String))
        assert.deepEqual(optimized,d.optimized_power_kw ? d.optimized_power_kw.map(String) : Array(24).fill('Unavailable'))
        await row.locator('summary').click()
      }
      for(const kind of ['baseline','optimized']) {
        if(result[`${kind}_demand_kw`] === null) {assert(plan.device_schedules.every(d=>d.optimized_power_kw===null)); continue}
        const total = scenario.fixed_demand_kw.map((v,h)=>v+plan.device_schedules.reduce((s,d)=>s+d[`${kind}_power_kw`][h],0))
        const energy = total.reduce((a,b)=>a+b,0), cost = total.reduce((s,v,h)=>s+v*scenario.electricity_prices_usd_per_kwh[h],0)
        const peak = Math.max(...total), maxHourlyResidual = Math.max(...total.map((v,h)=>Math.abs(v-result[`${kind}_demand_kw`][h])))
        assert(maxHourlyResidual<=1e-6); assert(Math.abs(cost-result[`${kind}_electricity_cost_usd`])<=2e-7); assert(Math.abs(peak-result[`${kind}_peak_demand_kw`])<=1e-6)
        if(kind==='optimized') {
          assert(total.every(v=>v<=scenario.building_max_demand_kw+1e-6))
          for(const d of plan.device_schedules) {
            assert(Math.abs(d.optimized_power_kw.reduce((a,b)=>a+b,0)-d.required_energy_kwh)<=1e-6)
            assert(d.optimized_power_kw.every((v,h)=>v<=d.max_power_kw+1e-6 && (h>=d.available_hours.start_hour && h<d.available_hours.end_hour || v<=1e-6)))
          }
        }
        record.reconciliation[kind]={energy_kwh:energy,cost_usd:cost,peak_kw:peak,maxHourlyResidual}
      }
      const downloadEvent = page.waitForEvent('download')
      await region().getByRole('button',{name:'Export submitted evidence'}).click()
      const download = await downloadEvent
      const exported = JSON.parse(await fs.readFile(await download.path(),'utf8'))
      assert.deepEqual(exported.submitted_scenario,scenario); assert.deepEqual(exported.response,result)
      assert.equal(exported.scheduling_mode,plan.scheduling_mode)
      await region().locator('.hour-cell').first().focus(); assert((await region().locator('.plan-inspector').innerText()).includes('kW'))
      for(const width of [1440,768,390]) {
        await page.setViewportSize({width,height:1100})
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth)
        const file = `${name}-${width}.png`; await region().screenshot({path:`${output}/${file}`}); record.screenshots.push(file)
      }
      await page.setViewportSize({width:1440,height:1100})
      if(plan.baseline_constraint_violations.length) {
        await region().getByRole('button',{name:'Baseline',exact:true}).click()
        assert((await region().innerText()).includes('not compliant'))
        await region().screenshot({path:`${output}/${name}-baseline.png`})
      }
      return record
    }
    await page.goto('http://127.0.0.1:5291'); await page.getByText('Backend connected',{exact:true}).waitFor()
    const ev = await run('ev-only-feasible'); assert.equal(ev.response.feasibility_status,'feasible')
    assert(ev.response.operating_plan.device_schedules.some(d=>d.scheduling_role==='held_at_baseline'))
    await page.locator('#scheduling-mode').selectOption('joint')
    const joint = await run('joint-feasible'); assert.equal(joint.response.feasibility_status,'feasible')
    await nav('Scenario configuration'); await page.locator('#peak').fill('0.31'); await nav('Optimization')
    assert((await region().innerText()).includes('PREVIOUS SCENARIO · STALE'))
    await region().screenshot({path:`${output}/stale-result.png`})
    evidence.stale={responseCase:'joint-feasible',draftChange:{peak:'0.31'},unchangedDeviceText:await region().locator('.device-hours').first().getAttribute('aria-label')}
    await nav('Scenario configuration')
    for(const [key,value] of Object.entries({chargers:'1',chargerPower:'2',evEnergy:'2',arrival:'9',deadline:'10',equipmentPower:'2',duration:'1',equipmentStart:'9',equipmentEnd:'11',limit:'8.5'})) await page.locator(`#${key}`).fill(value)
    await page.locator('#scheduling-mode').selectOption('ev_only')
    const blocked = await run('ev-only-recovery-infeasible'); assert.equal(blocked.response.feasibility_status,'infeasible')
    await page.locator('#scheduling-mode').selectOption('joint')
    const recovery = await run('joint-recovery'); assert.equal(recovery.response.feasibility_status,'feasible')
    await nav('Scenario configuration'); await page.locator('#limit').fill('1')
    const impossible = await run('joint-infeasible'); assert.equal(impossible.response.feasibility_status,'infeasible')
    assert.deepEqual(evidence.errors,[]); evidence.pass=true
    console.log('PASS: exact device values, energy/windows/caps, aggregate/cost/peak reconciliation, held semantics, recovery, infeasibility, stale snapshot, keyboard and three viewports')
  } finally {await fs.writeFile(`${output}/acceptance.json`,JSON.stringify(evidence,null,2)); await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
