import type { ScenarioEditor } from "./dashboard";
import type { SchedulingMode } from "../services/api";

export interface WorkspaceSetup {
  kind: "building" | "demo";
  businessContext?: Record<string, string | number | null>;
  name: string;
  businessType: string;
  employees: string;
  monthlyBill: string;
  goals: string[];
  editor: ScenarioEditor;
  mode: SchedulingMode;
}

// Inputs only. Backend executions, result IDs and advisor conversations are not durable.
export interface SavedWorkspace {
  version: 1;
  workspace: WorkspaceSetup;
  step: number;
  completed: boolean;
}
