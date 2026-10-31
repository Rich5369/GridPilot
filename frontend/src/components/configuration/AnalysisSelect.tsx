import {
  analysisOptions,
  selectedAnalysis,
  effectiveMode,
} from "../../data/analysisOptions";
import type { ScenarioEditor, AnalysisChoice } from "../../types/dashboard";
import type { SchedulingMode } from "../../services/api";
export function AnalysisSelect({
  editor,
  mode,
  onChange,
  id = "analysis-choice",
  describedBy,
}: {
  editor: ScenarioEditor;
  mode: SchedulingMode;
  onChange: (editor: ScenarioEditor, mode: SchedulingMode) => void;
  id?: string;
  describedBy?: string;
}) {
  const selected = selectedAnalysis(editor, mode);
  return (
    <div className="field analysis-select">
      <label htmlFor={id}>What would you like to analyze?</label>
      <select
        id={id}
        value={selected}
        aria-describedby={[`${id}-description`, describedBy]
          .filter(Boolean)
          .join(" ")}
        onChange={(e) => {
          const next = {
            ...editor,
            analysisChoice: e.target.value as AnalysisChoice,
          };
          onChange(next, effectiveMode(next, mode));
        }}
      >
        {analysisOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p id={`${id}-description`} className="field-hint">
        {analysisOptions.find((o) => o.value === selected)!.description}
      </p>
    </div>
  );
}
