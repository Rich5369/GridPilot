// Local HTTP + real solver. SDK output is injected by qa_backend.py.
const { chromium } = require('/tmp/gridpilot-browser-tools/node_modules/playwright');
const Axe = require('/tmp/gridpilot-browser-tools/node_modules/@axe-core/playwright').default;
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const out = __dirname;
const report = { provenance: 'Local Vite app + real FastAPI/OR-Tools; injected Meta SDK completions; zero live Meta inference', cases: [], accessibility: [], errors: [], checks: [] };
const usd = n => `$${n.toFixed(2)}`;

async function screenshot(page, file, locator) {
  if (locator) await locator.screenshot({ path: path.join(out, file) });
  else await page.screenshot({ path: path.join(out, file), fullPage: true });
}
function verify(result, scenario) {
  if (result.feasibility_status === 'infeasible') {
    assert.equal(result.optimized_electricity_cost_usd, null);
    assert.equal(result.optimized_peak_demand_kw, null);
    assert.equal(result.optimized_demand_kw, null);
    assert(result.constraint_violations.length);
    return;
  }
  assert.equal(result.operating_plan.verification_status, 'passed');
  const cost = result.optimized_demand_kw.reduce((sum, kw, hour) => sum + kw * scenario.electricity_prices_usd_per_kwh[hour], 0);
  assert(Math.abs(cost - result.optimized_electricity_cost_usd) < 2e-7);
  assert(Math.max(...result.optimized_demand_kw) <= scenario.building_max_demand_kw + 1e-6);
  for (const device of result.operating_plan.device_schedules) {
    assert(Math.abs(device.optimized_power_kw.reduce((a,b) => a+b, 0) - device.required_energy_kwh) < 1e-6);
    device.optimized_power_kw.forEach((kw, hour) => {
      assert(kw >= -1e-6 && kw <= device.max_power_kw + 1e-6);
      if (hour < device.available_hours.start_hour || hour >= device.available_hours.end_hour) assert(kw < 1e-6);
    });
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const initialProvider = await (await page.request.get('http://127.0.0.1:8411/__qa__/provider-calls')).json();
    const providerStart = initialProvider.injected_sdk_calls.length;
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) await route.continue();
      else await route.abort();
    });
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const banner = document.createElement('div');
        banner.textContent = 'LOCAL TEST · Simulated Meta responses · Real optimizer · Fictional building';
        banner.setAttribute('role', 'note');
        banner.setAttribute('aria-label', 'Local test provenance');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#132e46;color:white;text-align:center;padding:9px 8px;font:600 12px/1.4 sans-serif;pointer-events:none';
        document.body.append(banner);
        const style = document.createElement('style');
        style.textContent = '.advisor-comparison::before { content:"LOCAL TEST · Simulated Meta responses · Real optimizer";display:block;background:#132e46;color:#fff;padding:10px;border-radius:5px;font:600 11px/1.5 sans-serif;margin-bottom:16px; }';
        document.head.append(style);
      });
    });
    await page.goto('http://127.0.0.1:5411/#example/configuration');
    await page.getByRole('button', { name: 'Ask Energy Advisor', exact: true }).click();
    await page.locator('#ai-request').waitFor();

    async function propose(text) {
      await page.locator('#ai-request').fill(text);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/conversation' && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Send to advisor', exact: true }).click();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      const body = await response.json();
      assert.equal(body.category, 'scenario_proposal');
      await page.getByRole('button', { name: 'Compare with Meta', exact: true }).waitFor();
      return body;
    }
    async function compare(name) {
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/compare' && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Compare with Meta', exact: true }).click();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      const body = await response.json(), request = response.request().postDataJSON();
      verify(body.current, request.scenario);
      verify(body.alternative, body.proposed_scenario);
      const card = page.getByRole('region', { name: 'Verified scenario comparison', exact: true });
      await card.waitFor();
      assert((await card.innerText()).includes(usd(body.current.optimized_electricity_cost_usd)));
      if (body.alternative.feasibility_status === 'feasible') assert((await card.innerText()).includes(usd(body.alternative.optimized_electricity_cost_usd)));
      else assert((await card.innerText()).includes('Unavailable'));
      report.cases.push({ name, request, response: body });
      return { body, card };
    }

    await propose('Compare my current plan with a 12 kW building power limit.');
    await screenshot(page, '01-review-proposal-desktop.png');
    const feasible = await compare('Feasible lower site cap');
    assert.equal(feasible.body.alternative.feasibility_status, 'feasible');
    await screenshot(page, '02-comparison-desktop.png', feasible.card);
    await feasible.card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, '09-comparison-in-app-desktop.png') });
    await feasible.card.getByText('Hourly schedules and constraint evidence', { exact: true }).click();
    await screenshot(page, '03-device-schedules-desktop.png', feasible.card);
    await feasible.card.getByText('Hourly schedules and constraint evidence', { exact: true }).click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator('.advisor-comparison-table').evaluate(el => el.scrollWidth <= el.clientWidth), 'Comparison columns must fit without clipping');
      const scan = await new Axe({ page }).include('.advisor-comparison').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      report.accessibility.push({ width, violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })) });
      if (width === 390) await screenshot(page, '04-comparison-mobile.png', feasible.card);
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('#ai-request').fill('Why does the tighter limit cost more?');
    const follow = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/conversation' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send to advisor', exact: true }).click();
    const followResponse = await follow;
    assert.equal(followResponse.status(), 200, await followResponse.text());
    const followRequest = followResponse.request().postDataJSON();
    assert.equal(followRequest.result_id, feasible.body.current.result_id);
    assert.equal(followRequest.comparison.alternative_result_id, feasible.body.alternative.result_id);
    report.checks.push('Follow-up references both exact retained results without another solve.');
    await screenshot(page, '05-follow-up-desktop.png');

    await propose('Compare my current plan with a 1 kW building power limit.');
    const infeasible = await compare('Infeasible lower site cap');
    assert.equal(infeasible.body.alternative.feasibility_status, 'infeasible');
    assert.equal(infeasible.body.daily_cost_difference_usd, null);
    await screenshot(page, '06-infeasible-desktop.png', infeasible.card);

    await propose('Compare a 25 percent increase in the peak electricity price.');
    const tariff = await compare('Higher peak tariff');
    assert(tariff.body.warnings.some(w => w.includes('not an operational saving')));
    await screenshot(page, '07-tariff-comparison-desktop.png', tariff.card);

    await propose('Compare my current plan with a 12 kW building power limit.');
    await page.request.post('http://127.0.0.1:8411/__qa__/fail-next-explanation');
    const fallback = await compare('Rejected explanation preserves verified results');
    assert.equal(fallback.body.explanation_source, 'unavailable');
    assert(!(await fallback.card.innerText()).includes('999'));
    await screenshot(page, '08-explanation-unavailable-desktop.png', fallback.card);
    await page.getByRole('button', { name: 'Apply Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Close Energy Advisor', exact: true }).click();
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    assert.equal(await page.locator('#limit').inputValue(), '12');
    report.checks.push('Reviewed change reaches draft only after explicit Apply Changes.');
    const provider = await (await page.request.get('http://127.0.0.1:8411/__qa__/provider-calls')).json();
    provider.injected_sdk_calls = provider.injected_sdk_calls.slice(providerStart);
    assert.equal(provider.provider_network_calls, 0);
    assert.equal(provider.injected_sdk_calls.filter(c => c.stage === 'tool_request').length, 4);
    report.provider = provider;
    report.checks.push('Each comparison dispatches the tool exactly once; real schedules, energy, site caps, prices and costs independently checked.');
    assert.equal(report.errors.length, 0);
    assert.equal(report.accessibility.flatMap(a => a.violations).length, 0);
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ cases: report.cases.map(c => ({ name: c.name, current: c.response.current.optimized_electricity_cost_usd, alternative: c.response.alternative.optimized_electricity_cost_usd, difference: c.response.daily_cost_difference_usd })), checks: report.checks, accessibility: report.accessibility, errors: report.errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
