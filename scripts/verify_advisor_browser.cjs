// Real local HTTP/optimizer; injected advisor JSON is NOT real Meta inference.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
 const browser = await chromium.launch({headless:true})
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1050}})
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5182')
  const nav = name => page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
  await nav('AI assistant')
  await page.getByRole('button',{name:'What are my modeled electricity costs?',exact:true}).click()
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByText('Meta unavailable · last request failed',{exact:true}).waitFor()
  await nav('Scenario configuration')
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/optimize') && r.request().method()==='POST')
  await page.getByRole('button',{name:'Run optimization',exact:true}).click()
  const solved=await responsePromise; assert.equal(solved.status(),200)
  const result=await solved.json()
  await nav('AI assistant')
  let count=0
  await page.route('**/api/ai/conversation', async route=>{
   const body=route.request().postDataJSON(); count++
   assert.equal(body.scenario.building_max_demand_kw,25)
   if(count===2) assert.equal(body.history.length,2)
   const proposal=count===2
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    source:'mock',category:proposal?'scenario_proposal':'answer',message:proposal?'Review a 15 kW site cap.':'Injected advisor selection, actual solver cost below.',facts:proposal?[]:[`Verified modeled daily baseline USD ${result.baseline_electricity_cost_usd.toFixed(4)}.`],profile:{business_type:'Office',employee_count:10},changes:proposal?{building_max_demand_kw:15}:{},proposed_scenario:proposal?{...body.scenario,building_max_demand_kw:15}:null
   })})
  })
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByText('MOCK MODE — NOT META AI',{exact:true}).waitFor()
  await page.locator('#ai-request').fill('Keep the entire building below 15 kW.')
  await page.locator('#ai-request').press('Tab')
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Send to advisor')
  await page.keyboard.press('Enter')
  await page.getByRole('heading',{name:'Proposed operational change'}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Apply Changes',exact:true}).isEnabled(),true)
  await page.screenshot({path:'artifacts/energy-advisor/desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow')
  await page.screenshot({path:'artifacts/energy-advisor/mobile.png',fullPage:true})
  await page.getByRole('button',{name:'Apply Changes',exact:true}).click()
  await nav('Scenario configuration'); assert.equal(await page.locator('#limit').inputValue(),'15')
  await nav('AI assistant'); assert.equal(await page.getByRole('log').locator('article').count(),4)
  assert.deepEqual(errors,[])
  console.log('PASS: real HTTP optimizer; actual provider unavailable; injected conversation continuity, keyboard submit, explicit apply, session persistence, desktop/mobile screenshots. No real Meta inference tested.')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
