const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Axe = require(process.env.AXE_MODULE || '@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const out = 'artifacts/landing-statistics';
const report = { viewports: [], accessibility: [], errors: [], checks: [] };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', project: 'GridPilot' } }));
  await page.route('**/api/ai/**', route => route.abort());
  try {
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5174', { waitUntil: 'networkidle' });
    await page.locator('.landing-statistics dd').first().waitFor();
    assert.deepEqual(await page.locator('.landing-statistics dd').allTextContents(), ['3.81%', '$4.12', '6.48%']);
    assert.deepEqual(await page.locator('.landing-statistics dt').allTextContents(), ['Avg. Modeled Cost Reduction', 'Avg. Daily Reduction', 'Lower Energy Charges']);
    assert.equal(await page.locator('.landing-steps li').count(), 3);
    assert.equal(await page.locator('main > section').evaluateAll(elements => elements.map(e => e.className).join(',')), 'landing-hero,landing-steps,landing-statistics');
    assert(!await page.locator('main').innerText().then(text => /8,?546/.test(text)));
    const image = await page.locator('.landing-photo img').evaluate(e => ({ width: e.naturalWidth, height: e.naturalHeight }));
    assert.deepEqual(image, { width: 1013, height: 672 });
    const photoHash = crypto.createHash('sha256').update(fs.readFileSync('frontend/src/assets/powerline.png')).digest('hex');
    assert.equal(photoHash, '3ff8f7586dd260586d1d83a36609a981c999d9189b87dc50f599bad0f493e377');
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [768, 1024], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, sections: [...document.querySelectorAll('main > section')].map(e => { const r = e.getBoundingClientRect(); return { name: e.className, y: r.y, height: r.height }; }), photoHeight: document.querySelector('.landing-photo').getBoundingClientRect().height }));
      assert(layout.scrollWidth <= width);
      if (width >= 1366) { assert(layout.scrollHeight <= height); assert(layout.photoHeight >= 350); }
      assert(layout.sections[2].y >= layout.sections[1].y + layout.sections[1].height);
      assert(layout.sections[2].y - layout.sections[1].y - layout.sections[1].height <= 40);
      report.viewports.push({ width, height, ...layout });
      await page.screenshot({ path: `${out}/${width}.png`, fullPage: true });
      if ([1366, 390, 320].includes(width)) {
        const audit = await new Axe({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        report.accessibility.push({ width, violations: audit.violations });
        assert.equal(audit.violations.length, 0);
      }
    }
    const summary = page.locator('.landing-statistics-note summary');
    await summary.focus(); await page.keyboard.press('Enter');
    assert(await page.getByText(/Across 67 eligible/).isVisible());
    assert(await page.getByText(/41 valid controllable/).isVisible());
    assert(await page.getByText(/warehouse example without EVs/).isVisible());
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.landing-statistics-note').getAttribute('open'), null);
    const enlarged = await page.addStyleTag({ content: '.landing-copy h1{font-size:64px}.landing-copy p{font-size:32px}.landing-statistics-row dt{font-size:24px}.landing-statistics-row dd{font-size:48px}' });
    await summary.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await enlarged.evaluate(e => e.remove());
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const index of [0, 1]) {
      await page.getByRole('link', { name: 'Learn more', exact: true }).nth(index).click();
      assert(page.url().endsWith('#learn-more'));
      await page.getByRole('link', { name: 'Back to home', exact: true }).last().click();
      await page.locator('#landing-title').waitFor();
      await page.getByRole('link', { name: 'Get started', exact: true }).nth(index).click();
      assert(page.url().endsWith('#setup'));
      await page.getByLabel('Business name').fill('Statistics QA building');
      const saved = await page.evaluate(() => localStorage.getItem('gridpilot.building-workspace'));
      await page.getByRole('link', { name: 'GridPilot home', exact: true }).click();
      await page.locator('#landing-title').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('gridpilot.building-workspace')), saved);
    }
    report.checks.push('Exact values/labels and order; unchanged image bytes/dimensions; all desktop sizes fit without scrolling; no mobile overflow; keyboard disclosure; enlarged text; both header/hero CTA routes; saved setup draft retained. Health stubbed; AI blocked; no live calculations.');
    assert.equal(report.errors.length, 0);
    report.status = 'passed';
  } finally {
    fs.writeFileSync(`${out}/verification.json`, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
