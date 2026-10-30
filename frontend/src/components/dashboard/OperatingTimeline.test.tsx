// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import examples from "../../../../docs/verification/device-operating-plan-examples.json";
import { OperatingTimeline } from "./OperatingTimeline";
import type { OptimizationResult, Scenario } from "../../types/api";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("preserves exact response power, exposes stale and violating baselines, and never claims unproved optimality", async () => {
  const record = examples.responses[1];
  const r = structuredClone(record.response) as OptimizationResult;
  const container = document.createElement("div"),
    root = createRoot(container);
  const render = async () =>
    act(async () =>
      root.render(
        <OperatingTimeline
          result={r}
          scenario={record.request as Scenario}
          mode="joint"
          stale
        />,
      ),
    );
  await render();
  expect(container.textContent).toContain("PREVIOUS SCENARIO · STALE");
  expect(container.querySelectorAll(".hour-cell")).toHaveLength(
    r.operating_plan!.device_schedules.length * 24,
  );
  expect(container.textContent).toContain("2 / 2 kWh");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Baseline")!
      .click(),
  );
  expect(container.textContent).toContain("not compliant");
  r.operating_plan!.solver_status = "feasible";
  r.operating_plan!.primary_status = "feasible";
  r.operating_plan!.primary_optimum_usd = null;
  r.operating_plan!.peak_tiebreak_status = "not_run";
  await render();
  expect(container.textContent).toContain("optimum unproved");
  expect(container.textContent).not.toContain("Optimum proved");
  delete r.operating_plan;
  await render();
  expect(container.textContent).toContain("older response");
  await act(async () => root.unmount());
});
it("shows null optimized schedules as unavailable and preserves held roles and warnings", async () => {
  const container = document.createElement("div"),
    root = createRoot(container);
  const r = structuredClone(
    examples.responses[0].response,
  ) as OptimizationResult;
  r.operating_plan!.warnings = [
    "Peak proof unavailable: retained verified primary result.",
  ];
  await act(async () =>
    root.render(
      <OperatingTimeline
        result={r}
        scenario={examples.responses[0].request as Scenario}
        mode="ev_only"
        stale={false}
      />,
    ),
  );
  expect(container.textContent).toContain("Held at baseline");
  expect(container.textContent).toContain(
    "Peak proof unavailable: retained verified primary result.",
  );
  expect(container.textContent).toContain(
    "No optimized device instructions available",
  );
  expect(
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Optimized",
    )?.disabled,
  ).toBe(true);
  expect(container.textContent).toContain("not compliant");
  await act(async () => root.unmount());
});
