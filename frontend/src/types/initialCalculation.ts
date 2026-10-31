import type { Scenario, OptimizationResult } from "./api";
import type { ScenarioEditor } from "./dashboard";
import type { SchedulingMode } from "../services/api";
// Session-only handoff. The API request starts in the explicit setup submit event.
export interface InitialCalculation {
  editor: ScenarioEditor;
  scenario: Scenario;
  mode: SchedulingMode;
  promise: Promise<OptimizationResult>;
}
