// Real local API, saved inputs and Chromium. AI endpoints are blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Axe=require(process.env.AXE_MODULE || '@axe-core/playwright').default;
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out='artifacts/cloud-blue';fs.mkdirSync(out,{recursive:true});
const report={checks:[],accessibility:[],errors:[],source:'Local Chromium and real FastAPI; AI blocked'};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:900}});const p=await context.newPage();
p.on('pageerror',e=>report.errors.push(e.message));await context.route('**/api/ai/**',r=>r.abort());
const click=name=>p.getByRole('button',{name,exact:true}).click();
const nav=name=>p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();
const shot=async name=>{assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' horizontal overflow');await p.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:"instant"});});await p.screenshot({path:`${out}/${name}.png`,fullPage:true});};
const audit=async name=>{const a=await new Axe({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.accessibility.push({name,violations:a.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});};
try {
await p.goto('http://127.0.0.1:5173');
for (const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,768]]) {await p.setViewportSize({width,height});assert(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),`home scrolls at ${width}x${height}`);for(const a of await p.locator('.welcome-actions a').all()){const box=await a.boundingBox();assert(box.y+box.height<=height);} }
report.checks.push('Home fits 1440×900, 1366×768, 1280×720 and 1024×768; both hero actions visible');
await p.setViewportSize({width:1440,height:900});await shot('landing-desktop');await audit('landing');
await p.keyboard.press('Tab');assert(await p.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'));report.checks.push('Keyboard focus indicator visible');
await p.setViewportSize({width:390,height:844});await shot('landing-mobile');await audit('landing-mobile');
await p.setViewportSize({width:320,height:480});const enlarged=await p.addStyleTag({content:'.welcome-copy h1{font-size:72px}.welcome-copy p{font-size:32px}.welcome-actions a{font-size:28px}'});await p.locator('.welcome-actions').scrollIntoViewIfNeeded();assert(await p.locator('.welcome-actions').isVisible());await enlarged.evaluate(el=>el.remove());report.checks.push('Essential actions accessible at 320×480 with enlarged hero text');
await p.setViewportSize({width:1440,height:900});await p.getByRole('link',{name:'Learn more',exact:true}).first().click();assert(p.url().endsWith('#learn-more'));assert.equal(await p.locator('.learn-main section').count(),3);await shot('learn-more');await audit('learn-more');await p.getByRole('link',{name:'Back to home',exact:true}).last().click();
await p.getByRole('link',{name:'Get started',exact:true}).first().click();assert(p.url().endsWith('#setup'));await click('Continue');assert(await p.locator('[name=businessName]').evaluate(el=>!el.validity.valid));
await p.getByLabel('Business name').fill('Cloud Blue Office');await p.getByLabel(/Business type/).selectOption('Office');await p.getByLabel(/ZIP code/).fill('53703');await p.getByLabel('Sat',{exact:true}).check();await p.reload();assert.equal(await p.getByLabel('Business name').inputValue(),'Cloud Blue Office');assert.equal(await p.getByLabel(/ZIP code/).inputValue(),'53703');assert(await p.getByLabel('Sat',{exact:true}).isChecked());
await shot('building-setup');await audit('building-setup');await p.setViewportSize({width:390,height:844});await shot('building-setup-mobile');await audit('building-setup-mobile');await p.setViewportSize({width:1440,height:900});
await p.getByRole('radio',{name:/Find savings opportunities/}).check();await click('Continue');await p.getByRole('heading',{name:'Add an improvement',exact:true}).waitFor();await click('Load synthetic LED example');await click('Calculate savings');await p.locator('[data-financial="net"]').first().waitFor();await shot('savings-desktop');await audit('savings');
report.checks.push('Validation, days/ZIP local persistence, non-EV savings-first setup and real annual calculation');
await p.setViewportSize({width:390,height:844});await shot('savings-mobile');await audit('savings-mobile');await p.setViewportSize({width:1440,height:900});
await nav('Energy plan');await click('Calculate energy plan');await p.getByRole('heading',{name:'Your daily energy plan is ready',exact:true}).waitFor();await nav('Overview');await shot('overview-desktop');await audit('overview');
report.checks.push('Real non-EV daily calculation and overview chart');
for (const [hash,name] of [['configuration','energy-plan'],['building','my-building'],['assistant','advisor'],['comparison','comparison'],['whatif','what-if'],['markets','markets']]) {await p.goto('http://127.0.0.1:5173/#'+hash);await p.locator('.page-heading h1').waitFor();await audit(name);assert.equal(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(244, 249, 255)');}
report.checks.push('Legacy deep links and Cloud Blue theme across plan, building, advisor, comparison, What-if and markets');
await p.goto('http://127.0.0.1:5173/#home');const saved=await p.evaluate(()=>localStorage.getItem('gridpilot.building-workspace'));await p.getByRole('link',{name:'Get started',exact:true}).first().click();await click('Edit building');assert.equal(await p.getByLabel('Business name').inputValue(),'Cloud Blue Office');assert.equal(JSON.parse(saved).workspace.name,'Cloud Blue Office');report.checks.push('Returning Get started offers saved workspace and explicit Edit building without overwriting');
assert.equal(report.errors.length,0);assert.equal(report.accessibility.flatMap(x=>x.violations).length,0,'Accessibility violations: see verification.json');
} finally {fs.writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
