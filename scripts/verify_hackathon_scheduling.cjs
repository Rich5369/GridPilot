// Existing fictional editor defaults; not W01/O01. Real HTTP solves, no Meta calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'), fs=require('node:fs');
const out='artifacts/hackathon-readiness';fs.mkdirSync(out,{recursive:true});
const {assertChartRendered}=require('./chart-rendering.cjs');
const report={source:'Local production frontend + real local optimizer; existing synthetic inputs, NOT W01/O01',checks:[],scenarios:[],errors:[]};
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.abs(n)<0.005?0:n);
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>report.errors.push(e.message));await p.route('**/api/ai/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5300/#example/configuration');
 for(const mode of ['flexible','joint']){
  await p.setViewportSize({width:1440,height:1000});
  await p.goto('http://127.0.0.1:5300/#example/configuration');
  await p.getByRole('button',{name:'Inputs',exact:true}).click();
  await p.locator('#analysis-choice').selectOption(mode);
  await p.locator('#equipmentStart').selectOption('14');
  await p.locator('#equipmentEnd').selectOption('22');
  const pending=p.waitForResponse(r=>r.url().includes('/api/optimize?')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Calculate energy plan',exact:true}).click();
  const http=await pending;assert.equal(http.status(),200);const result=await http.json(),request=http.request().postDataJSON();
  if(mode==='flexible')assert.deepEqual(request.ev_requirements,[]);
  assert.equal(result.feasibility_status,'feasible');assert.equal(result.operating_plan.verification_status,'passed');
  await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Energy plan',exact:true}).click();
  await p.getByRole('button',{name:'Results and equipment',exact:true}).click();
  const section=p.locator('.comparison');await section.waitFor();
  const expected=[usd(result.baseline_electricity_cost_usd),usd(result.optimized_electricity_cost_usd),usd(result.baseline_electricity_cost_usd-result.optimized_electricity_cost_usd),`${(result.baseline_peak_demand_kw-result.optimized_peak_demand_kw).toFixed(2)} kW`];
  assert.deepEqual(await section.locator('.comparison-metrics strong').allTextContents(),expected);
  const kwh=result.optimized_demand_kw.reduce((a,b)=>a+b,0);assert((await section.locator('.energy-context').innerText()).includes(kwh.toFixed(1)+' kWh'));
  const table=section.locator('details.hourly-table');
  await table.locator('summary').click();
  const rows=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(td=>td.textContent)));
  assert.equal(rows.length,24);rows.forEach((row,h)=>assert.deepEqual(row,[request.building_max_demand_kw.toFixed(2),result.baseline_demand_kw[h].toFixed(2),result.optimized_demand_kw[h].toFixed(2),request.fixed_demand_kw[h].toFixed(2)]));
  await table.locator('summary').click();
  await p.getByRole('region',{name:'Device operating schedule',exact:true}).waitFor();
  for(const width of [1440,768,390,320]){await p.setViewportSize({width,height:1000});await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await assertChartRendered(p,section.locator('.chart'));await p.screenshot({path:`${out}/${mode}-${width}.png`,fullPage:true});}
  report.scenarios.push({mode,request,response:result,displayedCostAndPeakMetrics:expected,displayedDailyEnergyKwh:kwh.toFixed(1)});
 }
 report.checks.push('Non-EV equipment and joint scheduling: real returned costs, energy, peaks, feasible device timeline and four responsive widths');assert.equal(report.errors.length,0);
}finally{fs.writeFileSync(`${out}/scheduling.json`,JSON.stringify(report,null,2));await b.close();}console.log(JSON.stringify(report.checks));})().catch(e=>{console.error(e);process.exitCode=1});
