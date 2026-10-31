// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import captures from "../../artifacts/product-redesign/verification.json";
import App from "./App";
import {
  emptyWorkspace,
  demoWorkspace,
  WORKSPACE_KEY,
} from "./services/workspaceStorage";
import type { SavedWorkspace } from "./types/workspace";

// The real dashboard owns editor/mode changes. Only its responsive charts are
// omitted in these DOM tests; the browser verifier exercises the full UI.
vi.mock("./components/dashboard/CommandAnalytics", () => ({
  CommandMetrics: () => null,
  ScenarioAnalytics: () => null,
}));
vi.mock("./components/DemandChart", () => ({ DemandChart: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const fetchMock = vi.fn();
function saved(completed = false): SavedWorkspace {
  return {
    version: 1,
    step: completed ? 3 : 1,
    completed,
    workspace: {
      ...emptyWorkspace(),
      name: "Northstar",
      businessType: "Warehouse & logistics",
      editor: {
        ...emptyWorkspace().editor,
        analysisChoice: "joint",
        arrival: "15",
        deadline: "22",
        limit: "17",
      },
    },
  };
}
function seed(value: SavedWorkspace) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(value));
}
async function mount() {
  await act(async () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
}
async function reopen() {
  await act(async () => root.unmount());
  root = createRoot(host);
  await mount();
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function input(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  expect(el).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", project: "GridPilot" })),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
it("does not create a saved draft until inputs change, then restores an exact partial step", async () => {
  await mount();
  expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
  await input("[name=businessName]", "My unfinished building");
  const value = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
  expect(value.completed).toBe(false);
  expect(value.workspace.name).toBe("My unfinished building");
  await reopen();
  expect(
    host.querySelector<HTMLInputElement>("[name=businessName]")!.value,
  ).toBe("My unfinished building");
  expect(host.textContent).not.toContain("Continue to your building");
});
it("restores incomplete energy inputs and the correct step, including empty invalid fields", async () => {
  const value = saved();
  value.workspace.editor.limit = "";
  seed(value);
  await mount();
  expect(host.querySelector("#setup-title")!.textContent).toBe(
    "Build your energy profile",
  );
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("");
  expect(host.querySelector<HTMLInputElement>("#evEnergy")!.value).toBe("14.4");
  await input("#limit", "16.5");
  await reopen();
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("16.5");
});
it("offers Continue and persists real dashboard input/mode changes and Edit building", async () => {
  seed(saved(true));
  await mount();
  await click("Continue to your building");
  expect(host.textContent).toContain("No optimizer result has been restored");
  await click("Scenario configuration");
  await input("#limit", "19.5");
  const select = host.querySelector<HTMLSelectElement>("#analysis-choice")!;
  await act(async () => {
    select.value = "held";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  let value = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
  expect(value.workspace.editor.limit).toBe("19.5");
  expect(value.workspace.mode).toBe("ev_only");
  await click("Edit building");
  expect(
    host.querySelector<HTMLInputElement>("[name=businessName]")!.value,
  ).toBe("Northstar");
  await click("Continue to energy profile");
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("19.5");
  value = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
  expect(value.completed).toBe(false);
  expect(value.step).toBe(1);
});
it("restores inputs without replaying optimizer results, result IDs or executions", async () => {
  const value = saved(true);
  value.workspace.editor.limit = "25";
  seed(value);
  const capture = captures.requests[0];
  fetchMock.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/api/optimize")
            ? capture.response
            : { status: "ok", project: "GridPilot" },
        ),
      ),
  );
  await mount();
  await click("Continue to your building");
  await click("Run optimization");
  // Flush the existing lazy comparison module, without starting another request.
  await act(async () => {
    await import("./components/dashboard/Comparison");
  });
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/optimize"),
    ),
  ).toHaveLength(1);
  const raw = localStorage.getItem(WORKSPACE_KEY)!;
  expect(raw).not.toContain("result_id");
  expect(raw).not.toContain("optimized_demand_kw");
  expect(raw).not.toContain("operating_plan");
  await reopen();
  expect(host.textContent).toContain("No optimizer result has been restored");
  expect(
    host.querySelector('[aria-label="Device operating schedule"]'),
  ).toBeNull();
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/optimize"),
    ),
  ).toHaveLength(1);
});
it.each(["{bad", JSON.stringify({ version: 99 })])(
  "keeps unreadable/unsupported storage untouched and supports explicit recovery",
  async (raw) => {
    localStorage.setItem(WORKSPACE_KEY, raw);
    await mount();
    expect(host.textContent).toContain("Saved workspace needs attention");
    expect(host.textContent).toContain("has not been replaced");
    expect(host.querySelector("[name=businessName]")).toBeNull();
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
    await click("Continue without saving");
    await input("[name=businessName]", "Temporary building");
    expect(host.textContent).toContain("Working without saving");
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
  },
);
it("preserves current inputs when writing fails and does not falsely report clearing", async () => {
  const value = saved();
  seed(value);
  await mount();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  await input("#limit", "18.5");
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("18.5");
  expect(host.textContent).toContain("Changes could not be saved");
  expect(
    JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).workspace.editor.limit,
  ).toBe("17");
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  await click("Clear saved workspace");
  await click("Clear workspace");
  expect(host.textContent).toContain("could not be cleared");
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("18.5");
});
it("works in session memory after a read failure without overwriting inaccessible saved inputs", async () => {
  const original = JSON.stringify(saved());
  localStorage.setItem(WORKSPACE_KEY, original);
  const denied = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("SecurityError");
    });
  await mount();
  expect(host.textContent).toContain("Browser storage is unavailable");
  denied.mockRestore();
  await input("[name=businessName]", "Temporary input");
  expect(localStorage.getItem(WORKSPACE_KEY)).toBe(original);
});
it("confirms clearing, removes only this saved workspace and stays cleared on reopening", async () => {
  seed(saved(true));
  localStorage.setItem("unrelated", "keep");
  await mount();
  await click("Clear saved workspace");
  await click("Keep workspace");
  expect(localStorage.getItem(WORKSPACE_KEY)).not.toBeNull();
  await click("Clear saved workspace");
  await click("Clear workspace");
  expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
  expect(localStorage.getItem("unrelated")).toBe("keep");
  expect(
    host.querySelector<HTMLInputElement>("[name=businessName]")!.value,
  ).toBe("");
  await reopen();
  expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
});
it("labels demo workspaces and requires explicit replacement of existing saved inputs", async () => {
  seed(saved(true));
  await mount();
  await click("Explore demo");
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).workspace.name).toBe(
    "Northstar",
  );
  await click("Keep workspace");
  await click("Explore demo");
  await click("Replace with demonstration");
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).workspace).toEqual(
    demoWorkspace(),
  );
  expect(host.textContent).toContain("Demonstration workspace");
  await reopen();
  expect(host.textContent).toContain("Demonstration workspace");
});
it("retains edited advisor business context without storing its conversation", async () => {
  seed(saved(true));
  await mount();
  await click("Continue to your building");
  await click("AI assistant");
  await input(".advisor-fields label:nth-child(2) input", "43");
  await input(".advisor-fields label:nth-child(6) input", "Warehouse vans");
  const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
  expect(stored.workspace.businessContext.employee_count).toBe(43);
  expect(stored.workspace.businessContext.equipment).toBe("Warehouse vans");
  expect(stored).not.toHaveProperty("history");
  await reopen();
  await click("AI assistant");
  expect(
    host.querySelector<HTMLInputElement>(
      ".advisor-fields label:nth-child(2) input",
    )!.value,
  ).toBe("43");
  expect(
    host.querySelector<HTMLInputElement>(
      ".advisor-fields label:nth-child(6) input",
    )!.value,
  ).toBe("Warehouse vans");
  expect(host.querySelector("[role=log]")!.textContent).toBe("");
});
it("keeps saved context consistent with explicit setup edits without dropping other profile fields", async () => {
  const value = saved(true);
  value.workspace.businessContext = {
    employee_count: 42,
    equipment: "Warehouse vans",
  };
  seed(value);
  await mount();
  await click("Edit building");
  const inputElement = host.querySelector<HTMLInputElement>(
    'input[type=number][max="10000000"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(inputElement, "44");
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).workspace.businessContext,
  ).toMatchObject({ employee_count: 44, equipment: "Warehouse vans" });
});
it("does not hide session-only edits if clearing the original unreadable record fails", async () => {
  const raw = JSON.stringify({ version: 99 });
  localStorage.setItem(WORKSPACE_KEY, raw);
  await mount();
  await click("Continue without saving");
  await input("[name=businessName]", "Working copy");
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  await click("Clear saved workspace");
  await click("Clear workspace");
  expect(
    host.querySelector<HTMLInputElement>("[name=businessName]")!.value,
  ).toBe("Working copy");
  expect(host.textContent).not.toContain("Saved workspace needs attention");
  expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
});

it("guards dashboard deep links until setup is complete without replacing saved inputs", async () => {
  seed(saved(false));
  window.history.replaceState(null, "", "#/building/whatif");
  await mount();
  expect(host.textContent).toContain("Finish or resume your building setup");
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("17");
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).completed).toBe(
    false,
  );
});
it("restores a dashboard section directly, handles history and Home Continue without replaying a solve", async () => {
  seed(saved(true));
  window.history.replaceState(null, "", "#/building/configuration");
  await mount();
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("17");
  expect(host.textContent).toContain("No optimizer result has been restored");
  await click("AI assistant");
  expect(location.hash).toBe("#assistant");
  await act(async () => {
    history.replaceState(null, "", "#configuration");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("17");
  await act(async () => {
    history.replaceState(null, "", "#home");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await click("Continue to your building");
  expect(location.hash).toBe("#overview");
  expect(
    fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/optimize")),
  ).toHaveLength(0);
});

function fixedResult(s: import("./types/api").Scenario) {
  const demand = s.fixed_demand_kw;
  const cost = demand.reduce(
    (total, v, h) => total + v * s.electricity_prices_usd_per_kwh[h],
    0,
  );
  return {
    result_id: "setup-execution",
    feasibility_status: "feasible",
    baseline_electricity_cost_usd: cost,
    optimized_electricity_cost_usd: cost,
    baseline_peak_demand_kw: Math.max(...demand),
    optimized_peak_demand_kw: Math.max(...demand),
    baseline_demand_kw: demand,
    optimized_demand_kw: demand,
    constraint_violations: [],
  };
}
it("starts exactly one event-driven setup calculation in Strict Mode and opens populated overview", async () => {
  const value = saved();
  value.step = 3;
  value.workspace.editor = {
    ...value.workspace.editor,
    analysisChoice: "building",
    demandProfile: { mode: "custom", values: Array(24).fill("0") },
    offPeak: "0",
    peak: "0",
  };
  seed(value);
  let resolve!: (r: Response) => void;
  fetchMock.mockImplementation((url: string) =>
    String(url).includes("/api/optimize")
      ? new Promise((r) => {
          resolve = r;
        })
      : Promise.resolve(
          new Response(JSON.stringify({ status: "ok", project: "GridPilot" })),
        ),
  );
  await mount();
  const submit = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Create workspace and calculate"),
  )!;
  await act(async () => {
    submit.click();
    submit.click();
  });
  const requests = fetchMock.mock.calls.filter(([u]) =>
    String(u).includes("/api/optimize"),
  );
  expect(requests).toHaveLength(1);
  expect(location.hash).toBe("#overview");
  expect(host.textContent).toContain("Calculating your submitted scenario");
  const scenario = JSON.parse(requests[0][1].body);
  expect(scenario.ev_requirements).toEqual([]);
  expect(scenario.flexible_equipment).toEqual([]);
  expect(scenario.fixed_demand_kw).toEqual(Array(24).fill(0));
  expect(requests[0][0]).toContain("scheduling_mode=joint");
  await act(async () =>
    resolve(new Response(JSON.stringify(fixedResult(scenario)))),
  );
  expect(location.hash).toBe("#overview");
  expect(host.textContent).toContain("No schedulable equipment is configured");
  expect(host.textContent).toContain("0.0 kWh");
  expect(host.textContent).not.toContain("Calculating your submitted scenario");
  expect(
    JSON.stringify(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!)),
  ).not.toContain("setup-execution");
  expect(
    fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/ai/")),
  ).toHaveLength(0);
  await reopen();
  expect(
    fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/optimize")),
  ).toHaveLength(1);
  expect(host.textContent).toContain("No optimizer result has been restored");
});
it("keeps late setup results tied to their snapshot and recalculates only on explicit Run", async () => {
  const value = saved();
  value.step = 3;
  value.workspace.editor.analysisChoice = "building";
  seed(value);
  let resolve!: (r: Response) => void;
  let scenario: import("./types/api").Scenario;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (!String(url).includes("/api/optimize"))
      return Promise.resolve(
        new Response(JSON.stringify({ status: "ok", project: "GridPilot" })),
      );
    scenario = JSON.parse(init.body as string);
    return new Promise((r) => {
      resolve = r;
    });
  });
  await mount();
  await click("Create workspace and calculate");
  const original = scenario!;
  await click("Scenario configuration");
  await input("#limit", "12");
  await act(async () =>
    resolve(new Response(JSON.stringify(fixedResult(original)))),
  );
  await click("Energy overview");
  expect(host.textContent).toContain("Inputs changed");
  expect(
    host.querySelector('[aria-label="Submitted snapshot"]')!.textContent,
  ).toContain("17 kW");
  expect(
    host.querySelector('[aria-label="Editable draft"]')!.textContent,
  ).toContain("12 kW");
  await click("Run optimization");
  expect(scenario!.building_max_demand_kw).toBe(12);
  await act(async () =>
    resolve(new Response(JSON.stringify(fixedResult(scenario)))),
  );
  expect(
    fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/optimize")),
  ).toHaveLength(2);
});
it("reports setup solver failure with preserved inputs and explicit retry, never infeasibility", async () => {
  const value = saved();
  value.step = 3;
  value.workspace.editor.analysisChoice = "building";
  seed(value);
  fetchMock.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes("/api/optimize")
            ? { detail: { code: "unavailable" } }
            : { status: "ok", project: "GridPilot" },
        ),
        { status: String(url).includes("/api/optimize") ? 503 : 200 },
      ),
  );
  await mount();
  await click("Create workspace and calculate");
  expect(host.textContent).toContain("Feasibility was not determined");
  expect(host.textContent).not.toContain("No feasible schedule");
  await click("Scenario configuration");
  expect(host.querySelector<HTMLInputElement>("#limit")!.value).toBe("17");
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Run optimization",
    )!.disabled,
  ).toBe(false);
});
it.each(["mode", "leave"] as const)(
  "does not apply a late setup reply after %s changes",
  async (change) => {
    const value = saved();
    value.step = 3;
    value.workspace.editor.analysisChoice = "building";
    seed(value);
    let resolve!: (r: Response) => void,
      scenario!: import("./types/api").Scenario;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (!String(url).includes("/api/optimize"))
        return Promise.resolve(
          new Response(JSON.stringify({ status: "ok", project: "GridPilot" })),
        );
      scenario = JSON.parse(init.body as string);
      return new Promise((r) => {
        resolve = r;
      });
    });
    await mount();
    await click("Create workspace and calculate");
    if (change === "mode") await input("#analysis-choice", "ev");
    else
      await act(async () => {
        history.pushState(null, "", "#home");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    await act(async () =>
      resolve(new Response(JSON.stringify(fixedResult(scenario)))),
    );
    if (change === "leave") await click("Continue to your building");
    expect(host.querySelector('[aria-label="Submitted snapshot"]')).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/optimize")),
    ).toHaveLength(1);
  },
);
