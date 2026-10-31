// Real solver/API for all optimization checks. Only advisor/error paths use
// controlled fixtures; no paid provider calls. Never merge or deploys anything.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const AxeBuilder = require(
  process.env.AXE_MODULE || "@axe-core/playwright",
).default;
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const url = process.env.GRIDPILOT_FRONTEND_URL || "http://127.0.0.1:5296";
const output = "artifacts/frontend-completion";
fs.mkdirSync(output, { recursive: true });
const report = {
  source: "local production React + unchanged real backend",
  baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  implementation:
    "Frontend source committed at baseRevision; local production build, not a deployed revision. QA tooling and documentation were uncommitted.",
  checks: [],
  requests: [],
  fixtures: [],
  screenshots: [],
  accessibility: [],
  errors: [],
};
const near = (a, b, t = 1e-6) => assert(Math.abs(a - b) <= t, `${a} != ${b}`),
  sum = (a) => a.reduce((s, n) => s + n, 0);
let browser, context, page;
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `overflow ${name}`,
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
async function fill(values) {
  for (const [id, value] of Object.entries(values))
    await page.locator("#" + id).fill(String(value));
}
async function run() {
  const pending = page.waitForResponse(
    (r) =>
      r.url().includes("/api/optimize?") && r.request().method() === "POST",
  );
  await click("Run optimization");
  const res = await pending;
  assert.equal(res.status(), 200);
  const s = res.request().postDataJSON(),
    r = await res.json();
  report.requests.push({ url: res.url(), scenario: s, response: r });
  await page.locator(".comparison").filter({ visible: true }).waitFor();
  check(s, r);
  return { s, r };
}
function check(s, r) {
  for (const kind of ["baseline", "optimized"]) {
    const d = r[kind + "_demand_kw"];
    if (!d) {
      assert.equal(r.feasibility_status, "infeasible");
      continue;
    }
    near(
      sum(d.map((v, h) => v * s.electricity_prices_usd_per_kwh[h])),
      r[kind + "_electricity_cost_usd"],
      2e-7,
    );
    near(Math.max(...d), r[kind + "_peak_demand_kw"]);
  }
  const plan = r.operating_plan;
  assert(plan);
  if (r.feasibility_status === "infeasible") {
    assert(r.constraint_violations.length);
    for (const k of [
      "optimized_demand_kw",
      "optimized_peak_demand_kw",
      "optimized_electricity_cost_usd",
    ])
      assert.equal(r[k], null);
    assert(plan.device_schedules.every((d) => d.optimized_power_kw === null));
    return;
  }
  assert.equal(plan.verification_status, "passed");
  const devices = plan.device_schedules;
  for (const d of devices) {
    const a = d.optimized_power_kw;
    assert.equal(a.length, 24);
    near(sum(a), d.required_energy_kwh, 1e-6);
    for (let h = 0; h < 24; h++) {
      assert(a[h] >= -1e-6 && a[h] <= d.max_power_kw + 1e-6);
      if (h < d.available_hours.start_hour || h >= d.available_hours.end_hour)
        near(a[h], 0);
    }
  }
  for (let h = 0; h < 24; h++) {
    near(
      s.fixed_demand_kw[h] + sum(devices.map((d) => d.optimized_power_kw[h])),
      r.optimized_demand_kw[h],
    );
    assert(r.optimized_demand_kw[h] <= s.building_max_demand_kw + 1e-6);
  }
}
(async () => {
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(url + "/#/building/comparison");
    await page
      .getByText("Finish or resume your building setup", { exact: false })
      .waitFor();
    await page
      .getByLabel(/Business name/)
      .fill("Northstar Frontend Acceptance");
    await page
      .getByLabel(/Business type/)
      .selectOption("Warehouse & logistics");
    await click("Continue to energy profile");
    await fill({ arrival: 15, deadline: 22 });
    await click("Continue to your goals");
    await click("Review workspace");
    await click("Create my workspace");
    assert.equal(new URL(page.url()).hash, "#comparison");
    await nav("Scenario configuration");
    await nav("AI assistant");
    await page.goBack();
    assert.equal(new URL(page.url()).hash, "#configuration");
    await page.locator("#limit").waitFor();
    await page.goForward();
    await page.locator("#ai-request").waitFor();
    assert.equal(new URL(page.url()).hash, "#assistant");
    await page.reload();
    await page.locator("#ai-request").waitFor();
    await page
      .getByText("No optimizer result has been restored", { exact: false })
      .waitFor();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await click("Continue to your building");
    await page.getByRole("link", { name: "Skip to main content" }).focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "workspace-main",
    );
    assert.equal(new URL(page.url()).hash, "#overview");
    report.checks.push(
      "setup, deep-link guard, exact hash restoration, browser Back/Forward, Home/Continue, keyboard skip link",
    );
    const feasible = await run();
    assert.equal(feasible.r.feasibility_status, "feasible");
    await page
      .getByRole("region", { name: "Device operating schedule", exact: true })
      .waitFor();
    const dl = page.waitForEvent("download");
    await click("Export submitted evidence");
    const download = await dl;
    const exportFile = `${output}/submitted-evidence.json`;
    await download.saveAs(exportFile);
    const exported = JSON.parse(fs.readFileSync(exportFile));
    assert.deepEqual(exported.response, feasible.r);
    assert.deepEqual(exported.submitted_scenario, feasible.s);
    assert.equal(exported.scheduling_mode, "joint");
    assert.equal(exported.response.result_id, feasible.r.result_id);
    await nav("AI assistant");
    await page.route("**/api/ai/conversation", async (route) => {
      const body = route.request().postDataJSON();
      assert.equal(body.result_id, feasible.r.result_id);
      assert.deepEqual(body.scenario, feasible.s);
      assert.equal(body.scheduling_mode, "joint");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "mock",
          category: "answer",
          message: "Controlled result-identity check",
          facts: [],
          profile: body.profile,
          changes: {},
          proposed_scenario: null,
        }),
      });
    });
    await page.locator("#ai-request").fill("Explain submitted results");
    await click("Send to advisor");
    await page
      .getByText("Controlled result-identity check", { exact: true })
      .waitFor();
    await page.unroute("**/api/ai/conversation");
    report.fixtures.push(
      "advisor same-result request ID checked against real solver execution; mock reply",
    );
    await nav("Optimization");
    await shot("feasible-desktop");
    await audit("dashboard navigation", ".sidebar");
    report.checks.push(
      "real joint solve: same-result E1 and aggregates, energy/power/window/site reconciliation, full precision export with exact result ID",
    );
    await nav("What-if scenarios");
    await click("Create alternative from current");
    await page.locator("#alternative-limit").fill("15");
    const pairResponses = [];
    const listener = async (res) => {
      if (
        res.url().includes("/api/optimize?") &&
        res.request().method() === "POST" &&
        res.status() === 200
      ) {
        const s = res.request().postDataJSON(),
          r = await res.json();
        pairResponses.push({ s, r, url: res.url() });
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
    assert.equal(pairResponses.length, 2);
    for (const p of pairResponses) {
      check(p.s, p.r);
      report.requests.push({ url: p.url, scenario: p.s, response: p.r });
    }
    const [a, b] = pairResponses;
    assert.equal(a.s.building_max_demand_kw, 25);
    assert.equal(b.s.building_max_demand_kw, 15);
    for (const p of pairResponses)
      assert(p.url.includes("scheduling_mode=joint"));
    const differences = page.locator(".what-if > dl");
    const cost =
        b.r.optimized_electricity_cost_usd - a.r.optimized_electricity_cost_usd,
      peak = b.r.optimized_peak_demand_kw - a.r.optimized_peak_demand_kw;
    assert((await differences.innerText()).includes("$" + cost.toFixed(2)));
    assert((await differences.innerText()).includes(peak.toFixed(2) + " kW"));
    assert((await differences.innerText()).includes("0.00 kWh"));
    assert(!(await differences.innerText()).includes("-0.00"));
    await shot("whatif-desktop");
    await nav("AI assistant");
    await page.goBack();
    await page
      .getByRole("heading", {
        name: "Between scenarios: alternative minus current",
      })
      .waitFor();
    await click("Apply alternative to current");
    await page
      .getByText("Outdated comparison results are hidden", { exact: false })
      .waitFor();
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "15");
    await nav("What-if scenarios");
    await click("Restore starting scenario");
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "25");
    await page.locator("#scheduling-mode").selectOption("ev_only");
    await nav("What-if scenarios");
    await page
      .getByText("Outdated comparison results are hidden", { exact: false })
      .waitFor();
    report.checks.push(
      "two real What-if requests, alternative-minus-current arithmetic, preserved pair on history navigation, Apply/Restore and mode invalidation",
    );
    await nav("Scenario configuration");
    await page.locator("#scheduling-mode").selectOption("joint");
    await fill({ evEnergy: 100 });
    const device = await run();
    assert(
      device.r.infeasibility_evidence.some(
        (e) => e.code === "device_window_capacity",
      ),
    );
    await page
      .locator("[data-reason-code=device_window_capacity]")
      .first()
      .waitFor();
    await shot("evidence-device-desktop");
    await audit("structured infeasibility", ".infeasibility-details");
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot("evidence-tablet");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("evidence-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await nav("Scenario configuration");
    await fill({ evEnergy: 14.4, limit: 0.5 });
    const fixed = await run();
    assert(
      fixed.r.infeasibility_evidence.some(
        (e) => e.code === "fixed_demand_above_site_limit",
      ),
    );
    await shot("evidence-fixed-desktop");
    await nav("Scenario configuration");
    await fill({
      limit: 3,
      evEnergy: 1,
      chargers: 1,
      arrival: 0,
      deadline: 2,
      duration: 0,
    });
    await page.locator("#current-fixed-demand-mode").selectOption("custom");
    await page.locator(".demand-profile summary").click();
    for (let h = 0; h < 24; h++)
      await page.locator(`#current-fixed-demand-${h}`).fill("3");
    const shared = await run();
    assert(
      shared.r.infeasibility_evidence.some(
        (e) => e.code === "shared_window_capacity",
      ),
    );
    await shot("evidence-shared-desktop");
    await nav("Scenario configuration");
    await fill({
      limit: 2,
      chargers: 0,
      equipmentPower: 1,
      duration: 2,
      equipmentStart: 0,
      equipmentEnd: 2,
    });
    await page.locator(".demand-profile summary").click();
    for (let h = 0; h < 24; h++)
      await page
        .locator(`#current-fixed-demand-${h}`)
        .fill(h === 1 ? "2" : "0");
    const generic = await run();
    assert(
      generic.r.infeasibility_evidence.some(
        (e) => e.code === "solver_infeasible",
      ),
    );
    await shot("evidence-generic-desktop");
    assert.equal(
      await page
        .locator("[data-reason-code=solver_infeasible] [data-quantity]")
        .count(),
      0,
    );
    report.checks.push(
      "all four E2 proof categories rendered from real optimizer responses; infeasible optimized fields null, no invented generic certificate",
    );
    await nav("Scenario configuration");
    await fill({ limit: "" });
    assert(
      await page
        .getByRole("button", { name: "Run optimization", exact: true })
        .isDisabled(),
    );
    await fill({ limit: 3 });
    await page.route("**/api/optimize?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "solver_unavailable" } }),
      }),
    );
    await click("Run optimization");
    await page
      .getByText("Feasibility was not determined", { exact: false })
      .waitFor();
    await page.unroute("**/api/optimize?*");
    report.fixtures.push(
      "HTTP 503 solver unavailable; retained previous submitted result, no success or fabricated infeasibility",
    );
    report.checks.push(
      "invalid empty input blocks submission; solver service errors distinguished from mathematical infeasibility",
    );
    // Reset scenario using the existing explicit demo control; this never invokes optimization.
    await nav("Scenario configuration");
    await click("Reset to Default Scenario");
    await page.locator("#scheduling-mode").selectOption("joint");
    await page.reload();
    await nav("AI assistant");
    await page.locator(".advisor-context summary").click();
    await page.locator(".advisor-fields input[type=number]").fill("10");
    let release;
    const hold = new Promise((r) => (release = r));
    let advisorBody;
    await page.route("**/api/ai/conversation", async (route) => {
      advisorBody = route.request().postDataJSON();
      await hold;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "mock",
          category: "scenario_proposal",
          message: "CONTROLLED UI FIXTURE — review lower cap",
          facts: [],
          profile: { employee_count: 10 },
          changes: { building_max_demand_kw: 15 },
          proposed_scenario: {
            ...advisorBody.scenario,
            building_max_demand_kw: 15,
          },
        }),
      });
    });
    await page.locator("#ai-request").fill("Compare a 15 kW limit");
    await click("Send to advisor");
    await page
      .getByText("Requesting Meta assistance…", { exact: true })
      .waitFor();
    await page.locator(".advisor-fields input[type=number]").fill("43");
    release();
    await page.getByText("MOCK MODE — NOT META AI", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".advisor-fields input[type=number]").inputValue(),
      "43",
    );
    assert.equal(advisorBody.scheduling_mode, "joint");
    assert.equal(advisorBody.result_id, null);
    assert.equal(advisorBody.profile.employee_count, 10);
    await shot("advisor-fixture-desktop");
    await click("Compare as alternative");
    await page.locator("#alternative-limit").waitFor();
    assert.equal(await page.locator("#alternative-limit").inputValue(), "15");
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "25");
    await nav("AI assistant");
    await click("Send to advisor");
    await page
      .getByRole("button", { name: "Apply Changes", exact: true })
      .waitFor();
    await click("Apply Changes");
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "15");
    await page.unroute("**/api/ai/conversation");
    await page.route("**/api/ai/conversation", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            message: "Controlled provider unavailable; retry explicitly.",
          },
        }),
      }),
    );
    await nav("AI assistant");
    await click("Send to advisor");
    await page
      .getByText("Controlled provider unavailable; retry explicitly.", {
        exact: true,
      })
      .waitFor();
    await page.unroute("**/api/ai/conversation");
    report.fixtures.push(
      "advisor mock proposals, pending user profile correction, explicit Compare/Apply, provider error; no live Meta calls",
    );
    report.checks.push(
      "advisor scenario/mode/null result handoff, profile race fixed, proposals require explicit actions without automatic solves",
    );
    await nav("Electricity markets");
    await page
      .getByText("Published monthly · not live", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Select Texas", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#retail-state").inputValue(), "Texas");
    await shot("retail-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("retail-mobile");
    await audit("retail interaction", ".retail-panel");
    await page.route("**/api/retail-prices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"states":[{"cents_per_kwh":"bad"}]}',
      }),
    );
    await page.reload();
    await page.getByText("Data unavailable", { exact: true }).waitFor();
    assert(
      (await page.locator(".retail-panel .market-price").innerText()).includes(
        "—",
      ),
    );
    await page.unroute("**/api/retail-prices");
    await click("Retry price release");
    await page
      .getByText("Published monthly · not live", { exact: true })
      .waitFor();
    report.fixtures.push(
      "malformed retail release rejected; explicit read-only retry returns real release",
    );
    report.checks.push(
      "real dated retail benchmark, keyboard controls, malformed-release unavailable state and retry; scenario tariff unaffected",
    );
    assert.equal(report.errors.length, 0);
    assert(
      report.accessibility.every((a) => a.violations.length === 0),
      "accessibility violations: inspect report",
    );
    report.pass = true;
  } catch (e) {
    report.pass = false;
    if (page) {
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
      fs.writeFileSync(
        `${output}/failure-ui.txt`,
        await page.locator("body").innerText(),
      );
    }
    report.failure = e.stack;
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
