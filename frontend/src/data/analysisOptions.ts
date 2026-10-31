import type { ScenarioEditor, AnalysisChoice } from "../types/dashboard";
import type { SchedulingMode } from "../services/api";
export const analysisOptions = [
  {
    value: "building",
    label: "Building electricity only",
    description:
      "Analyze fixed hourly demand and electricity charges; no EVs or schedulable equipment.",
  },
  {
    value: "flexible",
    label: "Flexible equipment only",
    description:
      "Schedule interruptible equipment within its available hours; no EV charging.",
  },
  {
    value: "ev",
    label: "EV charging only",
    description: "Schedule EV charging; no flexible equipment is submitted.",
  },
  {
    value: "joint",
    label: "EV charging and flexible equipment",
    description:
      "Schedule EVs and interruptible equipment together under the site limit.",
  },
  {
    value: "held",
    label: "Advanced: hold equipment at baseline (EV-only mode)",
    description:
      "Schedule EVs while configured flexible equipment retains its baseline schedule.",
  },
] as const;
export const includesEV = (e: ScenarioEditor) =>
  e.analysisChoice
    ? ["ev", "joint", "held"].includes(e.analysisChoice)
    : e.chargers.trim() === "" || Number(e.chargers) !== 0;
export const includesFlexible = (e: ScenarioEditor) =>
  e.analysisChoice
    ? ["flexible", "joint", "held"].includes(e.analysisChoice)
    : e.duration.trim() === "" || Number(e.duration) !== 0;
export function selectedAnalysis(
  e: ScenarioEditor,
  mode: SchedulingMode,
): AnalysisChoice {
  if (e.analysisChoice) return e.analysisChoice;
  return includesEV(e)
    ? includesFlexible(e)
      ? mode === "ev_only"
        ? "held"
        : "joint"
      : "ev"
    : includesFlexible(e)
      ? mode === "ev_only"
        ? "held"
        : "flexible"
      : "building";
}
export function effectiveMode(
  e: ScenarioEditor,
  legacy: SchedulingMode,
): SchedulingMode {
  return e.analysisChoice
    ? ["ev", "held"].includes(e.analysisChoice)
      ? "ev_only"
      : "joint"
    : legacy;
}
export function analysisLabel(e: ScenarioEditor, mode: SchedulingMode) {
  return analysisOptions.find((o) => o.value === selectedAnalysis(e, mode))!
    .label;
}
