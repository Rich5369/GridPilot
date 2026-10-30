// Presentation fixtures only: these are not live provider or solver results.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
 const browser = await chromium.launch({headless:true})
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}})
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  let count=0
  await page.route('**/api/ai/conversation', async route=>{
   const body=route.request().postDataJSON(); count++
   if(count>1) assert.equal(body.history.length,(count-1)*2)
   body.history.forEach(turn=>assert.deepEqual(Object.keys(turn).sort(),['content','role']))
   const proposal=count>=3
   await route.fulfill({json:{source:'mock',category:proposal?'scenario_proposal':count===2?'clarification_required':'answer',message:proposal?'Review this proposal. Apply updates the draft; Compare opens What-if.':count===2?'Does this limit apply to the entire building?':'From your submitted engineering scenario:',facts:count===1?['No retained verified result for this submitted scenario. Run optimization to supply it.']:[],profile:{business_type:'Office',employee_count:24,operating_hours:'Weekdays, 9 AM–5 PM',goals:'Lower costs without disrupting operations'},changes:proposal?{building_max_demand_kw:15}:{},proposed_scenario:proposal?{...body.scenario,building_max_demand_kw:15}:null}})
  })
  await page.goto(process.env.ADVISOR_URL || 'http://127.0.0.1:5186')
  const nav = name=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
  await nav('AI assistant')
  assert.equal(await page.locator('.advisor-context details').getAttribute('open'),null)
  fs.mkdirSync('artifacts/advisor-polish/after',{recursive:true})
  await page.screenshot({path:'artifacts/advisor-polish/after/desktop-empty.png',fullPage:true})
  await page.getByRole('button',{name:'Keep peak power demand below 15 kW.',exact:true}).click()
  for(let i=0;i<3;i++) {
   await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
   await page.getByRole('log').locator('article').nth(i*2+1).waitFor()
  }
  assert.equal(await page.locator('.advisor-verified').count(),0)
  assert.equal(await page.getByText('Clarification needed',{exact:true}).count(),1)
  assert.equal(await page.getByRole('button',{name:'Apply Changes',exact:true}).isEnabled(),true)
  await page.screenshot({path:'artifacts/advisor-polish/after/desktop-conversation.png',fullPage:true})
  await page.locator('.advisor-context summary').focus(); await page.keyboard.press('Enter')
  assert.equal(await page.locator('.advisor-context details').evaluate(e=>e.open),true)
  const business=page.getByLabel('business type',{exact:true}); await business.fill('Warehouse')
  await page.getByText('User edited',{exact:true}).waitFor()
  await page.locator('.advisor-context summary').click()
  for(const width of [768,390]) {
   await page.setViewportSize({width,height:900})
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`)
   await page.screenshot({path:`artifacts/advisor-polish/after/${width}-conversation.png`,fullPage:true})
  }
  await page.locator('#ai-request').focus(); await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Send to advisor')
  await page.getByRole('button',{name:'Compare as alternative',exact:true}).click()
  await nav('AI assistant')
  await page.getByText('Alternative prepared. Run Compare both scenarios in What-if to calculate outcomes.',{exact:true}).waitFor()
  await nav('AI assistant')
  await page.getByRole('button',{name:'Send to advisor',exact:true}).click()
  await page.getByRole('button',{name:'Apply Changes',exact:true}).click()
  await nav('Scenario configuration')
  assert.equal(await page.locator('#limit').inputValue(),'15')
  assert.deepEqual(errors,[])
  console.log('PASS: multi-turn wire format, distinct clarification, no false verified badge, context editing/provenance, keyboard disclosure and composer, Apply and Compare, 1440/768/390 layouts; no browser errors. Mock presentation fixtures only.')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
