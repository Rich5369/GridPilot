// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Setup } from "./Setup";
import { toScenario } from "../data/demoScenario";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const complete = vi.fn(),
  demo = vi.fn();
beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  complete.mockReset();
  demo.mockReset();
  await act(async () =>
    root.render(<Setup onComplete={complete} onDemo={demo} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function change(selector: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  )!;
  const prototype =
    element.tagName === "SELECT"
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function company() {
  await change("[name=businessName]", "Northstar Logistics");
  await change(".setup-fields select", "Warehouse & logistics");
  await change("#setup-analysis-choice", "joint");
  await click("Continue to energy profile");
}
it("completes setup with original fractional energy, edited inputs and bounded goals", async () => {
  await company();
  // Existing engineering validation accepts fractional energy. Native integer
  // input steps must not block the reused configuration panel in this form.
  expect(container.querySelector("form")!.noValidate).toBe(true);
  await change("#limit", "15");
  await change("#arrival", "15");
  await change("#deadline", "22");
  await click("Continue to your goals");
  await click("Improve operating flexibility");
  expect(
    [...container.querySelectorAll(".goal-options button")].filter(
      (b) => b.getAttribute("aria-pressed") === "true",
    ),
  ).toHaveLength(3);
  expect(
    [
      ...container.querySelectorAll<HTMLButtonElement>(".goal-options button"),
    ].find((b) => b.textContent === "Plan vehicle charging")!.disabled,
  ).toBe(true);
  await click("Review workspace");
  expect(container.textContent).toContain(
    "submits these reviewed energy inputs once",
  );
  await click("Create workspace and calculate");
  expect(complete).toHaveBeenCalledTimes(1);
  const setup = complete.mock.calls[0][0];
  const scenario = toScenario(setup.editor);
  expect(setup.name).toBe("Northstar Logistics");
  expect(setup.mode).toBe("joint");
  expect(scenario.building_max_demand_kw).toBe(15);
  expect(scenario.ev_requirements).toHaveLength(2);
  expect(scenario.ev_requirements[0]).toMatchObject({
    energy_required_kwh: 14.4,
    arrival_hour: 15,
    deadline_hour: 22,
  });
});
it("blocks invalid windows and resets energy inputs without submitting the setup step", async () => {
  await company();
  await change("#deadline", "7");
  await click("Continue to your goals");
  expect(container.querySelector("[role=alert]")!.textContent).toContain(
    "Check the energy profile",
  );
  expect(complete).not.toHaveBeenCalled();
  await click("Reset to Default Scenario");
  expect(container.querySelector("#setup-title")!.textContent).toBe(
    "Build your energy profile",
  );
  await click("Continue to your goals");
  expect(container.querySelector("#setup-title")!.textContent).toBe(
    "What matters most to you?",
  );
});
it("offers an explicit demonstration without creating a business workspace", async () => {
  await click("Explore demo");
  expect(demo).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
});
