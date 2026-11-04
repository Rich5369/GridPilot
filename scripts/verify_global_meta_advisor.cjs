// Injected AI response only. No live Meta requests are sent.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = require('../frontend/src/testFixtures/warehouseSavingsConversation.json');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let ai = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/ai/savings/conversation') {
      ai++;
      const body = route.request().postDataJSON();
      const response = await page.request.post('http://127.0.0.1:8000/api/savings/recommendations', { data: body.evidence });
      assert.equal(response.status(), 200);
      await route.fulfill({ json: { ...fixture, savings: await response.json(), source: 'meta' } });
    } else if (path.startsWith('/api/ai/')) await route.abort();
    else await route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:8000${path}` }) });
  });
  try {
    await page.goto('http://127.0.0.1:5173/#setup');
    await page.getByLabel(/Business name/).fill('Global advisor test');
    await page.getByLabel(/Business type/).selectOption('Office');
    await page.getByRole('radio', { name: /Find savings opportunities/ }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const views = { overview: 'Energy overview', configuration: 'Energy plan', savings: 'Savings opportunities', building: 'My building', comparison: 'Optimization', whatif: 'What-if scenarios', assistant: 'Energy Advisor', markets: 'Electricity markets' };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [view, heading] of Object.entries(views)) {
        await page.evaluate(v => { location.hash = v; }, view);
        await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
        const ask = page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true });
        await ask.click();
        const dialog = page.getByRole('dialog', { name: 'Meta Energy Advisor', exact: true });
        await dialog.waitFor();
        assert(await dialog.evaluate(e => e.parentElement === document.body));
        await dialog.locator('textarea').fill('Shared question across pages');
        assert.equal(ai, 0);
        assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), false);
        assert(await ask.evaluate(e => e === document.activeElement), JSON.stringify({view, width, active: await page.evaluate(() => document.activeElement?.outerHTML)}));
      }
    }
    await page.evaluate(() => { location.hash = 'building'; });
    await page.getByRole('heading', { level: 1, name: 'My building', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true }).click();
    assert.equal(await page.locator('#savings-question').inputValue(), 'Shared question across pages');
    await page.getByRole('button', { name: 'Submit question', exact: true }).click();
    await page.getByRole('heading', { name: 'Selected by Meta AI', exact: true }).waitFor();
    await page.locator('[data-measure-id="catalog:led"]').getByRole('button', { name: 'Estimate savings', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: 'Savings opportunities', exact: true }).waitFor();
    assert(await page.locator('#savings-project-0').isVisible());
    assert(await page.locator('#savings-project-0').evaluate(e => e.open));
    assert.equal(ai, 1);
    assert.equal(errors.length, 0);
    console.log(JSON.stringify({ views: Object.keys(views), widths: [1440, 390], aiRequests: ai, inference: 'injected test response; no live Meta inference', handoff: 'My building → Savings evidence form', errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
