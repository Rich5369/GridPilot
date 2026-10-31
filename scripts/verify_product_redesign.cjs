// Real local UI and optimizer; no response interception or model inference.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const AxeBuilder = require(
  process.env.AXE_PLAYWRIGHT_MODULE || "@axe-core/playwright",
).default;
const { execFileSync } = require("node:child_process");
const appUrl = process.env.GRIDPILOT_FRONTEND_URL || "http://127.0.0.1:5292";
const fs = require("fs");
const assert = require("assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  fs.mkdirSync("artifacts/product-redesign", { recursive: true });
  const report = {
    baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    implementation:
      "Uncommitted frontend visual redesign working tree; baseRevision is not the implementation or deployment SHA",
    frontend: appUrl,
    accessibility: [],
    backend: process.env.GRIDPILOT_BACKEND_URL || "http://127.0.0.1:8012",
    source: "real_local_http_and_chromium",
    errors: [],
    checks: [],
    requests: [],
  };
  page.on("pageerror", (e) => report.errors.push(e.message));
  async function audit(name, selectors) {
    let builder = new AxeBuilder({ page }).withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ]);
    for (const selector of selectors) builder = builder.include(selector);
    const result = await builder.analyze();
    report.accessibility.push({
      name,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          failureSummary: n.failureSummary,
        })),
      })),
    });
  }
  async function shot(name) {
    await page.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );
    await page.screenshot({
      path: `artifacts/product-redesign/${name}.png`,
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${name}`,
    );
  }
  try {
    await page.goto(appUrl);
    await page
      .getByRole("heading", { name: "Tell us about your business" })
      .waitFor();
    await shot("home-desktop");
    await audit("homepage", [".setup-page"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("home-mobile");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByLabel(/Business name/).fill("Northstar Logistics");
    await page
      .getByLabel(/Business type/)
      .selectOption("Warehouse & logistics");
    await page.getByLabel(/Number of employees/).fill("50");
    await page.getByLabel(/Monthly electricity bill/).fill("2400");
    await page
      .getByRole("button", { name: "Continue to energy profile" })
      .click();
    await page
      .getByRole("heading", { name: "Build your energy profile" })
      .waitFor();
    await page.locator("#limit").fill("25");
    await page.locator("#arrival").fill("15");
    await page.locator("#deadline").fill("22");
    await shot("energy-profile-desktop");
    await audit("energy-profile", [".setup-card"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("energy-profile-mobile");
    await page.getByRole("button", { name: "Continue to your goals" }).click();
    await page
      .getByRole("heading", { name: "What matters most to you?" })
      .waitFor();
    await shot("goals-mobile");
    await page.getByRole("button", { name: "Review workspace" }).click();
    await shot("review-mobile");
    await page.getByRole("button", { name: "Create my workspace" }).click();
    await page
      .getByRole("heading", { name: "Your energy, in focus" })
      .waitFor();
    assert(
      (await page.locator("body").innerText()).includes("Northstar Logistics"),
    );
    assert(
      (await page.locator("body").innerText()).includes(
        "No backend result yet",
      ),
    );
    await page.getByText("Backend connected", { exact: true }).waitFor();
    const pending = page.waitForResponse(
      (r) =>
        r.url().includes("/api/optimize?") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Run optimization", exact: true })
      .click();
    const response = await pending;
    assert.equal(response.status(), 200);
    const request = response.request().postDataJSON(),
      result = await response.json();
    assert(response.url().includes("scheduling_mode=joint"));
    assert.equal(request.ev_requirements[0].arrival_hour, 15);
    assert.equal(request.ev_requirements[0].deadline_hour, 22);
    assert.equal(request.building_max_demand_kw, 25);
    assert.equal(result.feasibility_status, "feasible");
    assert(result.operating_plan.verification_status === "passed");
    report.requests.push({
      url: response.url(),
      scenario: request,
      response: result,
    });
    await page
      .getByRole("region", { name: "Device operating schedule", exact: true })
      .waitFor();
    assert(
      Math.abs(
        result.optimized_demand_kw.reduce(
          (s, v, h) => s + v * request.electricity_prices_usd_per_kwh[h],
          0,
        ) - result.optimized_electricity_cost_usd,
      ) <= 2e-7,
    );
    assert(
      Math.abs(
        Math.max(...result.optimized_demand_kw) -
          result.optimized_peak_demand_kw,
      ) <= 1e-6,
    );
    assert(
      (await page.locator(".comparison").innerText()).includes(
        "$" + result.optimized_electricity_cost_usd.toFixed(2),
      ),
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export submitted evidence" })
      .click();
    const exported = JSON.parse(
      fs.readFileSync(await (await downloadEvent).path(), "utf8"),
    );
    assert.deepEqual(exported.response, result);
    assert.deepEqual(exported.submitted_scenario, request);
    await shot("optimization-mobile");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await shot("optimization-desktop");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Energy overview", exact: true })
      .click();
    await shot("dashboard-desktop");
    await page.screenshot({
      path: "artifacts/product-redesign/dashboard-desktop-viewport.png",
    });
    await audit("dashboard-chrome-and-comparison", [
      ".sidebar",
      ".topbar",
      ".page-heading",
      ".command-metrics",
      ".comparison",
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("dashboard-mobile");
    await page.screenshot({
      path: "artifacts/product-redesign/dashboard-mobile-viewport.png",
    });
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "AI assistant", exact: true })
      .click();
    assert(
      (await page.locator(".advisor-context-summary").innerText()).includes(
        "Warehouse & logistics",
      ),
    );
    assert(
      (await page.locator(".advisor-context-summary").innerText()).includes(
        "2400",
      ),
    );
    assert(
      (await page.locator(".advisor-context-summary").innerText()).includes(
        "From setup",
      ),
    );
    await shot("advisor-mobile");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await shot("advisor-desktop");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Scenario configuration", exact: true })
      .click();
    await page.locator("#limit").fill("15");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Energy overview", exact: true })
      .click();
    assert((await page.locator("body").innerText()).includes("Inputs changed"));
    assert(
      (
        await page
          .getByRole("region", {
            name: "Device operating schedule",
            exact: true,
          })
          .innerText()
      ).includes("PREVIOUS SCENARIO"),
    );
    await page
      .getByRole("button", { name: "Edit building", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Tell us about your business" })
      .waitFor();
    assert.equal(
      await page.getByLabel(/Business name/).inputValue(),
      "Northstar Logistics",
    );
    await page
      .getByRole("button", { name: "Continue to energy profile" })
      .click();
    assert.equal(await page.locator("#limit").inputValue(), "15");
    await page.locator("#limit").fill("1");
    await page.getByRole("button", { name: "Continue to your goals" }).click();
    await page.getByRole("button", { name: "Review workspace" }).click();
    await page.getByRole("button", { name: "Create my workspace" }).click();
    const blockedPending = page.waitForResponse(
      (r) =>
        r.url().includes("/api/optimize?") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Run optimization", exact: true })
      .click();
    const blockedResponse = await blockedPending;
    assert.equal(blockedResponse.status(), 200);
    const blockedResult = await blockedResponse.json();
    report.requests.push({
      url: blockedResponse.url(),
      scenario: blockedResponse.request().postDataJSON(),
      response: blockedResult,
    });
    assert.equal(blockedResult.feasibility_status, "infeasible");
    assert.equal(blockedResult.optimized_electricity_cost_usd, null);
    assert.equal(blockedResult.optimized_demand_kw, null);
    assert(
      blockedResult.operating_plan.device_schedules.every(
        (d) => d.optimized_power_kw === null,
      ),
    );
    await page
      .getByRole("heading", { name: "No feasible schedule was found." })
      .waitFor();
    await shot("infeasible-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("infeasible-mobile");
    report.checks.push(
      "real infeasible response retains null optimized fields and clear warnings",
      "exact-response export and displayed cost/peak arithmetic",
      "edited scenario survives returning to setup",
      "onboarding values and mode preserved",
      "real backend result rendered",
      "business context passed to advisor without inference",
      "no page overflow at 1440/390",
      "stale result warning remains",
    );
    assert.deepEqual(report.errors, []);
    assert(
      report.accessibility.every((a) => a.violations.length === 0),
      "Scoped accessibility violations",
    );
    report.pass = true;
    console.log("PASS", report.checks);
  } finally {
    fs.writeFileSync(
      "artifacts/product-redesign/verification.json",
      JSON.stringify(report, null, 2),
    );
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
