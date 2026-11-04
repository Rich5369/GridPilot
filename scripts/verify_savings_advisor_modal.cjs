// Local injected AI only; non-AI savings requests use the unchanged local engine.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Axe = require(process.env.AXE_MODULE || '@axe-core/playwright').default;
const fs = require('node:fs');
const assert = require('node:assert/strict');
const fixture = require('../frontend/src/testFixtures/warehouseSavingsConversation.json');
const example = require('../docs/verification/savings-request.json').measures[0];
const out = 'artifacts/savings-advisor-modal';
fs.mkdirSync(out, { recursive: true });
const report = { source: 'Production frontend, injected AI responses, real local Savings Engine', checks: [], errors: [], accessibility: [] };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const source of ['meta', 'deterministic_fallback']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      let ai = 0, calculations = 0;
      await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path === '/api/ai/savings/conversation') {
          ai++;
          const body = request.postDataJSON();
          assert.equal(body.request, ai === 1 ? 'How can my business lower its electricity costs?' : 'What should I measure first?');
          assert.equal(body.history.length, ai === 1 ? 0 : 2);
          assert.equal(body.evidence.measures.length, 0);
          const deterministic = await page.request.post('http://127.0.0.1:8001/api/savings/recommendations', { data: body.evidence });
          assert.equal(deterministic.status(), 200);
          const savings = await deterministic.json();
          await route.fulfill({ json: { ...fixture, source, savings, facts: [], follow_up_questions: ['Confirm lighting wattages and operating hours.'] } });
        } else if (path.startsWith('/api/ai/')) {
          await route.abort();
        } else {
          if (path === '/api/savings/recommendations') calculations++;
          const response = await route.fetch({ url: `http://127.0.0.1:8001${path}` });
          await route.fulfill({ response });
        }
      });
      await page.goto('http://127.0.0.1:5301/#setup');
      await page.getByLabel(/Business name/).fill('Fictional visibility office');
      await page.getByLabel(/Business type/).selectOption('Office');
      await page.getByRole('radio', { name: /Find savings opportunities/ }).check();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const ask = page.getByRole('button', { name: 'Ask Meta Energy Advisor', exact: true });
      await ask.waitFor();
      assert((await ask.boundingBox()).y < 700);
      assert.equal(ai, 0);
      await page.screenshot({ path: `${out}/${source}-desktop.png`, fullPage: true });
      assert.equal(await page.getByText('Help me find opportunities', { exact: true }).count(), 0);
      assert.equal(await page.locator('.savings-intro').getByRole('button', { name: 'Ask Meta Energy Advisor' }).count(), 0);
      await ask.click();
      const dialog = page.getByRole('dialog', { name: 'Meta Energy Advisor', exact: true });
      await dialog.waitFor();
      const question = page.locator('#savings-question');
      assert(await question.isVisible());
      assert(await question.evaluate(e => e === document.activeElement));
      assert.equal(await question.inputValue(), 'How can my business lower its electricity costs?');
      await question.fill('Editable question');
      await question.fill('How can my business lower its electricity costs?');
      assert.equal(ai, 0);
      await page.getByRole('button', { name: 'Submit question', exact: true }).click();
      await page.getByRole('heading', { name: source === 'meta' ? 'Selected by Meta AI' : 'Standard guidance — Meta unavailable', exact: true }).waitFor();
      assert.equal(ai, 1);
      assert.equal(calculations, 0);
      await page.screenshot({ path: `${out}/${source}-selection.png`, fullPage: true });
      const selectedScan = await new Axe({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      report.accessibility.push({ source, view: 'selected opportunities', width: 1440, violations: selectedScan.violations.map(v => v.id) });
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), false);
      assert(await ask.evaluate(e => e === document.activeElement));
      await ask.click();
      assert.equal(await question.inputValue(), 'How can my business lower its electricity costs?');
      await page.getByRole('heading', { name: 'Questions to complete your evidence', exact: true }).waitFor();
      assert.equal(ai, 1);
      await question.fill('What should I measure first?');
      await page.getByRole('button', { name: 'Submit question', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('dialog button[type=submit]').disabled);
      assert.equal(ai, 2);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
        // Tab must remain in the native modal, including reverse wrapping.
        await question.focus();
        for (let tab = 0; tab < 10; tab++) {
          await page.keyboard.press(tab % 2 ? 'Tab' : 'Shift+Tab');
          assert(await dialog.evaluate(e => e.contains(document.activeElement)));
        }
        const scan = await new Axe({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        report.accessibility.push({ source, view: 'modal with response', width, violations: scan.violations.map(v => v.id) });
        await page.screenshot({ path: `${out}/${source}-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const selected = page.locator('[data-measure-id="catalog:led"]');
      assert((await selected.locator('[data-financial=gross]').innerText()).includes('Unknown'));
      await selected.getByRole('button', { name: 'Estimate savings', exact: true }).click();
      assert.equal(await dialog.isVisible(), false);
      const form = page.locator('#savings-project-0');
      assert(await form.evaluate(e => e.open));
      // Fill the selected form with the repository's explicitly fictional LED evidence.
      for (const key of ['load_id', 'evidence_reference', 'fixture_count', 'old_watts', 'new_watts', 'hours_per_day', 'days_per_year']) {
        await page.locator(`#savings-0-${key}`).fill(String(example[key]));
      }
      await page.locator('#savings-0-evidence_kind').selectOption('synthetic');
      await page.locator('#savings-0-equivalent_service_confirmed').selectOption('yes');
      await form.getByText('Customer rate and project costs', { exact: true }).click();
      for (const key of ['installation_cost_usd', 'annual_incremental_cost_usd']) await page.locator(`#savings-0-${key}`).fill(String(example[key]));
      await page.getByLabel('Include a documented customer-specific flat avoidable energy rate').check();
      for (const [key, value] of Object.entries({ ...example.rate, valid_from: '2026-01-01', valid_through: '2027-12-31' })) {
        const field = page.locator(`#savings-0-rate-${key}`);
        if (typeof value === 'boolean') await field.selectOption(value ? 'yes' : 'no');
        else await field.fill(String(value));
      }
      assert.equal(calculations, 0);
      const pending = page.waitForResponse(r => r.url().endsWith('/api/savings/recommendations') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Calculate savings', exact: true }).click();
      const result = await pending;
      assert.equal(result.status(), 200);
      const json = await result.json();
      const returned = json.recommendations.find(r => r.category === 'led' && !r.id.startsWith('catalog:'));
      assert.equal(returned.annual_net_savings_usd, 2500);
      await page.waitForFunction(() => document.querySelector('[data-financial=net]')?.textContent.includes('$2,500.00'));
      assert.equal(calculations, 1);
      assert.equal(ai, 2);
      await ask.click();
      await dialog.getByRole('heading', { name: source === 'meta' ? 'Selected by Meta AI' : 'Standard guidance — Meta unavailable', exact: true }).waitFor();
      assert.equal(await question.inputValue(), 'What should I measure first?');
      assert.equal(ai, 2);
      await page.getByRole('button', { name: 'Close Meta Energy Advisor', exact: true }).click();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await page.getByRole('button', { name: 'Ask Energy Advisor', exact: true }).click();
      await page.getByRole('button', { name: 'Close Energy Advisor', exact: true }).click();
      assert.equal(ai, 2);
      report.checks.push(`${source}: header routes to savings modal, no duplicate action/accordion, no automatic inference, question/response/follow-up retained, explicit follow-up includes history, Escape restores focus, native focus containment, evidence handoff closes modal, real $2,500/year calculation, conversation retained after calculation, daily advisor unchanged, widths 1440/768/390/320`);
      await context.close();
    }
    assert.equal(report.errors.length, 0);
    assert.equal(report.accessibility.flatMap(a => a.violations).length, 0);
  } finally {
    fs.writeFileSync(`${out}/verification.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
