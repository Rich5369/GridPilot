// Real local calculator/optimizer responses; every AI endpoint is intercepted.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Axe = require(process.env.AXE_MODULE || '@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = 'artifacts/hackathon-readiness';
const url = process.env.GRIDPILOT_FRONTEND_URL || 'http://127.0.0.1:5300';
fs.mkdirSync(out, {recursive:true});
const report = {source:'Local frontend and unchanged local backend; AI mocked, no paid inference', checks:[], coldStarts:[], responses:[], accessibility:[], errors:[]};
const click = (p, name) => p.getByRole('button', {name,exact:true}).click();
const nav = (p, name) => p.getByRole('navigation', {name:'Main navigation'}).getByRole('button', {name,exact:true}).click();
async function onboard(p, name, type='Office') {
  await p.goto(url+'/#setup');
  await p.getByLabel(/Business name/).fill(name);
  await p.getByLabel(/Business type/).selectOption(type);
  await p.getByRole('radio', {name:/Find savings opportunities/}).check();
  await click(p,'Continue');
  await p.getByRole('heading',{name:'Add an improvement',exact:true}).waitFor();
}
async function calculate(p) {
  const response = p.waitForResponse(r=>r.url().endsWith('/api/savings/recommendations') && r.request().method()==='POST');
  await click(p,'Calculate savings');
  const r=await response; assert.equal(r.status(),200);
  const body=await r.json();
  await p.waitForFunction(()=>document.querySelector('[data-financial=net]'));
  report.responses.push({request:r.request().postDataJSON(),response:body});
  return body;
}
(async()=>{
  const b=await chromium.launch({args:['--no-sandbox']});
  try {
    // Use elapsed real time, independent fresh contexts, one health request each.
    await Promise.all([35000,45000].map(async delay=>{
      const c=await b.newContext({viewport:{width:390,height:844}}); const p=await c.newPage();
      let health=0, posts=0;
      await c.route('**/api/ai/**',r=>r.abort());
      await c.route('**/api/health',async r=>{health++; await new Promise(resolve=>setTimeout(resolve,delay)); await r.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'ok',project:'GridPilot'}});});
      p.on('request',r=>{if(r.method()==='POST')posts++;});
      const name=`Cold-start office ${delay}`;
      await onboard(p,name);
      await p.getByText('Backend waking up… Allow up to a minute.',{exact:true}).waitFor();
      assert(await p.getByRole('button',{name:'Retry backend connection'}).isDisabled());
      await p.getByText('About your building',{exact:true}).click();
      await p.locator('#savings-profile-employee_count').fill('43');
      await p.getByText('Backend connected',{exact:true}).waitFor({timeout:60000});
      assert.equal(await p.locator('#savings-profile-employee_count').inputValue(),'43');
      const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('gridpilot.building-workspace')));
      assert.equal(saved.workspace.name,name); assert.equal(saved.workspace.businessContext.employee_count,43);
      assert.equal(health,1); assert.equal(posts,0);
      report.coldStarts.push({delayMs:delay,healthRequests:health,postRequests:posts,businessNameRetained:true,editedProfileRetained:true});
      await c.close();
    }));
    const c=await b.newContext({viewport:{width:1440,height:1000}}); const p=await c.newPage();
    p.on('pageerror',e=>report.errors.push(e.message));
    await c.route('**/api/ai/**',r=>r.abort());
    await onboard(p,'Fictional demo office');
    await click(p,'Load synthetic LED example');
    const body=await calculate(p), r=body.recommendations.find(r=>r.id==='office-led-scenario');
    assert(r); assert.equal(r.annual_kwh_saved,12500); assert.equal(r.annual_net_savings_usd,2500); assert.equal(r.simple_payback_years,1);
    const card=p.locator('[data-measure-id="office-led-scenario"]');
    const expected={energy:'12,500.00 kWh/year',gross:'$2,500.00 USD/year',expenses:'$0.00 USD/year',net:'$2,500.00 USD/year',upfront:'$2,500.00 USD upfront',payback:'1.00 years',roi:'100.00 % per year'};
    for(const [key,value] of Object.entries(expected))assert.equal(await card.locator(`[data-financial=${key}]`).innerText(),value);
    report.checks.push({name:'LED backend JSON versus displayed annual values',expected});
    await card.getByText('How this was calculated',{exact:true}).click();
    for(const width of [1440,768,390,320]) {
      await p.setViewportSize({width,height:1000});
      await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
      await p.screenshot({path:`${out}/led-${width}.png`,fullPage:true});
      const a=await new Axe({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      report.accessibility.push({width,violations:a.violations.map(v=>({id:v.id,impact:v.impact}))});
      assert.equal(a.violations.length,0);
    }
    await p.getByLabel('Include a documented customer-specific flat avoidable energy rate').uncheck();
    await calculate(p);
    await p.waitForFunction(()=>document.querySelector('[data-financial=gross]')?.getAttribute('data-value-state')==='unknown');
    report.checks.push('Missing rate stays unknown; inputs remain editable and stale results are replaced explicitly');
    // One bounded health deadline, then manual recovery without clearing workspace.
    await p.clock.install(); let health=0;
    await c.route('**/api/health',async r=>{health++; if(health===1) await new Promise(resolve=>setTimeout(resolve,1500)); try {await r.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'ok',project:'GridPilot'}});}catch{}});
    await p.reload(); await p.clock.runFor(60001);
    await p.getByText('Backend unavailable · retry connection',{exact:true}).waitFor();
    await click(p,'Retry backend connection');
    await p.getByText('Backend connected',{exact:true}).waitFor(); assert.equal(health,2);
    assert.equal(await p.locator('#savings-profile-employee_count').inputValue(),'');
    assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('gridpilot.building-workspace')))).workspace.name,'Fictional demo office');
    report.checks.push('60-second health deadline exposes manual retry; one explicit retry recovers saved workspace');
    await c.close();
    assert.equal(report.errors.length,0);
  } finally {fs.writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2)); await b.close();}
  console.log(JSON.stringify({checks:report.checks,coldStarts:report.coldStarts,accessibility:report.accessibility,errors:report.errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
