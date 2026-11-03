// Browser request uses genuine endpoint contract; all provider calls intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const report={source:'Local production UI with controlled AI selection/fallback; real deterministic Savings Engine',requests:[],checks:[],errors:[]};
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:320,height:1000}});p.on('pageerror',e=>report.errors.push(e.message));
 await p.route('**/api/ai/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5300/#setup');await p.getByLabel(/Business name/).fill('Fictional advisor office');await p.getByLabel(/Business type/).selectOption('Office');await p.getByRole('radio',{name:/Find savings opportunities/}).check();await p.getByRole('button',{name:'Continue',exact:true}).click();
 await p.getByRole('button',{name:'Load synthetic LED example',exact:true}).click();
 const pending=p.waitForResponse(r=>r.url().endsWith('/api/savings/recommendations')&&r.request().method()==='POST');await p.getByRole('button',{name:'Calculate savings',exact:true}).click();const http=await pending, savings=await http.json(), evidence=http.request().postDataJSON();
 await p.locator('[data-financial=net]').first().waitFor();
 await p.getByText('Help me find opportunities',{exact:true}).click();
 for(const source of ['meta','deterministic_fallback']){
  let count=0;
  await p.route('**/api/ai/savings/conversation',async route=>{
   count++; const req=route.request().postDataJSON();assert.deepEqual(req.evidence,evidence);assert.equal(req.evidence.profile.business_type,'Office');report.requests.push(req);
   await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{source,message:('Controlled browser fixture: confirm operating hours and installation cost. ').repeat(30),selected_categories:['led'],facts:['Values remain from the deterministic engine.'],follow_up_questions:['Can you confirm equivalent lighting service?'],savings}});
  });
  await p.locator('#savings-question').fill('Which lighting improvement should I prioritize?');await p.getByRole('button',{name:'Ask AI to select opportunities',exact:true}).click();
  await p.getByRole('heading',{name:source==='meta'?'AI-assisted category selection':'AI unavailable · standard guidance',exact:true}).waitFor();
  assert.equal(count,1);assert.equal(await p.locator('[data-measure-id="office-led-scenario"] [data-financial=net]').innerText(),'$2,500.00 USD/year');await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  report.checks.push(source+': correct endpoint, retained business/equipment context, one request, unchanged deterministic dollars and readable long response at 320px');
 }
 assert.equal(report.errors.length,0);
}finally{fs.writeFileSync('artifacts/hackathon-readiness/advisor.json',JSON.stringify(report,null,2));await b.close();}console.log(JSON.stringify(report.checks));})().catch(e=>{console.error(e);process.exitCode=1});
