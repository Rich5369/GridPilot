import { describe, expect, it } from "vitest";
import examples from "../../../docs/verification/device-operating-plan-examples.json";
import { isOptimizationResult } from "./api";
import { matchesSubmittedPlan } from "./operatingPlan";
import type { OptimizationResult, Scenario } from "../types/api";
const records = examples.responses as unknown as {
  response: OptimizationResult;
  request: Scenario;
  scheduling_mode: "ev_only" | "joint";
}[];
describe("actual E1 HTTP contracts", () => {
  for (const [i, record] of records.entries())
    it(`accepts and reconciles captured result ${i}`, () => {
      expect(isOptimizationResult(record.response)).toBe(true);
      expect(
        matchesSubmittedPlan(
          record.response,
          record.request,
          record.scheduling_mode,
        ),
      ).toBe(true);
    });
  const good = records.find(
    (r) => r.response.feasibility_status === "feasible",
  )!;
  it("rejects corrupt arrays, energy, proof, windows and duplicate identities", () => {
    const changes = [
      (r: OptimizationResult) => {
        r.operating_plan!.device_schedules[0].optimized_power_kw![0] += 0.1;
      },
      (r: OptimizationResult) => {
        r.operating_plan!.device_schedules[0].optimized_delivered_energy_kwh! += 0.1;
      },
      (r: OptimizationResult) => {
        r.operating_plan!.primary_status = "feasible";
      },
      (r: OptimizationResult) => {
        r.operating_plan!.device_schedules[0].available_hours.end_hour = 25;
      },
      (r: OptimizationResult) => {
        r.operating_plan!.device_schedules.push(
          r.operating_plan!.device_schedules[0],
        );
      },
    ];
    for (const change of changes) {
      const r = structuredClone(good.response);
      change(r);
      expect(isOptimizationResult(r)).toBe(false);
    }
  });
  it("rejects mode, identity, fixed-demand and tariff provenance mismatches", () => {
    expect(
      matchesSubmittedPlan(
        good.response,
        good.request,
        good.scheduling_mode === "joint" ? "ev_only" : "joint",
      ),
    ).toBe(false);
    for (const mutate of [
      (s: Scenario) => {
        s.ev_requirements[0].id = "wrong";
      },
      (s: Scenario) => {
        s.fixed_demand_kw[0] += 1;
      },
      (s: Scenario) => {
        s.electricity_prices_usd_per_kwh[0] += 1;
      },
    ]) {
      const s = structuredClone(good.request);
      mutate(s);
      expect(matchesSubmittedPlan(good.response, s, good.scheduling_mode)).toBe(
        false,
      );
    }
  });
  it("accepts legacy responses and feasible but unproved incumbents", () => {
    const r = structuredClone(good.response);
    r.operating_plan!.solver_status = "feasible";
    r.operating_plan!.primary_status = "feasible";
    r.operating_plan!.primary_optimum_usd = null;
    r.operating_plan!.peak_tiebreak_status = "not_run";
    expect(isOptimizationResult(r)).toBe(true);
    delete r.operating_plan;
    expect(isOptimizationResult(r)).toBe(true);
  });
});
