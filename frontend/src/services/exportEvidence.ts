import type { Scenario, OptimizationResult } from "../types/api";
import type { CustomEquipment } from "../types/dashboard";
import type { SchedulingMode } from "./api";
/** Full-precision submitted evidence; UI metadata never changes the API payload. */
export function exportEvidence(
  scenario: Scenario | null,
  result: OptimizationResult,
  mode: SchedulingMode,
  customEquipment?: CustomEquipment,
) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          scheduling_mode: mode,
          submitted_scenario: scenario,
          response: result,
          ...(customEquipment ? { device_metadata: [customEquipment] } : {}),
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "gridpilot-submitted-operating-plan.json";
  a.click();
  URL.revokeObjectURL(url);
}
