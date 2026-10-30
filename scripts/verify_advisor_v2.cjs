// Browser presentation uses explicitly mocked advisor text. Solver and unavailable HTTP are real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const AxeBuilder = require(process.env.AXE_PLAYWRIGHT_MODULE || '@axe-core/playwright').default
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
 const browser = await chromium.launch({headless:true})
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1100}})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5194')
  const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
  await nav('Scenario configuration')
  const pending=page.waitForResponse(r=>r.url().includes('/api/optimize')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Run optimization',exact:true}).click()
  const solved=await pending;assert.equal(solved.status(),200)
  const result=await solved.json();assert(result.result_id)
  await nav('AI assistant')
  await page.locator('#ai-request').fill('What information do you need from me?')
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByText('Meta unavailable · last request failed',{exact:true}).waitFor()
  let count=0
  const transcripts=[]
  await page.route('**/api/ai/conversation',async route=>{
   const body=route.request().postDataJSON();assert.equal(body.result_id,result.result_id);count++
   if(count===2) {assert.equal(body.history.length,2);assert(body.history[1].content.includes('interval electricity'))}
   const proposal=count>1
   const response={source:'mock', category:proposal?'scenario_proposal':'clarification_required',message:proposal?'Review this site-cap proposal before comparing.':'Charging flexibility may offer a useful starting point. Your bill reduction goal needs measured consumption and a tariff breakdown before we can assess it.',follow_up_questions:proposal?[]:['Do you have interval electricity consumption data? It helps distinguish steady demand from charging peaks.','Does your bill include demand charges? That determines whether peak power affects your total bill.'],facts:proposal?[]:[`Verified submitted ev_only result: baseline daily energy charges USD ${result.baseline_electricity_cost_usd.toFixed(4)}; optimized daily energy charges USD ${result.optimized_electricity_cost_usd.toFixed(4)}. This demo scenario is separate from your warehouse background.`],profile:{business_type:'warehouse',employee_count:30,operating_hours:'7 AM to 7 PM',electricity_cost_and_period:'$6,000 per month',equipment:'four electric forklifts and delivery trucks',goals:'reduce electricity expenses by 50%'},changes:proposal?{building_max_demand_kw:15}:{},proposed_scenario:proposal?{...body.scenario,building_max_demand_kw:15}:null}
   transcripts.push({source:'injected browser fixture; NOT genuine Meta',request:body.request,response})
   await route.fulfill({json:response})
  })
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByRole('region',{name:'Follow-up questions'}).waitFor().catch(()=>{})
  await page.getByText('MOCK MODE — NOT META AI',{exact:true}).waitFor()
  assert.equal(await page.getByRole('log').locator('li').count(),2)
  await page.locator('#ai-request').fill('Keep the entire building below 15 kW.')
  await page.locator('#ai-request').press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Send to advisor')
  await page.keyboard.press('Enter')
  await page.getByRole('heading',{name:'Proposed operational change'}).waitFor()
  const axe=await new AxeBuilder({page}).include('.advisor').withTags(['wcag2a','wcag2aa']).analyze()
  fs.writeFileSync('artifacts/advisor-v2/accessibility.json',JSON.stringify({violations:axe.violations,passes:axe.passes.length},null,2))
  assert.deepEqual(axe.violations.map(v=>v.id),[])
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1100})
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await page.screenshot({path:`artifacts/advisor-v2/${width}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'Compare as alternative',exact:true}).click()
  await nav('AI assistant')
  await page.getByText('Alternative prepared. Run Compare both scenarios in What-if to calculate outcomes.',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByRole('button',{name:'Apply Changes',exact:true}).click()
  await nav('Scenario configuration');assert.equal(await page.locator('#limit').inputValue(),'15')
  assert.deepEqual(errors,[])
  fs.writeFileSync('artifacts/advisor-v2/browser-transcripts.json',JSON.stringify(transcripts,null,2))
  console.log('PASS: actual local HTTP solver and unavailable provider; injected advisor questions, continuity, exact result ID, explicit Compare/Apply, keyboard, desktop/mobile; axe: no WCAG A/AA violations in advisor. NOT live Meta acceptance.')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
