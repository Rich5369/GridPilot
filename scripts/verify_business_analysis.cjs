// Local production React + unchanged real optimizer. Only service/AI failure paths
// use fixtures. Initial response delay retains the actual backend response.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const AxeBuilder = require(
  process.env.AXE_MODULE || "@axe-core/playwright",
).default;
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  os = require("node:os"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const url = process.env.GRIDPILOT_FRONTEND_URL || "http://127.0.0.1:5298";
const output = "artifacts/business-analysis";
fs.mkdirSync(output, { recursive: true });
const report = {
  baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  backendTree: execFileSync("git", ["rev-parse", "HEAD:backend"], {
    encoding: "utf8",
  }).trim(),
  implementation:
    "Frontend source committed at baseRevision; QA/report files may be uncommitted. Local production build, not hosted acceptance.",
  requests: [],
  checks: [],
  fixtures: [],
  screenshots: [],
  accessibility: [],
  errors: [],
};
let browser, context, page;
const sum = (a) => a.reduce((s, n) => s + n, 0),
  near = (a, b, t = 1e-6) => assert(Math.abs(a - b) <= t, `${a} != ${b}`);
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function change(id, value) {
  const el = page.locator("#" + id);
  if (await el.evaluate((e) => e.tagName === "SELECT"))
    await el.selectOption(String(value));
  else await el.fill(String(value));
}
async function shot(name) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    scrollTo({ top: 0, behavior: "instant" });
  });
  // ResizeObserver updates the actual chart dimensions on the next frame.
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
    {},
    { timeout: 5000 },
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `overflow ${name}`,
  );
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  report.screenshots.push(`${name}.png`);
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
function check(s, r) {
  for (const k of ["baseline", "optimized"]) {
    const d = r[k + "_demand_kw"];
    if (!d) {
      assert.equal(r.feasibility_status, "infeasible");
      continue;
    }
    assert.equal(d.length, 24);
    near(
      sum(d.map((v, h) => v * s.electricity_prices_usd_per_kwh[h])),
      r[k + "_electricity_cost_usd"],
      2e-7,
    );
    near(Math.max(...d), r[k + "_peak_demand_kw"]);
  }
  const p = r.operating_plan;
  assert(p);
  if (r.feasibility_status === "infeasible") {
    assert(r.constraint_violations.length);
    assert(r.infeasibility_evidence.length);
    assert.equal(r.optimized_demand_kw, null);
    assert.equal(r.optimized_electricity_cost_usd, null);
    assert.equal(r.optimized_peak_demand_kw, null);
    assert(p.device_schedules.every((d) => d.optimized_power_kw === null));
    return;
  }
  assert.equal(p.verification_status, "passed");
  for (const d of p.device_schedules) {
    assert.equal(d.optimized_power_kw.length, 24);
    near(sum(d.optimized_power_kw), d.required_energy_kwh);
    for (let h = 0; h < 24; h++) {
      const v = d.optimized_power_kw[h];
      assert(v >= -1e-6 && v <= d.max_power_kw + 1e-6);
      if (h < d.available_hours.start_hour || h >= d.available_hours.end_hour)
        near(v, 0);
    }
    if (d.scheduling_role === "held_at_baseline")
      assert.deepEqual(d.optimized_power_kw, d.baseline_power_kw);
  }
  for (let h = 0; h < 24; h++) {
    near(
      s.fixed_demand_kw[h] +
        sum(p.device_schedules.map((d) => d.optimized_power_kw[h])),
      r.optimized_demand_kw[h],
    );
    assert(r.optimized_demand_kw[h] <= s.building_max_demand_kw + 1e-6);
  }
}
function watch() {
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/ai/"))
      assert(
        false,
        "Unexpected live AI request: install a fixture before sending",
      );
  });
}
async function fresh() {
  if (context) await context.close();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  page = await context.newPage();
  watch();
  await page.goto(url);
}
async function setup(
  choice,
  { fixed = 3, price = 0.2, limit = 10, name = "Northstar " + choice } = {},
) {
  await page.getByLabel(/Business name/).fill(name);
  await page.getByLabel(/Business type/).selectOption("Warehouse & logistics");
  await page.getByLabel(/Opening time/).selectOption("0");
  await page.getByLabel(/Closing time/).selectOption("24");
  await change("setup-analysis-choice", choice);
  await click("Continue to energy profile");
  await change("limit", limit);
  await change("offPeak", price);
  await change("peak", price);
  await change("current-fixed-demand-mode", "custom");
  await page.locator(".profile-hours summary").click();
  for (let h = 0; h < 24; h++) await change(`current-fixed-demand-${h}`, fixed);
}
async function review() {
  await click("Continue to your goals");
  await click("Review workspace");
  await page
    .locator(".setup-review")
    .getByText("12:00 AM–12:00 AM — end of day (end excluded)", { exact: true })
    .waitFor();
}
async function captureResponse(pending, name) {
  const response = await pending;
  assert.equal(response.status(), 200);
  const scenario = response.request().postDataJSON(),
    result = await response.json();
  check(scenario, result);
  const row = { name, url: response.url(), scenario, response: result };
  report.requests.push(row);
  await page.getByText("Result available ·", { exact: false }).waitFor();
  return row;
}
async function calculate(name) {
  const pending = page.waitForResponse(
    (r) =>
      r.url().includes("/api/optimize?") && r.request().method() === "POST",
  );
  await click("Create workspace and calculate");
  const row = await captureResponse(pending, name);
  assert.equal(new URL(page.url()).hash, "#overview");
  return row;
}
async function rerun(name) {
  const pending = page.waitForResponse(
    (r) =>
      r.url().includes("/api/optimize?") && r.request().method() === "POST",
  );
  await click("Run optimization");
  return captureResponse(pending, name);
}
(async () => {
  try {
    browser = await chromium.launch({ headless: true });
    // The final action makes exactly one request; delay its REAL response to inspect loading.
    await fresh();
    await setup("building", { limit: 5 });
    assert.equal(await page.locator("#arrival").count(), 0);
    assert.equal(await page.locator("#duration").count(), 0);
    await shot("building-options-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("building-options-mobile");
    await audit("building setup", ".setup-card");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await review();
    let release;
    const gate = new Promise((r) => (release = r));
    let count = 0;
    await page.route("**/api/optimize?*", async (route) => {
      count++;
      const real = await route.fetch();
      await gate;
      await route.fulfill({ response: real });
    });
    const pending = page.waitForResponse(
      (r) =>
        r.url().includes("/api/optimize?") && r.request().method() === "POST",
    );
    const button = page.getByRole("button", {
      name: "Create workspace and calculate",
      exact: true,
    });
    await button.dblclick({ noWaitAfter: true });
    await page
      .getByText("Calculating your submitted scenario…", { exact: true })
      .waitFor();
    await page
      .getByRole("heading", { name: "Your energy, in focus", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".kpi-number")
        .filter({ hasText: "Calculating…" })
        .count(),
      4,
    );
    await page.getByRole("group", { name: "Hourly tariff range" }).waitFor();
    await shot("calculating-desktop");
    release();
    const fixed = await captureResponse(pending, "building-flat");
    assert.equal(count, 1);
    await page.unroute("**/api/optimize?*");
    assert.deepEqual(fixed.scenario.ev_requirements, []);
    assert.deepEqual(fixed.scenario.flexible_equipment, []);
    assert(fixed.url.includes("scheduling_mode=joint"));
    near(fixed.response.optimized_electricity_cost_usd, 14.4);
    near(fixed.response.optimized_peak_demand_kw, 3);
    await page.locator(".fixed-only-note").waitFor();
    await page
      .getByText("Baseline and optimized demand overlap", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "Device operating schedule", exact: true })
        .count(),
      0,
    );
    assert(
      (await page.locator(".command-metrics").innerText()).includes("$14.40"),
    );
    await shot("building-populated-desktop");
    await audit("building overview", ".command-primary");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("building-populated-mobile");
    await page.reload();
    await page
      .getByText("No optimizer result has been restored", { exact: false })
      .waitFor();
    assert.equal(count, 1);
    assert.equal(
      await page
        .locator(".command-kpi .kpi-number")
        .filter({ hasText: "$14.40" })
        .count(),
      0,
    );
    await nav("Scenario configuration");
    assert.equal(
      await page.locator("#analysis-choice").inputValue(),
      "building",
    );
    assert.equal(await page.locator("#closing").inputValue(), "24");
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await click("Continue to your building");
    await nav("AI assistant");
    await page.goBack();
    assert.equal(new URL(page.url()).hash, "#overview");
    await page.goForward();
    assert.equal(new URL(page.url()).hash, "#assistant");
    await page
      .getByRole("link", { name: "Skip to main content", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "workspace-main",
    );
    report.checks.push(
      "one initial request, real-response loading, populated fixed-only overview, coincident curves, refresh restores inputs only, hash navigation and Home/Continue",
    );
    await fresh();
    await setup("building", { fixed: 0, price: 0, limit: 5 });
    await review();
    const zero = await calculate("building-zero");
    near(zero.response.optimized_electricity_cost_usd, 0);
    near(zero.response.optimized_peak_demand_kw, 0);
    assert(
      (await page.locator(".command-metrics").innerText()).includes("$0.00"),
    );
    assert((await page.locator(".recharts-line-curve").count()) > 0);
    await shot("zero-populated-desktop");
    report.checks.push(
      "zero demand, zero costs and flat tariffs render valid charts and zero savings",
    );
    for (const choice of ["flexible", "ev", "joint"]) {
      await fresh();
      await setup(choice, { limit: 10 });
      if (choice === "joint") {
        await change("arrival", 13);
        await change("deadline", 24);
        await shot("joint-times-desktop");
        await page.setViewportSize({ width: 390, height: 844 });
        await shot("joint-times-mobile");
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await review();
      const row = await calculate(choice);
      assert.equal(
        row.scenario.ev_requirements.length,
        choice === "flexible" ? 0 : 2,
      );
      assert.equal(
        row.scenario.flexible_equipment.length,
        choice === "ev" ? 0 : 1,
      );
      assert(
        row.url.includes(
          "scheduling_mode=" + (choice === "ev" ? "ev_only" : "joint"),
        ),
      );
      await page
        .getByRole("region", { name: "Device operating schedule", exact: true })
        .waitFor();
      if (choice === "joint") {
        await shot("joint-populated-desktop");
        await page.setViewportSize({ width: 390, height: 844 });
        await shot("joint-populated-mobile");
        await page.setViewportSize({ width: 1440, height: 1000 });
        // Controlled advisor UI; exact real submitted result identity, no live provider.
        page.removeAllListeners("request");
        let advisorBody;
        await page.route("**/api/ai/conversation", async (route) => {
          advisorBody = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              source: "mock",
              category: "scenario_proposal",
              message: "CONTROLLED FRONTEND FIXTURE",
              profile: advisorBody.profile,
              facts: [],
              changes: { building_max_demand_kw: 9 },
              proposed_scenario: {
                ...advisorBody.scenario,
                building_max_demand_kw: 9,
              },
            }),
          });
        });
        await nav("AI assistant");
        await page.locator("#ai-request").fill("Compare a 9 kW cap");
        await click("Send to advisor");
        await page
          .getByText("MOCK MODE — NOT META AI", { exact: true })
          .waitFor();
        assert.equal(advisorBody.result_id, row.response.result_id);
        assert.deepEqual(advisorBody.scenario, row.scenario);
        assert.equal(advisorBody.scheduling_mode, "joint");
        await click("Compare as alternative");
        assert.equal(
          await page.locator("#alternative-limit").inputValue(),
          "9",
        );
        let pair = [];
        const listener = async (r) => {
          if (
            r.url().includes("/api/optimize?") &&
            r.request().method() === "POST" &&
            r.status() === 200
          ) {
            const s = r.request().postDataJSON(),
              result = await r.json();
            check(s, result);
            const record = {
              name: "what-if-" + pair.length,
              url: r.url(),
              scenario: s,
              response: result,
            };
            pair.push(record);
            report.requests.push(record);
          }
        };
        page.on("response", listener);
        await click("Compare both scenarios");
        await page
          .getByRole("heading", {
            name: "Between scenarios: alternative minus current",
          })
          .waitFor();
        page.off("response", listener);
        assert.equal(pair.length, 2);
        await click("Apply alternative to current");
        await page
          .getByText("Outdated comparison results are hidden", { exact: false })
          .waitFor();
        await nav("Scenario configuration");
        assert.equal(await page.locator("#limit").inputValue(), "9");
        await nav("What-if scenarios");
        await click("Restore starting scenario");
        await nav("Scenario configuration");
        assert.equal(await page.locator("#limit").inputValue(), "10");
        await page.unroute("**/api/ai/conversation");
        report.fixtures.push(
          "advisor proposal uses real submitted scenario/mode/result ID, mock reply, explicit Compare; real What-if requests then Apply/Restore",
        );
        await nav("Electricity markets");
        await page
          .locator(".retail-panel .market-price")
          .filter({ hasText: /\d+\.\d+/ })
          .waitFor();
        await page
          .getByRole("button", { name: "Select Texas", exact: true })
          .focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#retail-state").inputValue(), "Texas");
        report.checks.push(
          "advisor handoff, explicit proposal comparison, real What-if Apply/Restore/stale handling, real dated retail display and keyboard interaction",
        );
      }
    }
    report.checks.push(
      "real flexible-only, EV-only and joint responses, exact active arrays, same-response verified device schedules",
    );
    // Restore a pre-choice workspace: it must keep EV-only held-at-baseline behavior.
    await fresh();
    await setup("joint");
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gridpilot.building-workspace")),
    );
    delete record.workspace.editor.analysisChoice;
    record.workspace.mode = "ev_only";
    await page.evaluate(
      (r) =>
        localStorage.setItem("gridpilot.building-workspace", JSON.stringify(r)),
      record,
    );
    await page.reload();
    assert.equal(
      await page.locator("#setup-analysis-choice").inputValue(),
      "held",
    );
    await review();
    const held = await calculate("legacy-held");
    assert(held.url.includes("scheduling_mode=ev_only"));
    assert(
      held.response.operating_plan.device_schedules.some(
        (d) => d.scheduling_role === "held_at_baseline",
      ),
    );
    report.checks.push(
      "legacy saved EV-only + held flexible equipment survives restoration and submits unchanged equipment",
    );
    // Custom device: real measured parameters, fractional power, stable ID + UI metadata.
    await fresh();
    await setup("flexible");
    await change("duration", 0);
    await click("Other / custom equipment");
    await page
      .getByLabel("Equipment name", { exact: true })
      .fill("Washdown pump");
    await page
      .getByLabel("Description (optional)", { exact: true })
      .fill("Interruptible transfer");
    await page
      .getByLabel(/How should this equipment be represented\?/)
      .selectOption("schedulable");
    await click("Continue to your goals");
    await page
      .getByText("Check the energy profile:", { exact: false })
      .waitFor();
    await page
      .getByLabel("Custom required energy (kWh)", { exact: true })
      .fill("3.75");
    await page
      .getByLabel("Custom maximum power (kW)", { exact: true })
      .fill("2.5");
    await page.getByLabel(/Custom available from/).selectOption("12");
    await page
      .getByLabel(/Custom available until \(exclusive\)/)
      .selectOption("24");
    await page
      .getByLabel(
        "I confirm this equipment can pause and vary its power within these hours.",
        { exact: true },
      )
      .check();
    await page.reload();
    assert.equal(
      await page.getByLabel("Equipment name", { exact: true }).inputValue(),
      "Washdown pump",
    );
    assert.equal(
      await page
        .getByLabel(/Custom available until \(exclusive\)/)
        .inputValue(),
      "24",
    );
    await shot("custom-equipment-desktop");
    await audit("custom equipment", ".setup-card");
    await review();
    const custom = await calculate("custom-flexible");
    assert.deepEqual(custom.scenario.ev_requirements, []);
    assert.equal(custom.scenario.flexible_equipment.length, 1);
    assert.equal(custom.scenario.flexible_equipment[0].id, "custom-equipment");
    near(custom.scenario.flexible_equipment[0].energy_required_kwh, 3.75);
    assert(!JSON.stringify(custom.scenario).includes("Washdown"));
    await page
      .getByRole("heading", {
        name: "Washdown pump · custom-equipment",
        exact: true,
      })
      .waitFor();
    const downloading = page.waitForEvent("download");
    await click("Export submitted evidence");
    const download = await downloading;
    await download.saveAs(`${output}/custom-submitted-evidence.json`);
    const exported = JSON.parse(
      fs.readFileSync(`${output}/custom-submitted-evidence.json`),
    );
    assert.deepEqual(exported.response, custom.response);
    assert.deepEqual(exported.submitted_scenario, custom.scenario);
    assert.equal(exported.device_metadata[0].name, "Washdown pump");
    await shot("custom-populated-desktop");
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot("custom-populated-tablet");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("custom-populated-mobile");
    await nav("Scenario configuration");
    await change("limit", 8);
    await nav("Energy overview");
    await page.locator(".workflow-status.is-stale").waitFor();
    const recalc = await rerun("custom-recalculated");
    assert.equal(recalc.scenario.building_max_demand_kw, 8);
    report.checks.push(
      "incomplete custom scheduling blocks, confirmed fractional parameters map exactly once with stable identity; draft refresh, same-response metadata export, later stale edits and explicit recalculation",
    );
    // Context/fixed names are metadata only. Unsupported behavior does not invent a load.
    await fresh();
    await setup("building");
    await click("Other / custom equipment");
    await page
      .getByLabel("Equipment name", { exact: true })
      .fill("Unmodeled HVAC");
    await page
      .getByLabel("Description (optional)", { exact: true })
      .fill("Thermal comfort not modeled");
    await page
      .getByLabel(/How should this equipment be represented\?/)
      .selectOption("fixed");
    await page
      .getByText("Include it exactly once:", { exact: false })
      .waitFor();
    await review();
    const meta = await calculate("fixed-metadata-only");
    assert.deepEqual(meta.scenario.flexible_equipment, []);
    assert(meta.scenario.fixed_demand_kw.every((v) => v === 3));
    report.checks.push(
      "fixed custom name remains context; explicit hourly profile counted once, no inferred HVAC load",
    );
    // Invalid inactive windows do not block building-only; real fixed-only infeasibility stays null.
    await fresh();
    await setup("ev", { fixed: 6, limit: 5 });
    await change("arrival", 22);
    await change("deadline", 6);
    await click("Continue to your goals");
    await page
      .getByText("Check the energy profile:", { exact: false })
      .waitFor();
    await change("setup-analysis-choice", "building");
    assert.equal(await page.locator("#deadline").count(), 0);
    await review();
    const infeasible = await calculate("fixed-infeasible");
    assert.equal(infeasible.response.feasibility_status, "infeasible");
    await page
      .locator("[data-reason-code=fixed_demand_above_site_limit]")
      .first()
      .waitFor();
    report.checks.push(
      "overnight active window rejected; switching excludes hidden EVs without repair, fixed-only infeasibility shows actual reasons and null optimized fields",
    );
    // Controlled HTTP failure on initial submission; retry remains explicit and uses retained inputs.
    await fresh();
    await setup("building", { limit: 5 });
    await review();
    await page.route("**/api/optimize?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "solver_unavailable" } }),
      }),
    );
    await click("Create workspace and calculate");
    await page
      .getByText("Feasibility was not determined", { exact: false })
      .waitFor();
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "5");
    await page.unroute("**/api/optimize?*");
    const retried = await rerun("explicit-retry");
    assert.equal(retried.response.feasibility_status, "feasible");
    report.fixtures.push(
      "HTTP 503 initial setup failure, preserved inputs and explicit retry against real backend",
    );
    // Actual persistent Chromium profile, no imported storage snapshot.
    if (context) await context.close();
    context = null;
    const profileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "gridpilot-business-browser-"),
    );
    const openProfile = async () => {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      });
      page = context.pages()[0] || (await context.newPage());
      watch();
      await page.goto(url);
    };
    try {
      await openProfile();
      await setup("flexible", { name: "Persistent business" });
      await change("duration", 0);
      await click("Other / custom equipment");
      await page
        .getByLabel("Equipment name", { exact: true })
        .fill("Context pump");
      await context.close();
      context = null;
      await openProfile();
      assert.equal(
        await page.locator("#setup-analysis-choice").inputValue(),
        "flexible",
      );
      assert.equal(
        await page.getByLabel("Equipment name", { exact: true }).inputValue(),
        "Context pump",
      );
      assert.equal(await page.locator("#duration").inputValue(), "0");
      await review();
      await calculate("persistent-context");
      await context.close();
      context = null;
      await openProfile();
      await click("Continue to your building");
      await page
        .getByText("No optimizer result has been restored", { exact: false })
        .waitFor();
      await nav("Scenario configuration");
      assert.equal(
        await page.getByLabel("Equipment name", { exact: true }).inputValue(),
        "Context pump",
      );
      await click("Edit building");
      assert.equal(
        await page.getByLabel(/Business name/).inputValue(),
        "Persistent business",
      );
      await click("Clear saved workspace");
      await click("Keep workspace");
      await click("Clear saved workspace");
      await click("Clear workspace");
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("gridpilot.building-workspace"),
        ),
        null,
      );
      report.checks.push(
        "real browser-profile close/reopen restores partial step, analysis, custom metadata and inactive values; completed Continue restores no results; Edit and clear/cancel remain functional",
      );
    } finally {
      if (context) await context.close();
      context = null;
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    assert.equal(report.errors.length, 0);
    assert(
      report.accessibility.every((a) => a.violations.length === 0),
      "Accessibility violation; inspect report",
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
          errors: report.errors,
          failure: report.failure,
        },
        null,
        2,
      ),
    );
  }
})();
