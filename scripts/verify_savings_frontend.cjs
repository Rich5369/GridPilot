// Successful calculations use the unchanged real local Savings Engine.
// ALL AI replies are injected UI fixtures: no upstream Meta requests are sent.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const AxeBuilder = require(
  process.env.AXE_MODULE || "@axe-core/playwright",
).default;
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const warehouseRequest = require("../docs/verification/meta-savings-acceptance-request.json");
const warehouseFixture = require("../frontend/src/testFixtures/warehouseSavingsConversation.json");
const output = "artifacts/savings-frontend",
  url = process.env.GRIDPILOT_FRONTEND_URL || "http://127.0.0.1:5300";
fs.mkdirSync(output, { recursive: true });
const report = {
  frontendRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  backendTree: execFileSync("git", ["rev-parse", "HEAD:backend"], {
    encoding: "utf8",
  }).trim(),
  implementation:
    "Local frontend source at frontendRevision; backend tree recorded separately. No hosted or live Meta acceptance.",
  requests: [],
  injected: [],
  checks: [],
  accessibility: [],
  screenshots: [],
  errors: [],
};
let browser, context, page;
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function field(id, value) {
  const node = page.locator("#" + id);
  for (const details of await node.locator("xpath=ancestor::details").all()) {
    if (!(await details.evaluate((e) => e.open)))
      await details.locator(":scope > summary").click();
  }
  if (await node.evaluate((n) => n.tagName === "SELECT"))
    await node.selectOption(String(value));
  else await node.fill(String(value));
}
async function shot(name) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
    {},
    { timeout: 5000 },
  );
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  report.screenshots.push(name + ".png");
}
async function audit(name, selector) {
  const r = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.accessibility.push({
    name,
    violations: r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
}
async function fresh(mobile = false) {
  if (context) await context.close();
  context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.route("**/api/ai/**", (route) => {
    report.errors.push("Unexpected unmocked AI request blocked");
    return route.abort();
  });
  await page.goto(url);
}
async function building(name, type = "Office", analysis = "building") {
  await page.getByLabel(/Business name/).fill(name);
  await page.getByLabel(/Business type/).selectOption(type);
  await field("setup-analysis-choice", analysis);
  await click("Continue to energy profile");
  await click("Continue to your goals");
  await click("Review workspace");
  const initial = page.waitForResponse(
    (r) =>
      r.url().includes("/api/optimize?") && r.request().method() === "POST",
  );
  await click("Create workspace and calculate");
  const res = await initial;
  assert.equal(res.status(), 200);
  const s = res.request().postDataJSON();
  if (analysis === "building") assert.deepEqual(s.ev_requirements, []);
  report.requests.push({
    name: "existing-daily-" + analysis,
    endpoint: res.url(),
    request: s,
    response: await res.json(),
  });
  await nav("Savings opportunities");
  await page
    .getByRole("heading", { name: "Project inputs", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).hash, "#savings");
  assert.equal(
    await page
      .getByRole("button", { name: "Run optimization", exact: true })
      .count(),
    0,
  );
}
const card = (id) => page.locator(`[data-measure-id="${id}"]`);
async function calculate(name, button = "Calculate savings without AI") {
  const pending = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/savings/recommendations") &&
      r.request().method() === "POST",
  );
  await click(button);
  const res = await pending;
  assert.equal(res.status(), 200);
  const req = res.request().postDataJSON(),
    response = await res.json();
  assert.equal(response.version, "1");
  assert.equal(response.portfolio_savings_usd, null);
  assert(!("scenario" in req));
  assert(!("category_applicability" in req));
  report.requests.push({ name, endpoint: res.url(), request: req, response });
  await page
    .getByText("Savings response received for the submitted evidence.", {
      exact: true,
    })
    .waitFor();
  return { request: req, response };
}
async function showFinancial(i = 0) {
  const d = page.locator(`#savings-project-${i} .savings-financial`);
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
}
async function addMeasure(m, i) {
  await field("savings-new-category", m.category);
  await click("Add project");
  for (const k of ["id", "load_id", "evidence_kind", "evidence_reference"])
    await field(`savings-${i}-${k}`, m[k]);
  for (const [k, v] of Object.entries(m)) {
    if (
      [
        "fixture_count",
        "old_watts",
        "new_watts",
        "hours_per_day",
        "days_per_year",
        "connected_load_kw",
        "existing_hours_per_day",
        "avoidable_hours_per_day",
        "device_count",
        "active_watts",
        "low_power_watts",
        "before_annual_kwh",
        "after_annual_kwh",
      ].includes(k)
    )
      await field(`savings-${i}-${k}`, v);
    if (
      [
        "equivalent_service_confirmed",
        "safe_to_switch_off",
        "essential_service",
        "applicable",
      ].includes(k)
    )
      await field(`savings-${i}-${k}`, v ? "yes" : "no");
  }
}
async function fixtureBanner() {
  await page.evaluate(() => {
    document.getElementById("qa-fixture-banner")?.remove();
    const b = document.createElement("div");
    b.id = "qa-fixture-banner";
    b.textContent =
      "CONTROLLED FRONTEND QA · injected AI selection, not live Meta";
    Object.assign(b.style, {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      zIndex: "9999",
      background: "#423418",
      color: "#ffe3ac",
      fontSize: "11px",
      padding: "7px",
      textAlign: "center",
      pointerEvents: "none",
    });
    document.body.append(b);
  });
}
(async () => {
  try {
    browser = await chromium.launch({ headless: true });
    await fresh(true);
    await building("Fictional Office");
    // No AI POST occurs just by entering the new view. The source is caller context only.
    await page.locator(".savings-context > summary").click();
    await field("savings-profile-employee_count", "50");
    await field(
      "savings-profile-electricity_cost_and_period",
      "USD 2400 per month",
    );
    await field("savings-location-state", "California");
    await page.locator(".savings-context > summary").click();
    await click("Load synthetic LED example");
    assert.equal(await page.locator("#savings-0-numbers").count(), 0);
    await shot("office-evidence-mobile");
    const a = await calculate("office-complete");
    const led = a.response.recommendations.find(
      (r) => r.id === "office-led-scenario",
    );
    near(led.annual_kwh_saved, 12500);
    near(led.annual_energy_charge_savings_usd, 2500);
    near(led.annual_net_savings_usd, 2500);
    near(led.simple_payback_years, 1);
    assert.equal(a.request.profile.employee_count, 50);
    assert.equal(a.request.measures[0].hours_per_day, 10);
    assert.equal(a.request.measures[0].rate.usd_per_kwh, 0.2);
    assert(
      (await card(led.id).locator("[data-financial=net]").innerText()).includes(
        "$2,500.00",
      ),
    );
    assert((await card(led.id).innerText()).includes("Synthetic example"));
    assert.equal(
      await page.locator(".savings-card").filter({ visible: true }).count(),
      1,
    );
    await shot("office-result-mobile");
    await audit("mobile savings evidence and cards", ".savings-workspace");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot("office-result-desktop");
    await audit("desktop savings view", ".savings-workspace");
    // PR #53 additive recurring benefit: actual engine result, never client arithmetic.
    await field("savings-0-annual_operating_cost_savings_usd", "300");
    await click("Calculate savings without AI");
    await page
      .locator("#savings-0-operating_cost_savings_reference[aria-invalid=true]")
      .waitFor();
    await field(
      "savings-0-operating_cost_savings_reference",
      "Fictional maintenance estimate: $400/year before, $100/year after; excludes energy and incentives",
    );
    await field("savings-0-annual_incremental_cost_usd", "100");
    await field("savings-0-installation_cost_usd", "2700");
    const recurring = await calculate("office-recurring-non-energy-benefit");
    const rb = recurring.response.recommendations.find((r) => r.id === led.id);
    near(rb.annual_kwh_saved, 12500);
    near(rb.annual_energy_charge_savings_usd, 2500);
    near(rb.annual_operating_cost_savings_usd, 300);
    near(rb.annual_net_savings_usd, 2700);
    near(rb.simple_payback_years, 1);
    near(rb.annual_simple_roi_percent, 100);
    assert(
      (
        await card(led.id).locator("[data-financial=operating]").innerText()
      ).includes("$300.00"),
    );
    await shot("recurring-benefit-desktop");
    report.checks.push(
      "PR #53 real recurring-benefit example: missing source blocked, 12,500 kWh, $2,500 energy + $300 documented non-energy benefit less $100 expense, backend net $2,700 and 1-year payback/100% ROI",
    );
    await field("savings-0-annual_operating_cost_savings_usd", "");
    await field("savings-0-operating_cost_savings_reference", "");
    await field("savings-0-annual_incremental_cost_usd", "0");
    await field("savings-0-installation_cost_usd", "2500");
    // Missing rate: explicit omission, even with an EIA benchmark and known monthly spend.
    await showFinancial();
    await page.locator("#savings-project-0 .savings-check input").uncheck();
    await page
      .getByText("Savings evidence changed.", { exact: false })
      .first()
      .waitFor();
    const noRate = await calculate("office-no-rate");
    const unknown = noRate.response.recommendations.find(
      (r) => r.id === led.id,
    );
    near(unknown.annual_kwh_saved, 12500);
    assert.equal(unknown.annual_energy_charge_savings_usd, null);
    assert.equal(unknown.simple_payback_years, null);
    assert.equal(noRate.request.measures[0].rate, null);
    assert(
      (
        await card(led.id).locator("[data-financial=gross]").innerText()
      ).includes("Unknown"),
    );
    await shot("unknown-rate-desktop");
    // Missing annual cost independently from missing installation cost.
    await showFinancial();
    await page.locator("#savings-project-0 .savings-check input").check();
    await field("savings-0-annual_incremental_cost_usd", "");
    const annualUnknown = await calculate("office-no-annual-cost");
    const au = annualUnknown.response.recommendations.find(
      (r) => r.id === led.id,
    );
    near(au.annual_energy_charge_savings_usd, 2500);
    assert.equal(au.annual_net_savings_usd, null);
    assert.equal(au.simple_payback_years, null);
    assert.equal(
      annualUnknown.request.measures[0].annual_incremental_cost_usd,
      null,
    );
    await field("savings-0-annual_incremental_cost_usd", "0");
    await field("savings-0-installation_cost_usd", "");
    const upfrontUnknown = await calculate("office-no-upfront");
    const up = upfrontUnknown.response.recommendations.find(
      (r) => r.id === led.id,
    );
    near(up.annual_net_savings_usd, 2500);
    assert.equal(up.simple_payback_years, null);
    assert.equal(up.annual_simple_roi_percent, null);
    // Negative net and valid zero return the backend fields; no reconstruction or portfolio total.
    await field("savings-0-installation_cost_usd", "2500");
    await field("savings-0-annual_incremental_cost_usd", "3000");
    const negative = await calculate("office-negative-net");
    near(
      negative.response.recommendations.find((r) => r.id === led.id)
        .annual_net_savings_usd,
      -500,
    );
    assert(
      (await card(led.id).locator("[data-financial=net]").innerText()).includes(
        "-$500.00",
      ),
    );
    await field("savings-0-annual_incremental_cost_usd", "2500");
    const zero = await calculate("office-zero-net");
    near(
      zero.response.recommendations.find((r) => r.id === led.id)
        .annual_net_savings_usd,
      0,
    );
    assert(
      (await card(led.id).locator("[data-financial=net]").innerText()).includes(
        "$0.00",
      ),
    );
    await field("savings-0-fixture_count", "1.5");
    const before = report.requests.length;
    await click("Calculate savings without AI");
    await page.locator("#savings-0-fixture_count[aria-invalid=true]").waitFor();
    assert.equal(report.requests.length, before);
    await field("savings-0-fixture_count", "100");
    report.checks.push(
      "complete synthetic office LED journey: real 12,500 kWh/year, $2,500 gross/net, 1-year payback; independent missing rate/annual cost/upfront states; negative and zero results; invalid count blocked; EIA/monthly context never substituted",
    );
    // Controlled EIA unavailable presentation, retaining real equipment calculations.
    await page.route("**/api/savings/recommendations", async (route) => {
      const real = await route.fetch(),
        body = await real.json();
      const shown = {
        ...body,
        benchmark: null,
        warnings: [
          ...body.warnings,
          "CONTROLLED QA: EIA benchmark unavailable; equipment calculations remain valid.",
        ],
      };
      report.injected.push({
        name: "EIA-unavailable UI fixture",
        request: route.request().postDataJSON(),
        realResponse: body,
        displayedResponse: shown,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shown),
      });
    });
    await click("Calculate savings without AI");
    await page
      .getByText(
        "CONTROLLED QA: EIA benchmark unavailable; equipment calculations remain valid.",
        { exact: true },
      )
      .waitFor();
    assert(
      (
        await card(led.id).locator("[data-financial=energy]").innerText()
      ).includes("12,500.00"),
    );
    await page.unroute("**/api/savings/recommendations");
    // Actual HTTP 422 contract evidence, then an injected UI failure path (the client
    // normally prevents this invalid type from being submitted).
    const invalidBody = structuredClone(a.request);
    invalidBody.measures[0].fixture_count = "100";
    const invalidRes = await page.request.post(
      "http://127.0.0.1:8020/api/savings/recommendations",
      { data: invalidBody },
    );
    assert.equal(invalidRes.status(), 422);
    const invalid = await invalidRes.json();
    report.injected.push({
      name: "422 UI delivery of actual backend validation response",
      invalidRequest: invalidBody,
      response: invalid,
    });
    await page.route("**/api/savings/recommendations", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify(invalid),
      }),
    );
    await click("Calculate savings without AI");
    await page
      .getByText("The backend rejected these inputs (HTTP 422).", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      await page.locator("#savings-0-fixture_count").inputValue(),
      "100",
    );
    await page.unroute("**/api/savings/recommendations");
    await calculate(
      "office-explicit-422-retry",
      "Retry calculation without AI",
    );
    // Hold a real response to inspect pending edits; accepted data must stay tied to
    // its submitted evidence, then the next explicit calculation uses the correction.
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route("**/api/savings/recommendations", async (route) => {
      const real = await route.fetch();
      await gate;
      await route.fulfill({ response: real });
    });
    await click("Calculate savings without AI");
    await page
      .getByText("Calculating your submitted project evidence…", {
        exact: false,
      })
      .waitFor();
    await field("savings-0-fixture_count", "99");
    release();
    await page
      .getByText("Savings response received for the submitted evidence.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByText("Savings evidence changed.", { exact: false })
      .first()
      .waitFor();
    assert.equal(
      await page.locator("#savings-0-fixture_count").inputValue(),
      "99",
    );
    await page.unroute("**/api/savings/recommendations");
    const correction = await calculate("office-explicit-correction");
    near(
      correction.response.recommendations.find((r) => r.id === led.id)
        .annual_kwh_saved,
      12375,
    );
    let releaseCancel;
    const cancelGate = new Promise((r) => (releaseCancel = r));
    await page.route("**/api/savings/recommendations", async (route) => {
      const real = await route.fetch();
      await cancelGate;
      try {
        await route.fulfill({ response: real });
      } catch {
        /* Expected client cancellation. */
      }
    });
    await click("Calculate savings without AI");
    await click("Cancel savings request");
    await page.getByText("Stopped waiting.", { exact: false }).waitFor();
    releaseCancel();
    await page.unroute("**/api/savings/recommendations");
    assert.equal(
      await page.locator("#savings-0-fixture_count").inputValue(),
      "99",
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "Project inputs", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#savings-0-fixture_count").inputValue(),
      "99",
    );
    assert.equal(
      await page.locator("#savings-0-annual_incremental_cost_usd").inputValue(),
      "2500",
    );
    await page
      .getByText("No annual savings have been calculated yet.", {
        exact: false,
      })
      .waitFor();
    report.checks.push(
      "schema field errors and explicit retry preserve evidence; pending edits remain stale, corrected request uses new evidence; cancellation/reload retains inputs without results or automatic calculations",
    );
    // Warehouse: type the provided acceptance evidence through the real forms.
    await fresh();
    await building("Fictional Warehouse", "Warehouse & logistics");
    await page.locator(".savings-context > summary").click();
    for (const [k, v] of Object.entries(warehouseRequest.evidence.profile))
      await field("savings-profile-" + k, v);
    await page.locator(".savings-context > summary").click();
    await page.locator(".savings-applicability > summary").click();
    for (const [k, v] of Object.entries(
      warehouseRequest.category_applicability,
    ))
      await field("savings-applicability-" + k, v ? "yes" : "no");
    await page.locator(".savings-applicability > summary").click();
    for (let i = 0; i < warehouseRequest.evidence.measures.length; i++)
      await addMeasure(warehouseRequest.evidence.measures[i], i);
    const w = await calculate("warehouse-partial");
    const main = w.response.recommendations.find(
        (r) => r.id === "main-lighting",
      ),
      pilot = w.response.recommendations.find((r) => r.id === "pilot-lighting");
    assert.equal(main.annual_kwh_saved, null);
    near(pilot.annual_kwh_saved, 2000);
    assert.equal(pilot.annual_net_savings_usd, null);
    assert.equal(w.request.measures[0].hours_per_day, null);
    assert.equal(w.request.measures[0].old_watts, null);
    assert.equal(w.request.measures[1].rate, null);
    assert.equal(w.request.profile.business_type, "small warehouse");
    assert.equal(
      await page
        .locator(".savings-results > .savings-card-grid .savings-card")
        .count(),
      2,
    );
    // Injected Meta selection: same real contract/engine output generated offline.
    await page.route("**/api/ai/savings/conversation", async (route) => {
      const req = route.request().postDataJSON();
      assert.deepEqual(
        req.category_applicability,
        warehouseRequest.category_applicability,
      );
      assert(!("scenario" in req));
      assert(!("result_id" in req));
      report.injected.push({
        name: "warehouse injected Meta selection (not live)",
        request: req,
        response: warehouseFixture,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(warehouseFixture),
      });
    });
    await field("savings-question", warehouseRequest.request);
    await click("Ask AI to select opportunities");
    await page
      .getByRole("heading", {
        name: "AI-assisted category selection",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .locator(".savings-results > .savings-card-grid .savings-card")
        .count(),
      2,
    );
    assert(
      (
        await card("pilot-lighting")
          .locator("[data-financial=energy]")
          .innerText()
      ).includes("2,000.00"),
    );
    assert(
      (
        await card("main-lighting")
          .locator("[data-financial=gross]")
          .innerText()
      ).includes("Unknown"),
    );
    assert.equal(
      await page
        .locator('.savings-excluded [data-measure-id="catalog:scheduling"]')
        .count(),
      1,
    );
    assert(
      (
        await page
          .locator('[aria-label="Savings follow-up questions"]')
          .innerText()
      ).includes("main-lighting"),
    );
    await fixtureBanner();
    await shot("warehouse-meta-fixture-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("warehouse-meta-fixture-mobile");
    await audit("warehouse mobile projects/questions", ".savings-workspace");
    await page.unroute("**/api/ai/savings/conversation");
    const fallback = {
      ...warehouseFixture,
      source: "deterministic_fallback",
      message:
        "Meta unavailable; using deterministic guidance. CONTROLLED FRONTEND FIXTURE.",
      selected_categories: ["led"],
      facts: warehouseFixture.facts.filter(
        (f) => f.includes("main-lighting") || f.includes("pilot-lighting"),
      ),
      follow_up_questions: warehouseFixture.follow_up_questions.filter(
        (q) => q.includes("main-lighting") || q.includes("pilot-lighting"),
      ),
    };
    await page.route("**/api/ai/savings/conversation", async (route) => {
      report.injected.push({
        name: "deterministic fallback UI fixture",
        request: route.request().postDataJSON(),
        response: fallback,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fallback),
      });
    });
    await click("Ask AI to select opportunities");
    await page
      .getByRole("heading", {
        name: "AI selection unavailable · deterministic fallback",
        exact: true,
      })
      .waitFor();
    assert(
      (
        await card("pilot-lighting")
          .locator("[data-financial=energy]")
          .innerText()
      ).includes("2,000.00"),
    );
    await shot("warehouse-fallback-mobile");
    await page.unroute("**/api/ai/savings/conversation");
    report.checks.push(
      "warehouse profile and explicit exclusions, two distinct LED measures, unknown main runtime/watts, pilot 2,000 kWh/year and null money; injected Meta selection and deterministic fallback clearly labeled, missing questions and exclusions remain separate from investments",
    );
    // Overlap warning: separate IDs must not create an invented combined total.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#savings-project-0 > summary").click();
    await field("savings-0-load_id", "shared-fixtures");
    await page.locator("#savings-project-1 > summary").click();
    await field("savings-1-load_id", "shared-fixtures");
    const overlap = await calculate("warehouse-overlap");
    assert(
      overlap.response.warnings.some((w) =>
        w.includes("Potential overlapping baseline"),
      ),
    );
    assert.equal(overlap.response.portfolio_savings_usd, null);
    await shot("overlap-desktop");
    // Another non-EV business DOES have flexible equipment. Analysis mode is not
    // converted into category exclusions; explicit Yes goes only to conversation.
    await fresh();
    await building(
      "Fictional Non-EV Flex",
      "Warehouse & logistics",
      "flexible",
    );
    await page.locator(".savings-applicability > summary").click();
    assert.equal(
      await page.locator("#savings-applicability-scheduling").inputValue(),
      "",
    );
    await field("savings-applicability-scheduling", "yes");
    await page.locator(".savings-applicability > summary").click();
    const flexible = await calculate("non-ev-flex-general");
    const selection = {
      source: "meta",
      message:
        "CONTROLLED FRONTEND FIXTURE: investigate confirmed flexible loads using the existing validated scenario workflow.",
      selected_categories: ["scheduling"],
      facts: [],
      follow_up_questions: [
        "Provide a validated Scenario and hourly customer tariff before scheduling.",
      ],
      savings: flexible.response,
    };
    await page.route("**/api/ai/savings/conversation", async (route) => {
      const req = route.request().postDataJSON();
      assert.deepEqual(req.category_applicability, { scheduling: true });
      report.injected.push({
        name: "non-EV flexible scheduling selection UI fixture",
        request: req,
        response: selection,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(selection),
      });
    });
    await field(
      "savings-question",
      "We have interruptible flexible loads and no EVs. What should we investigate?",
    );
    await click("Ask AI to select opportunities");
    await page
      .getByRole("heading", {
        name: "AI-assisted category selection",
        exact: true,
      })
      .waitFor();
    await page
      .locator('[data-measure-id="catalog:scheduling"]')
      .getByRole("button", {
        name: "Provide evidence for this opportunity",
        exact: true,
      })
      .click();
    assert.equal(new URL(page.url()).hash, "#configuration");
    assert.equal(
      await page.locator("#analysis-choice").inputValue(),
      "flexible",
    );
    await page.getByRole("link", { name: "Skip to main content" }).focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "workspace-main",
    );
    await nav("Energy overview");
    await page
      .getByRole("region", { name: "Device operating schedule", exact: true })
      .waitFor();
    await nav("What-if scenarios");
    await click("Create alternative from current");
    await field("alternative-limit", "20");
    await click("Compare both scenarios");
    await page
      .getByRole("heading", {
        name: "Between scenarios: alternative minus current",
        exact: true,
      })
      .waitFor();
    await click("Apply alternative to current");
    await page
      .getByText("Outdated comparison results are hidden", { exact: false })
      .waitFor();
    await click("Restore starting scenario");
    report.checks.push(
      "non-EV flexible business keeps scheduling unknown until explicit Yes; injected selection links to existing optimizer without changing mode/inputs; daily device plans, keyboard navigation and real What-if comparison/Apply/Restore remain usable",
    );
    // Real typed requests from the remaining supported numerical forms; no rate
    // or runtime is inferred, and all safety/service confirmations are explicit.
    await nav("Savings opportunities");
    const typed = [
      {
        id: "controls",
        category: "lighting_controls",
        load_id: "controls-load",
        evidence_kind: "synthetic",
        evidence_reference: "Fictional typed controls comparison",
        connected_load_kw: 3,
        existing_hours_per_day: 12,
        avoidable_hours_per_day: 2,
        days_per_year: 250,
        safe_to_switch_off: true,
        essential_service: false,
      },
      {
        id: "shutdown",
        category: "shutdown",
        load_id: "shutdown-load",
        evidence_kind: "synthetic",
        evidence_reference: "Fictional nonessential shutdown evidence",
        connected_load_kw: 2,
        existing_hours_per_day: 24,
        avoidable_hours_per_day: 8,
        days_per_year: 250,
        safe_to_switch_off: true,
        essential_service: false,
      },
      {
        id: "office-power",
        category: "office",
        load_id: "office-devices",
        evidence_kind: "synthetic",
        evidence_reference: "Fictional office equipment evidence",
        device_count: 10,
        active_watts: 100,
        low_power_watts: 10,
        existing_hours_per_day: 12,
        avoidable_hours_per_day: 4,
        days_per_year: 250,
        safe_to_switch_off: true,
        essential_service: false,
      },
      {
        id: "motor",
        category: "motor",
        load_id: "motor-load",
        evidence_kind: "synthetic",
        evidence_reference: "Fictional equivalent-service comparison",
        before_annual_kwh: 10000,
        after_annual_kwh: 8000,
        equivalent_service_confirmed: true,
      },
      {
        id: "refrigeration",
        category: "refrigeration",
        load_id: "cold-room",
        evidence_kind: "synthetic",
        evidence_reference: "Fictional comparable refrigeration measurements",
        before_annual_kwh: 5000,
        after_annual_kwh: 4500,
        equivalent_service_confirmed: true,
      },
    ];
    for (let i = 0; i < typed.length; i++) await addMeasure(typed[i], i);
    const all = await calculate("five-other-calculation-forms");
    assert.equal(all.request.measures.length, 5);
    assert(
      all.response.recommendations
        .filter((r) => typed.some((m) => m.id === r.id))
        .every(
          (r) =>
            r.annual_kwh_saved !== null && r.annual_net_savings_usd === null,
        ),
    );
    report.checks.push(
      "all six supported numerical category forms submit typed actual evidence to the real endpoint; safety/equivalent-service confirmations are explicit and financial unknowns stay null",
    );
    assert.equal(report.errors.length, 0);
    assert(
      report.accessibility.every((a) => a.violations.length === 0),
      "Accessibility violations; inspect report",
    );
    report.pass = true;
  } catch (e) {
    report.pass = false;
    report.failure = e.stack;
    if (page) {
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
      fs.writeFileSync(
        `${output}/failure-ui.txt`,
        await page.locator("body").innerText(),
      );
    }
    throw e;
  } finally {
    fs.writeFileSync(
      `${output}/verification.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    if (browser) await browser.close();
    console.log(
      JSON.stringify(
        {
          pass: report.pass,
          checks: report.checks,
          failure: report.failure,
          errors: report.errors,
        },
        null,
        2,
      ),
    );
  }
})();
