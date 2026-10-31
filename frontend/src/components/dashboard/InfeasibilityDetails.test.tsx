// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import local from "../../../../docs/verification/e2-local-http.json";
import { Comparison } from "./Comparison";
import { isOptimizationResult, optimizeScenario } from "../../services/api";
import {
  matchesEvidence,
  evidenceTitles,
} from "../../services/infeasibilityEvidence";
import type { OptimizationResult, Scenario } from "../../types/api";
vi.mock("../DemandChart", () => ({ DemandChart: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cases = local.cases as {
  name: string;
  scheduling_mode: "joint" | "ev_only";
  scenario: Scenario;
  response: OptimizationResult;
}[];
it.each(cases.map((c) => [c.name + " " + c.scheduling_mode, c] as const))(
  "accepts and renders actual captured backend evidence: %s",
  async (_, c) => {
    expect(isOptimizationResult(c.response)).toBe(true);
    expect(matchesEvidence(c.response, c.scenario, c.scheduling_mode)).toBe(
      true,
    );
    const host = document.createElement("div"),
      root = createRoot(host);
    try {
      await act(async () =>
        root.render(<Comparison result={c.response} stale={true} />),
      );
      const evidence = c.response.infeasibility_evidence ?? [];
      expect(host.querySelectorAll(".evidence-card")).toHaveLength(
        evidence.length,
      );
      for (const [i, e] of evidence.entries()) {
        const card = host.querySelectorAll(".evidence-card")[i];
        expect(card.textContent).toContain(evidenceTitles[e.code]);
        expect(card.textContent).toContain(e.message);
        if (e.unit) {
          expect(
            card.querySelector("[data-quantity=required]")!.textContent,
          ).toBe(`${e.required} ${e.unit}`);
          expect(
            card.querySelector("[data-quantity=available]")!.textContent,
          ).toBe(`${e.available} ${e.unit}`);
          expect(card.textContent).toContain("end excluded");
        } else {
          expect(card.querySelector("[data-quantity]")).toBeNull();
          expect(card.textContent).toContain(
            "No specific analytical certificate",
          );
        }
        for (const d of e.devices)
          expect(card.textContent).toContain(d.device_id);
      }
      if (evidence.length) {
        expect(host.textContent).toContain("Previous submitted result");
        expect(host.textContent).toContain("do not add their shortfalls");
        expect(host.textContent).toContain(c.response.constraint_violations[0]);
        expect(host.textContent).not.toContain(
          "lower energy charges for this day",
        );
      }
    } finally {
      await act(async () => root.unmount());
    }
  },
);
const certificate = cases.find((c) =>
  c.response.infeasibility_evidence?.some(
    (e) => e.code === "device_window_capacity",
  ),
)!;
it.each([
  { unit: "kW" },
  { required: NaN },
  { available: -1 },
  { proof_source: "guessed" },
  { window: { start_hour: 0, end_hour: 25 } },
  { devices: [{ device_type: "hvac", device_id: "x" }] },
  { context: { scheduling_mode: "joint", tolerance: -1 } },
])("rejects malformed evidence: %j", (patch) => {
  const e = certificate.response.infeasibility_evidence![0];
  expect(
    isOptimizationResult({
      ...certificate.response,
      infeasibility_evidence: [{ ...e, ...patch }],
    }),
  ).toBe(false);
});
it("rejects evidence tied to another submitted mode or device before accepting HTTP results", async () => {
  for (const change of [
    {
      context: {
        ...certificate.response.infeasibility_evidence![0].context,
        scheduling_mode:
          certificate.scheduling_mode === "joint" ? "ev_only" : "joint",
      },
    },
    { devices: [{ device_type: "ev", device_id: "another-submission" }] },
  ]) {
    const body = {
      ...certificate.response,
      infeasibility_evidence: [
        { ...certificate.response.infeasibility_evidence![0], ...change },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
    );
    try {
      await expect(
        optimizeScenario(certificate.scenario, certificate.scheduling_mode),
      ).rejects.toThrow("No result was accepted");
    } finally {
      vi.unstubAllGlobals();
    }
  }
});
it("preserves legacy reasons and distinguishes baseline violations from infeasible optimization", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    const legacy = {
      ...certificate.response,
      infeasibility_evidence: undefined,
    };
    await act(async () =>
      root.render(<Comparison result={legacy} stale={false} />),
    );
    expect(host.textContent).toContain(legacy.constraint_violations[0]);
    expect(host.querySelector(".infeasibility-details")).toBeNull();
    const feasible = cases.find(
      (c) =>
        c.response.feasibility_status === "feasible" &&
        c.response.operating_plan!.baseline_constraint_violations.length,
    )!.response;
    await act(async () =>
      root.render(<Comparison result={feasible} stale={false} />),
    );
    expect(host.querySelector(".infeasibility-details")).toBeNull();
    expect(host.textContent).not.toContain("cannot be met");
  } finally {
    await act(async () => root.unmount());
  }
});
