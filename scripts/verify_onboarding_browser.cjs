// Actual local HTTP application/optimizer; server SDK is an injected fixture, NOT live Meta.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert=require('node:assert/strict'),fs=require('node:fs')
const output='artifacts/completion-budget'
const warehouse='I operate a warehouse with 30 employees working from 7 AM to 7 PM. My electricity bill is about $6,000 per month. We have four electric forklifts and charge delivery trucks. I want to cut our electricity expenses by 50%.'
;(async()=>{
 const browser=await chromium.launch({headless:true})
 const evidence={source:'injected SDK completions; actual local HTTP and optimizer; NOT genuine Meta',checks:[],liveInferenceRequests:0,errors:[]}
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}})
  page.on('pageerror',e=>evidence.errors.push(e.message))
  const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click()
  const click=name=>page.getByRole('button',{name,exact:true}).click()
  const isSolve=r=>r.url().includes('/api/optimize')&&r.request().method()==='POST'
  await page.goto('http://127.0.0.1:5210');await nav('Scenario configuration')
  await page.locator('#arrival').fill('15');await page.locator('#deadline').fill('22')
  await page.locator('#scheduling-mode').selectOption('joint')
  const pending=page.waitForResponse(isSolve);await click('Run optimization');const solved=await pending
  assert.equal(solved.status(),200);const result=await solved.json();assert(result.result_id)
  await nav('AI assistant')
  async function send(text){
   await page.locator('#ai-request').fill(text)
   const pending=page.waitForResponse(r=>r.url().includes('/api/ai/conversation')&&r.request().method()==='POST')
   await click('Send to advisor');return pending
  }
  const onboarding=await send(warehouse);assert.equal(onboarding.status(),200)
  const first=await onboarding.json();assert.equal(first.profile.employee_count,30);assert.equal(first.profile.consumption_and_units,null)
  await page.getByRole('log').locator('article').nth(1).waitFor()
  evidence.checks.push('Detailed warehouse extraction passes through real SDK parse/strict schema/grounding path using synthetic valid completion')
  const followup=await send('Consumption remains unknown. Forklifts can charge after work.')
  assert.equal(followup.status(),200)
  assert.equal(followup.request().postDataJSON().profile.employee_count,30)
  assert.equal(followup.request().postDataJSON().history.length,2)
  assert.equal((await followup.json()).profile.business_type,'warehouse')
  const explanation=await send('Why did optimization reduce my daily cost?');const explained=await explanation.json()
  assert.equal(explanation.status(),200);assert.equal(explanation.request().postDataJSON().result_id,result.result_id)
  assert(!explained.message.includes('Flexible equipment caused'))
  assert(explained.facts.some(f=>f.includes('difference USD 0.0000')))
  evidence.checks.push('Multi-turn profile/history retained; exact result ID; adversarial causal prose replaced by aggregate explanation and device ledger')
  const priorArticles=await page.getByRole('log').locator('article').count()
  const failed=await send('fixture truncated');assert.equal(failed.status(),502)
  const failure=await failed.json();assert.match(failure.detail.request_id,/^[0-9a-f]{32}$/)
  evidence.sanitizedFailure=failure;evidence.failureHeader=failed.headers()['x-request-id']
  assert.equal(evidence.failureHeader,failure.detail.request_id)
  await page.getByText('Meta unavailable · last request failed',{exact:true}).waitFor()
  await page.getByText('Meta AI could not finish this reply. No changes were applied. Try a shorter question or continue with manual optimization.',{exact:true}).waitFor()
  assert.equal(await page.getByRole('log').locator('article').count(),priorArticles)
  assert.equal(await page.locator('#ai-request').inputValue(),'fixture truncated')
  assert((await page.locator('.advisor-context-summary').innerText()).includes('30'))
  evidence.checks.push('Truncated completion fails closed with correlation ID and existing unavailable UI; no raw content exposure or retry')
  const proposed=await send('Keep the entire building below 15 kW.');assert.equal(proposed.status(),200)
  assert.equal(proposed.request().postDataJSON().profile.employee_count,30)
  assert(!proposed.request().postDataJSON().history.some(t=>t.content==='fixture truncated'))
  await page.getByRole('heading',{name:'Proposed operational change',exact:true}).waitFor()
  await click('Compare as alternative')
  const responses=[];const listener=r=>{if(isSolve(r))responses.push(r)};page.on('response',listener)
  await click('Compare both scenarios');await page.getByText('Between scenarios: alternative minus current',{exact:true}).waitFor();page.off('response',listener)
  assert.equal(responses.length,2);assert(responses.every(r=>r.status()===200))
  await click('Apply alternative to current');await nav('Scenario configuration');assert.equal(await page.locator('#limit').inputValue(),'15')
  evidence.checks.push('Validated fixture proposal requires explicit Compare, real solver comparison, then explicit Apply')
  await nav('AI assistant')
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1100});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  }
  assert.deepEqual(evidence.errors,[])
  console.log('PASS:',evidence.checks.join('; '))
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/browser.json',JSON.stringify(evidence,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
