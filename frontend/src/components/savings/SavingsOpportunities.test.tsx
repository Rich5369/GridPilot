// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavingsOpportunities } from "./SavingsOpportunities";
import {
  calculateSavings,
  converseSavings,
  getSavingsCatalog,
} from "../../services/savings";
import { ApiError } from "../../services/api";
import { emptySavingsDraft, syntheticLedDraft } from "../../data/savingsDraft";
import catalog from "../../testFixtures/savingsCatalog.json";
import response from "../../../../docs/verification/savings-response.json";
import type {
  SavingsDraft,
  SavingsResponse,
  SavingsCatalog,
} from "../../types/savings";
vi.mock("../../services/savings", async (original) => ({
  ...(await original<typeof import("../../services/savings")>()),
  getSavingsCatalog: vi.fn(),
  calculateSavings: vi.fn(),
  converseSavings: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const draft = (): SavingsDraft => ({
  ...emptySavingsDraft(),
  measures: [syntheticLedDraft()],
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(getSavingsCatalog)
    .mockReset()
    .mockResolvedValue(catalog as SavingsCatalog);
  vi.mocked(calculateSavings)
    .mockReset()
    .mockResolvedValue(response as SavingsResponse);
  vi.mocked(converseSavings).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(d: SavingsDraft = draft()) {
  await act(async () => root.render(<StrictMode><SavingsOpportunities
    workspaceName="Office" initialDraft={d}
    businessProfile={{ business_type: "Office", employee_count: 43, operating_hours: "8 AM–5 PM", electricity_cost_and_period: "USD 1200/month" }}
    onScheduling={vi.fn()}
  /></StrictMode>));
}
async function click(label: string) {
  const b = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  )!;
  expect(b).toBeTruthy();
  await act(async () => b.click());
}
async function input(id: string, value: string) {
  const el = document.body.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "#" + id,
  )!;
  expect(el).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
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
it("reads catalog only on mount; explicit calculation sends profile/evidence, never Scenario or automatic AI", async () => {
  await mount();
  expect(calculateSavings).not.toHaveBeenCalled();
  expect(converseSavings).not.toHaveBeenCalled();
  await click("Calculate savings");
  expect(calculateSavings).toHaveBeenCalledTimes(1);
  const request = vi.mocked(calculateSavings).mock.calls[0][0];
  expect(request.profile).toMatchObject({
    employee_count: 43,
    operating_hours: "8 AM–5 PM",
  });
  expect(request).not.toHaveProperty("scenario");
  expect(request).not.toHaveProperty("category_applicability");
  expect(document.body.querySelector("[data-financial=net]")!.textContent).toContain(
    "$2,500.00",
  );
});
it("guards duplicate submissions, preserves corrections while pending and marks the old snapshot stale", async () => {
  let resolve!: (v: SavingsResponse) => void;
  vi.mocked(calculateSavings).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount();
  const button = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === "Calculate savings",
  )!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(calculateSavings).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain(
    "Calculating your submitted project evidence",
  );
  await input("savings-0-fixture_count", "90");
  await act(async () => resolve(response as SavingsResponse));
  expect(
    (document.body.querySelector("#savings-0-fixture_count") as HTMLInputElement).value,
  ).toBe("90");
  expect(document.body.textContent).toContain("Savings evidence changed");
  expect(
    vi.mocked(calculateSavings).mock.calls[0][0].measures![0].fixture_count,
  ).toBe(100);
});
it("cancels without losing form state and cannot accept an older reply after a newer explicit request", async () => {
  let old!: (v: SavingsResponse) => void;
  vi.mocked(calculateSavings).mockImplementationOnce(
    () =>
      new Promise((r) => {
        old = r;
      }),
  );
  await mount();
  await click("Calculate savings");
  await click("Cancel savings request");
  expect(document.body.textContent).toContain("server may still be processing");
  await click("Calculate savings");
  expect(document.body.querySelector("[data-financial=net]")!.textContent).toContain(
    "$2,500.00",
  );
  const bad = structuredClone(response) as SavingsResponse;
  bad.recommendations[0].annual_net_savings_usd = 99999;
  await act(async () => old(bad));
  expect(document.body.querySelector("[data-financial=net]")!.textContent).not.toContain(
    "99,999",
  );
  expect(converseSavings).not.toHaveBeenCalled();
});
it("shows 422 paths, retains values and makes the non-AI retry explicit", async () => {
  vi.mocked(calculateSavings).mockRejectedValueOnce(
    new ApiError(422, {
      detail: [
        {
          loc: ["body", "measures", 0, "rate", "source"],
          msg: "Review source",
        },
      ],
    }),
  );
  await mount();
  await click("Calculate savings");
  expect(document.body.textContent).toContain("HTTP 422");
  expect(document.body.textContent).toContain("Review source");
  expect(
    (document.body.querySelector("#savings-0-fixture_count") as HTMLInputElement).value,
  ).toBe("100");
  await click("Calculate savings");
  expect(calculateSavings).toHaveBeenCalledTimes(2);
});
it("lets missing measurements reach the engine but blocks nonfinite or schema-invalid fields before HTTP", async () => {
  const d = draft();
  d.measures[0].numbers.fixture_count = "";
  await mount(d);
  await click("Calculate savings");
  expect(
    vi.mocked(calculateSavings).mock.calls[0][0].measures![0].fixture_count,
  ).toBeNull();
  await input("savings-0-fixture_count", "1.5");
  await click("Calculate savings");
  expect(calculateSavings).toHaveBeenCalledTimes(1);
  expect(
    host
      .querySelector("#savings-0-fixture_count")!
      .getAttribute("aria-invalid"),
  ).toBe("true");
});
it("ignores a reply after leaving this building and keeps estimates useful if the catalog read fails", async () => {
  vi.mocked(getSavingsCatalog).mockRejectedValue(new TypeError("offline"));
  let resolve!: (v: SavingsResponse) => void;
  vi.mocked(calculateSavings).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount();
  expect(document.body.textContent).toContain("Catalog unavailable");
  await click("Calculate savings");
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => resolve(response as SavingsResponse));
  expect(document.body.querySelector(".savings-results")).toBeNull();
});

it("keeps the savings page free of the removed modal and opportunity accordion", async () => {
  await mount();
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.querySelector('#savings-conversation')).toBeNull();
  expect(document.body.textContent).not.toContain('Help me find opportunities');
  expect(document.body.textContent).not.toContain('Submit question');
  expect(document.body.textContent).toContain('Edit building summary');
  expect(document.body.textContent).toContain('How this was calculated');
  expect(converseSavings).not.toHaveBeenCalled();
  await click('Calculate savings');
  expect(calculateSavings).toHaveBeenCalledTimes(1);
});
