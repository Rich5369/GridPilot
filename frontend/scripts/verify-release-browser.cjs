// Local production-build acceptance. Every AI POST is fulfilled locally, never dispatched.
// Requires Playwright; see docs/frontend-recovery-timeline.md for invocation.
const { chromium } = require(process.env.GRIDPILOT_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const fixtures = require('../src/testFixtures/releaseScenarios.json');
const delay = Number(process.env.GRIDPILOT_TEST_DELAY_MS || 0);
const optimizationDelay = Number(process.env.GRIDPILOT_OPTIMIZATION_DELAY_MS || 0);
const OUT = process.env.GRIDPILOT_BROWSER_OUTPUT || '/tmp/gridpilot-browser-' + delay;
fs.mkdirSync(OUT, { recursive: true });
const origin = process.env.GRIDPILOT_BROWSER_URL || 'http://127.0.0.1:4173/';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local frontend build');
const evidence = { delay_ms: delay, checks: [], requests: [], ai: [], errors: [], started: new Date().toISOString() };
let browser, context, page;
const save = () => fs.writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(evidence, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = n => page.getByRole('button', { name: n, exact: true }).click();
async function field(id, value) { const n = page.locator('#' + id); for (const d of await n.locator('xpath=ancestor::details').all())
    if (!await d.evaluate(x => x.open))
        await d.locator(':scope > summary').click(); if (await n.evaluate(x => x.tagName === 'SELECT'))
    await n.selectOption(String(value));
else
    await n.fill(String(value)); }
async function fresh(type, goal) {
    if (context)
        await context.close();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page = await context.newPage();
    page.setDefaultTimeout(18000);
    await page.route('**/api/ai/**', r => { evidence.ai.push({ url: r.request().url(), at: Date.now() }); return r.fulfill({ status: 503, json: { detail: 'Controlled offline AI failure' } }); });
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('request', r => { if (r.url().includes('/api/')) {
        evidence.requests.push({ url: r.url(), method: r.method(), at: Date.now() });
        save();
    } });
    await page.goto(origin);
    await page.getByRole('link', { name: 'Get started', exact: true }).first().click();
    await page.getByLabel(/Business name/).fill('Fictional Recovery Demo ' + type);
    await page.getByLabel(/Business type/).selectOption(type);
    await page.getByRole('radio', { name: goal === 'savings' ? /Find savings opportunities/ : /Plan daily energy use/ }).check();
}
const count = route => evidence.requests.filter(r => r.method === 'POST' && r.url.includes(route)).length;
async function office() {
    await fresh('Office', 'savings');
    let health = 0, financial = 0, readyAt;
    if (delay) {
        await page.route('**/api/health', async (r) => { health++; if (delay === 45000 && health === 1)
            return r.abort('failed'); const start = Date.now(); await sleep(delay); const response = await r.fetch({ maxRetries: 0, timeout: 10000 }); await r.fulfill({ response }); readyAt = Date.now(); evidence.health_delay_observed_ms = readyAt - start; });
        // At 60s, compute once immediately but delay its response beyond the 45s financial budget.
        await page.route('**/api/savings/recommendations', async (r) => { financial++; const response = await r.fetch({ maxRetries: 0 }); if (delay === 60000 && financial === 1)
            await sleep(60000); await r.fulfill({ response }).catch(() => { }); });
    }
    await page.locator('#setup-form button[type=submit]').click();
    await page.getByRole('heading', { name: 'Add an improvement', exact: true }).waitFor();
    await click('Load synthetic LED example');
    const m = fixtures['A-led-complete'].measures[0];
    for (const [k, v] of Object.entries(m)) {
        if (['category', 'rate'].includes(k))
            continue;
        if (await page.locator('#savings-0-' + k).count())
            await field('savings-0-' + k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
    }
    for (const [k, v] of Object.entries(m.rate))
        await field('savings-0-rate-' + k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
    await page.getByText('Help me find opportunities', { exact: true }).click();
    await page.locator('#savings-question').fill('Which improvements suit this fictional office?');
    const pending = delay === 60000 ? null : page.waitForResponse(r => r.url().endsWith('/api/savings/recommendations') && r.request().method() === 'POST');
    await click('Calculate savings');
    let response;
    if (pending) {
        response = await pending;
        assert.equal(response.status(), 200);
    }
    if (delay) {
        await page.getByText('Waiting for backend to wake up…', { exact: true }).waitFor();
        assert(!((await page.locator('body').innerText()).includes('Backend offline')));
        await page.screenshot({ path: OUT + '/connecting-desktop.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: OUT + '/connecting-mobile.png', fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        if (delay === 60000) {
            await page.getByText(/Stopped waiting for savings results/).waitFor({ timeout: 50000 });
            evidence.financial_timeout_message = await page.locator('.savings-request-status').allInnerTexts();
        }
        await page.getByText('Backend connected', { exact: true }).waitFor({ timeout: 75000 });
        assert(evidence.health_delay_observed_ms >= delay);
        assert.equal(health, delay === 45000 ? 2 : 1);
        assert.equal(count('/api/savings/recommendations'), 1);
        assert.equal(count('/api/optimize'), 0);
        assert.equal(evidence.ai.length, 0);
        assert.equal(await page.locator('#savings-0-fixture_count').inputValue(), '100');
        assert.equal(await page.locator('#savings-question').inputValue(), 'Which improvements suit this fictional office?');
        const saved = await page.evaluate(() => Object.values(localStorage).some(v => v.includes('Fictional Recovery Demo Office') && v.includes('Which improvements suit')));
        assert(saved);
        evidence.checks.push(`${delay / 1000}s health recovery is automatic; business/evidence/question preserved; one financial submission, zero automatic optimization/AI submissions`);
        if (delay === 60000) {
            const retry = page.waitForResponse(r => r.url().endsWith('/api/savings/recommendations') && r.request().method() === 'POST');
            await click('Retry calculation without AI');
            response = await retry;
            assert.equal(response.status(), 200);
            assert.equal(financial, 2);
            evidence.checks.push('Financial response timeout at 45s retains inputs; explicit retry after readiness dispatches once');
        }
    }
    const body = await response.json();
    assert.deepEqual(response.request().postDataJSON().measures[0], m);
    const r = body.recommendations.find(x => x.id === m.id);
    assert.deepEqual([r.annual_kwh_saved, r.annual_net_savings_usd, r.simple_payback_years], [12500, 2500, 1]);
    await page.getByText('Savings estimates ready.', { exact: true }).waitFor();
    const card = page.locator('[data-measure-id="A-led-complete"]');
    assert((await card.innerText()).includes('Synthetic example'));
    assert((await card.locator('[data-financial=net]').innerText()).includes('$2,500.00'));
    evidence.checks.push('Landing → business onboarding → exact LED measure → actual backend values displayed with synthetic provenance');
    await click('Ask AI to select opportunities');
    await page.getByText(/Savings service unavailable \(HTTP 503\)/).waitFor();
    await sleep(4000);
    assert.equal(evidence.ai.length, 1);
    evidence.checks.push('One controlled AI failure gives clear feedback; no automatic paid retry');
    await page.unroute('**/api/ai/**');
    await page.route('**/api/ai/**', route => { evidence.ai.push({ mock: 'explicit deterministic_fallback UI fixture' }); return route.fulfill({ json: { source: 'deterministic_fallback', message: 'Meta unavailable; controlled offline demonstration. Financial values use only structured evidence.', selected_categories: ['led'], facts: [], follow_up_questions: [], savings: body } }); });
    await page.locator('#savings-question').fill('Explain this fictional LED opportunity.');
    await click('Ask AI to select opportunities');
    await page.getByText(/Meta unavailable; controlled offline demonstration/).waitFor();
    assert.equal(evidence.ai.length, 2);
    evidence.checks.push('Explicitly mocked fallback explanation renders with actual deterministic savings; no live inference');
    await page.screenshot({ path: OUT + '/office.png', fullPage: true });
}
function luminance(rgb) { const v = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
async function timeline(name) {
    const s = fixtures[name];
    await fresh(name === 'W01' ? 'Warehouse & logistics' : 'Office', 'planning');
    if (optimizationDelay) {
        await page.route('**/api/health', async route => {
            await sleep(optimizationDelay);
            await route.fulfill({response: await route.fetch({maxRetries: 0})});
        });
        await page.route('**/api/optimize?**', async route => {
            const response = await route.fetch({maxRetries: 0});
            await sleep(optimizationDelay);
            await route.fulfill({response});
        });
    }
    await page.locator('#setup-form button[type=submit]').click();
    await field('setup-analysis-choice', name === 'W01' ? 'flexible' : 'joint');
    const vals = { opening: 8, closing: 18, limit: s.building_max_demand_kw, offPeak: .12, peak: .28, peakStart: 14, peakEnd: 20, chargers: 2, chargerPower: 7.2, evEnergy: 14.4, arrival: 15, deadline: 22 };
    const d = s.flexible_equipment[0];
    Object.assign(vals, { equipmentPower: d.max_power_kw, duration: d.energy_required_kwh / d.max_power_kw, equipmentStart: d.available_hours.start_hour, equipmentEnd: d.available_hours.end_hour });
    for (const [k, v] of Object.entries(vals))
        if (await page.locator('#' + k).count())
            await field(k, v);
    await field('current-fixed-demand-mode', 'custom');
    for (let h = 0; h < 24; h++)
        await field('current-fixed-demand-' + h, s.fixed_demand_kw[h]);
    if (name === 'W01') {
        await click('Other / custom equipment');
        await page.getByLabel('Equipment name', { exact: true }).fill('noncritical-transfer-pump');
        await page.getByLabel(/How should this equipment be represented/).selectOption('schedulable');
        await page.getByLabel('Custom required energy (kWh)', { exact: true }).fill('4');
        await page.getByLabel('Custom maximum power (kW)', { exact: true }).fill('2');
        await page.getByLabel(/Custom available from/).selectOption('10');
        await page.getByLabel(/Custom available until/).selectOption('16');
        await page.getByLabel(/I confirm this equipment can pause/).check();
    }
    await click('Continue to your goals');
    await click('Review workspace');
    const pending = page.waitForResponse(r => r.url().includes('/api/optimize') && r.request().method() === 'POST', {timeout: 90000});
    await click('Create workspace and calculate');
    const res = await pending;
    assert.equal(res.status(), 200);
    const request = res.request().postDataJSON(), body = await res.json();
    if (optimizationDelay) {
        await page.getByText('Backend connected', {exact: true}).waitFor();
        await sleep(1500);
        assert.equal(count('/api/optimize'), 1);
        assert.equal(evidence.ai.length, 0);
        evidence.checks.push('60s in-flight optimization and health recovery complete without duplicate solve or AI request');
    }
    const normalized = structuredClone(request);
    if (name === 'W01')
        normalized.flexible_equipment.forEach((x, i) => x.id = s.flexible_equipment[i].id);
    assert.deepEqual(normalized, s);
    await page.getByText('Backend result received for the submitted scenario.', { exact: true }).waitFor({ state: 'attached' });
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Energy plan', exact: true }).click();
    await page.getByRole('navigation', { name: 'Energy plan views' }).getByRole('button', { name: 'Results and equipment', exact: true }).click();
    const comparison = page.locator('section.comparison');
    await comparison.locator('table tbody tr').nth(23).waitFor({ state: 'attached' });
    const values = await comparison.locator('table tbody tr').evaluateAll(rows => rows.map(row => Array.from(row.querySelectorAll('td')).map(x => Number(x.textContent))));
    for (let h = 0; h < 24; h++)
        assert.deepEqual(values[h], [s.building_max_demand_kw, Number(body.baseline_demand_kw[h].toFixed(2)), Number(body.optimized_demand_kw[h].toFixed(2)), s.fixed_demand_kw[h]]);
    const costs = name === 'W01' ? [19.76, 18.48, 114] : [20.304, 15.696, 106.8];
    assert(Math.abs(body.baseline_electricity_cost_usd - costs[0]) < 2e-7);
    assert(Math.abs(body.optimized_electricity_cost_usd - costs[1]) < 2e-7);
    assert(Math.abs(body.optimized_demand_kw.reduce((a, b) => a + b, 0) - costs[2]) < 1e-6);
    const panel = page.getByRole('region', { name: 'Device operating schedule' });
    await panel.scrollIntoViewIfNeeded();
    const colors = await panel.evaluate(el => { const get = s => getComputedStyle(el.querySelector(s)); return { bg: getComputedStyle(el).backgroundColor, text: get('.device-label h3').color, muted: get('.device-label small').color, proof: get('.plan-proof strong').color, proofBg: get('.plan-proof').backgroundColor, cell: get('.hour-cell.scheduled').backgroundColor, fill: get('.hour-fill').backgroundImage, unavailable: get('.hour-cell.unavailable').backgroundImage, focus: get('.hour-cell').outlineColor }; });
    assert(contrast(colors.text, colors.bg) >= 4.5);
    assert(contrast(colors.muted, colors.bg) >= 4.5);
    assert(contrast(colors.proof, colors.proofBg) >= 4.5);
    assert(colors.fill.includes('gradient'));
    assert(contrast('rgb(38, 141, 128)', colors.cell) >= 3);
    assert(colors.unavailable.includes('gradient'));
    const deviceRows = panel.locator('.device-row');
    assert.equal(await deviceRows.count(), body.operating_plan.device_schedules.length);
    for (let i = 0; i < body.operating_plan.device_schedules.length; i++) {
        const schedule = body.operating_plan.device_schedules[i];
        const row = deviceRows.nth(i);
        const raw = await row.locator('table tbody tr').evaluateAll(rows => rows.map(r => [...r.querySelectorAll('td')].map(x => Number(x.textContent))));
        assert.deepEqual(raw, schedule.baseline_power_kw.map((kw, h) => [kw, schedule.optimized_power_kw[h]]));
        const heights = await row.locator('.hour-fill').evaluateAll(xs => xs.map(x => parseFloat(x.style.height)));
        heights.forEach((value, h) => assert(Math.abs(value - 100 * schedule.optimized_power_kw[h] / schedule.max_power_kw) < 1e-5));
    }
    await page.screenshot({ path: OUT + '/' + name + '-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const button = panel.locator('.hour-cell.scheduled').first();
    await button.focus();
    await page.keyboard.press('Tab');
    const focused = panel.locator('.hour-cell:focus-visible');
    assert.equal(await focused.count(), 1);
    assert((await focused.evaluate(x => getComputedStyle(x).outlineStyle)) !== 'none');
    assert(await button.locator('.mobile-power').isVisible());
    await button.click();
    assert((await panel.locator('.plan-inspector').innerText()).includes('kW'));
    await page.screenshot({ path: OUT + '/' + name + '-mobile.png', fullPage: true });
    evidence[name] = { request, body, colors, contrast: { label: contrast(colors.text, colors.bg), muted: contrast(colors.muted, colors.bg), proof: contrast(colors.proof, colors.proofBg), bar: contrast('rgb(38, 141, 128)', colors.cell) } };
    evidence.checks.push(name + ' UI → actual backend; all 24 demand/device rows and bar heights match; dark timeline contrast, focus and 390px layout pass');
    save();
}
(async () => { try {
    browser = await chromium.launch({ headless: true });
    if (optimizationDelay) {
        await timeline('W01');
    } else {
        await office();
    }
    if (!delay && !optimizationDelay) {
        await timeline('W01');
        await timeline('O01');
    }
    assert.deepEqual(evidence.errors, []);
    evidence.status = 'PASS';
}
catch (e) {
    evidence.status = 'FAIL';
    evidence.failure = String(e);
    if (page) {
        evidence.lastText = await page.locator('body').innerText().catch(() => '');
        await page.screenshot({ path: OUT + '/failure.png', fullPage: true }).catch(() => { });
    }
    process.exitCode = 1;
}
finally {
    evidence.finished = new Date().toISOString();
    save();
    if (browser)
        await browser.close();
    console.log(JSON.stringify({ status: evidence.status, checks: evidence.checks, failure: evidence.failure }));
} })();
