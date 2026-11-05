// Browser acceptance: injected test replies only; all other AI routes are blocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const catalog = require('../frontend/src/testFixtures/savingsCatalog.json');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [], requests = [];
  const out = 'artifacts/full-page-meta-advisor';
  fs.mkdirSync(out, { recursive: true });
  page.on('pageerror', e => errors.push(e.message));
  let ai = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === '/api/health') await route.fulfill({ json: { status: 'ok', project: 'GridPilot' } });
    else if (path === '/api/savings/catalog') await route.fulfill({ json: catalog });
    else if (path === '/api/ai/conversation') {
      ai++;
      const body = route.request().postDataJSON();
      assert(body.scenario);
      await route.fulfill({ json: {
        source: 'mock', category: 'scenario_proposal', status: 'proposed',
        message: 'Injected test proposal: review a 15 kW power limit.',
        changes: { building_max_demand_kw: 15 },
        proposed_scenario: { ...body.scenario, building_max_demand_kw: 15 },
        profile: body.profile, follow_up_questions: ['Which loads can shift?'],
      } });
    } else await route.abort();
  });
  try {
    await page.goto('http://127.0.0.1:5173/#setup');
    await page.getByLabel(/Business name/).fill('Full-page advisor test');
    await page.getByLabel(/Business type/).selectOption('Office');
    await page.getByRole('radio', { name: /Find savings opportunities/ }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const views = { overview: 'Energy overview', savings: 'Savings opportunities', configuration: 'Energy plan', building: 'My building', comparison: 'Optimization', whatif: 'What-if scenarios', markets: 'Electricity markets' };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [view, heading] of Object.entries(views)) {
        await page.evaluate(v => { location.hash = v; }, view);
        await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
        const ask = page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true });
        assert.equal(await ask.count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Ask Energy Advisor', exact: true }).count(), 0);
        await ask.click();
        await page.getByRole('heading', { level: 1, name: 'Energy Advisor', exact: true }).waitFor();
        assert.equal(new URL(page.url()).hash, '#assistant');
        assert.equal(await page.locator('dialog').count(), 0);
        assert.equal(await page.locator('#savings-conversation').count(), 0);
        assert.equal(await page.getByText('Help me find opportunities', { exact: true }).count(), 0);
        assert(await page.getByRole('heading', { name: 'Business context', exact: true }).isVisible());
        assert(await page.getByRole('button', { name: 'Keep peak power demand below 15 kW.', exact: true }).isVisible());
        assert(await page.locator('#ai-request').isVisible());
        await page.locator('#ai-request').fill('Retained question');
        assert.equal(ai, 0);
        await page.getByRole('button', { name: 'Close Energy Advisor', exact: true }).click();
        await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
      }
      await page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true }).click();
      assert.equal(await page.locator('#ai-request').inputValue(), 'Retained question');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/advisor-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Close Energy Advisor', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true }).click();
    await page.getByRole('button', { name: 'Keep peak power demand below 15 kW.', exact: true }).click();
    await page.getByRole('button', { name: 'Send to advisor', exact: true }).click();
    await page.getByText('MOCK MODE — NOT META AI', { exact: true }).waitFor();
    assert(await page.getByRole('log', { name: 'Energy advisor conversation' }).innerText().then(t => t.includes('Injected test proposal')));
    await page.getByText('REVIEW SCENARIO CHANGES', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Apply Changes', exact: true }).isVisible());
    assert(await page.getByRole('button', { name: 'Compare with Meta', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Close Energy Advisor', exact: true }).click();
    await page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true }).click();
    assert(await page.getByText('Injected test proposal: review a 15 kW power limit.', { exact: true }).isVisible());
    assert.equal(ai, 1);
    assert.equal(requests.filter(p => p === '/api/ai/savings/conversation').length, 0);
    assert.equal(errors.length, 0);
    const report = { views: Object.keys(views), widths: [1440, 390], fullPageComponent: 'EnergyAssistant (unchanged)', modalCount: await page.locator('dialog').count(), aiRequests: ai, inference: 'injected mock test reply; no genuine Meta inference', preserved: ['business context', 'suggested questions', 'composer', 'conversation history', 'scenario review', 'Apply Changes', 'Compare with Meta', 'return navigation'], errors };
    fs.writeFileSync(`${out}/verification.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
