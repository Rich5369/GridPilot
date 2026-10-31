// Local production UI + real backend. Storage errors are injected; optimizer
// responses are never intercepted. Browser profiles contain synthetic inputs only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const url = process.env.GRIDPILOT_FRONTEND_URL || "http://127.0.0.1:5294";
const output = process.env.GRIDPILOT_OUTPUT || "artifacts/save-resume";
const key = "gridpilot.building-workspace";
const profileDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "gridpilot-save-resume-"),
);
const report = {
  source: "real_local_production_UI_and_backend",
  frontend: url,
  baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  implementation:
    "Frontend source committed at baseRevision; local production build, not a deployed revision. QA tooling and documentation were uncommitted.",
  checks: [],
  requests: [],
  errors: [],
  screenshots: [],
};
fs.mkdirSync(output, { recursive: true });
let context, page, auxiliary;
function watch(p) {
  p.on("pageerror", (e) => report.errors.push(e.message));
}
async function open() {
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
  });
  page = context.pages()[0] || (await context.newPage());
  watch(page);
  await page.goto(url);
}
async function read() {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : JSON.parse(raw);
  }, key);
}
async function shot(name, p = page) {
  if (await p.locator(".draft-preview").count())
    await p.locator(".draft-preview .recharts-line-curve").first().waitFor();
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `overflow: ${name}`,
  );
  await p.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  report.screenshots.push(`${name}.png`);
}
async function click(name, p = page) {
  await p.getByRole("button", { name, exact: true }).click();
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
(async () => {
  try {
    await open();
    assert.equal(await read(), null);
    await page.getByLabel(/Business name/).fill("Northstar saved building");
    await page
      .getByLabel(/Business type/)
      .selectOption("Warehouse & logistics");
    await page.getByLabel(/Number of employees/).fill("42");
    await page.getByLabel(/Monthly electricity bill/).fill("2300");
    await page.reload();
    assert.equal(
      await page.getByLabel(/Business name/).inputValue(),
      "Northstar saved building",
    );
    assert.equal(
      await page.getByLabel(/Number of employees/).inputValue(),
      "42",
    );
    await click("Continue to energy profile");
    await page.locator("#arrival").fill("15");
    await page.locator("#deadline").fill("22");
    await page.locator("#current-fixed-demand-mode").selectOption("custom");
    await page
      .getByText("Edit 24 hourly demand values (kW)", { exact: true })
      .click();
    await page.locator("#current-fixed-demand-0").fill("4.25");
    await page.locator("#limit").fill("");
    await page.reload();
    await page
      .getByRole("heading", { name: "Build your energy profile", exact: true })
      .waitFor();
    assert.equal(await page.locator("#limit").inputValue(), "");
    let stored = await read();
    assert.equal(stored.step, 1);
    assert.equal(stored.completed, false);
    assert.equal(stored.workspace.editor.demandProfile.values[0], "4.25");
    assert.equal(stored.workspace.editor.evEnergy, "14.4");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("partial-setup-mobile");
    await page.locator("#limit").fill("25");
    await click("Continue to your goals");
    await click("Improve operating flexibility");
    await page.reload();
    assert.equal((await read()).step, 2);
    assert.equal(
      await page.locator(".goal-options [aria-pressed=true]").count(),
      3,
    );
    await click("Review workspace");
    await page.reload();
    assert.equal((await read()).step, 3);
    await click("Create my workspace");
    await page
      .getByRole("heading", { name: "Your energy, in focus" })
      .waitFor();
    assert.equal((await read()).completed, true);
    const pending = page.waitForResponse(
      (r) =>
        r.url().includes("/api/optimize?") && r.request().method() === "POST",
    );
    await click("Run optimization");
    const response = await pending;
    assert.equal(response.status(), 200);
    const result = await response.json(),
      scenario = response.request().postDataJSON();
    assert.equal(result.feasibility_status, "feasible");
    assert(
      Math.abs(
        result.optimized_demand_kw.reduce(
          (s, v, h) => s + v * scenario.electricity_prices_usd_per_kwh[h],
          0,
        ) - result.optimized_electricity_cost_usd,
      ) <= 2e-7,
    );
    report.requests.push({ url: response.url(), scenario, response: result });
    await page
      .getByRole("region", { name: "Device operating schedule", exact: true })
      .waitFor();
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    for (const forbidden of [
      "result_id",
      "operating_plan",
      "optimized_demand_kw",
    ])
      assert(!raw.includes(forbidden));
    await nav("AI assistant");
    await page.locator(".advisor-context summary").click();
    await page.locator(".advisor-fields label:nth-child(2) input").fill("43");
    await page
      .locator(".advisor-fields label:nth-child(6) input")
      .fill("Warehouse vans");
    assert.equal((await read()).workspace.businessContext.employee_count, 43);
    await context.close();
    context = null;
    // Reopen the actual Chromium profile on disk, not an imported storage snapshot.
    await open();
    await page
      .getByRole("button", { name: "Continue to your building", exact: true })
      .waitFor();
    await shot("completed-resume-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("completed-resume-mobile");
    let automaticSolves = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/optimize"))
        automaticSolves++;
    });
    await click("Continue to your building");
    await page
      .getByText("Building inputs restored.", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "Device operating schedule", exact: true })
        .count(),
      0,
    );
    assert.equal(automaticSolves, 0);
    await shot("restored-dashboard-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot("restored-dashboard-desktop");
    await nav("AI assistant");
    assert(
      (await page.locator(".advisor-context-summary").innerText()).includes(
        "Warehouse vans",
      ),
    );
    assert(
      (await page.locator(".advisor-context-summary").innerText()).includes(
        "43",
      ),
    );
    await nav("Scenario configuration");
    await page.locator("#limit").fill("19.25");
    await page.locator("#scheduling-mode").selectOption("ev_only");
    await page.reload();
    await page.getByText("Building inputs restored.", { exact: false }).waitFor();
    await nav("Scenario configuration");
    assert.equal(await page.locator("#limit").inputValue(), "19.25");
    assert.equal(
      await page.locator("#scheduling-mode").inputValue(),
      "ev_only",
    );
    stored = await read();
    assert.equal(stored.workspace.editor.demandProfile.values[0], "4.25");
    await click("Edit building");
    assert.equal(
      await page.getByLabel(/Business name/).inputValue(),
      "Northstar saved building",
    );
    assert.equal(
      await page.getByLabel(/Monthly electricity bill/).inputValue(),
      "2300",
    );
    await click("Continue to energy profile");
    assert.equal(await page.locator("#limit").inputValue(), "19.25");
    const recoveryFixture = await read();
    await page.evaluate(() =>
      localStorage.setItem("gridpilot-test-neighbor", "keep"),
    );
    await click("Clear saved workspace");
    await click("Keep workspace");
    assert.deepEqual(await read(), recoveryFixture);
    await click("Clear saved workspace");
    await click("Clear workspace");
    assert.equal(await read(), null);
    assert.equal(await page.getByLabel(/Business name/).inputValue(), "");
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("gridpilot-test-neighbor"),
      ),
      "keep",
    );
    await page.reload();
    assert.equal(await read(), null);
    await shot("cleared-workspace");
    // Failed writes/removal must retain the live input and the previous saved data.
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key, value: recoveryFixture },
    );
    await context.addInitScript((k) => {
      const set = Storage.prototype.setItem,
        remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === k)
          throw new DOMException("Blocked for QA", "QuotaExceededError");
        return set.call(this, name, value);
      };
      Storage.prototype.removeItem = function (name) {
        if (name === k)
          throw new DOMException("Blocked for QA", "SecurityError");
        return remove.call(this, name);
      };
    }, key);
    await page.reload();
    await page.locator("#limit").fill("18.75");
    await page
      .getByText("Changes could not be saved", { exact: false })
      .waitFor();
    assert.equal(await page.locator("#limit").inputValue(), "18.75");
    assert.equal((await read()).workspace.editor.limit, "19.25");
    await click("Clear saved workspace");
    await click("Clear workspace");
    await page
      .getByText("Browser storage could not be cleared.", { exact: false })
      .waitFor();
    assert.equal(await page.locator("#limit").inputValue(), "18.75");
    await shot("storage-write-clear-failure");
    await context.close();
    context = null;
    report.checks.push(
      "edited business context survives browser reopening while conversations are not restored",
      "refresh restores profile, partial step, invalid text, goals and custom profile exactly",
      "completed workspace survives closing/reopening an actual on-disk browser profile",
      "Continue restores inputs with no result, handle or automatic solve",
      "dashboard inputs/mode persist and survive Edit building",
      "clear/cancel touches only the workspace key and stays cleared on refresh",
      "failed writes and removal retain current inputs and previous saved data",
    );
    auxiliary = await chromium.launch({ headless: true });
    for (const invalid of ["{broken", JSON.stringify({ version: 99 })]) {
      const c = await auxiliary.newContext();
      const p = await c.newPage();
      watch(p);
      await p.goto(url);
      await p.evaluate(
        ({ key, invalid }) => localStorage.setItem(key, invalid),
        { key, invalid },
      );
      await p.reload();
      await p
        .getByRole("heading", { name: "Saved workspace needs attention" })
        .waitFor();
      assert.equal(
        await p.evaluate((k) => localStorage.getItem(k), key),
        invalid,
      );
      assert.equal(await p.getByLabel(/Business name/).count(), 0);
      await shot(
        invalid.startsWith("{broken")
          ? "malformed-storage"
          : "unsupported-storage-version",
        p,
      );
      await click("Clear saved workspace", p);
      await click("Clear workspace", p);
      await p
        .getByRole("heading", { name: "Tell us about your business" })
        .waitFor();
      await p.reload();
      assert.equal(await p.evaluate((k) => localStorage.getItem(k), key), null);
      await c.close();
    }
    const blocked = await auxiliary.newContext();
    await blocked.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Blocked for QA", "SecurityError");
        },
      }),
    );
    const p = await blocked.newPage();
    watch(p);
    await p.goto(url);
    await p.getByLabel(/Business name/).fill("Session-only building");
    await p.getByLabel(/Business type/).selectOption("Office");
    await click("Continue to energy profile", p);
    await p
      .getByText("Browser storage is unavailable.", { exact: false })
      .waitFor();
    await shot("storage-unavailable", p);
    await blocked.close();
    const demos = await auxiliary.newContext();
    const d = await demos.newPage();
    watch(d);
    await d.goto(url);
    await click("Explore demo", d);
    assert.equal(
      await d.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)).workspace.kind,
        key,
      ),
      "demo",
    );
    await d.reload();
    await d.getByRole("link", {name:"Home",exact:true}).click();
    await d
      .getByText("Demonstration workspace · synthetic inputs", { exact: true })
      .waitFor();
    await shot("saved-demonstration", d);
    await demos.close();
    report.checks.push(
      "malformed and unsupported records remain untouched until explicit clearing",
      "unavailable storage keeps setup usable with an honest session-only warning",
      "saved demonstrations remain explicitly identified",
    );
    assert.deepEqual(report.errors, []);
    report.pass = true;
    console.log("PASS", JSON.stringify(report.checks));
  } finally {
    fs.writeFileSync(
      `${output}/verification.json`,
      JSON.stringify(report, null, 2),
    );
    if (context) await context.close();
    if (auxiliary) await auxiliary.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
