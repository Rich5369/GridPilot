import type { ScenarioEditor, CustomEquipment } from "../../types/dashboard";
import { includesFlexible } from "../../data/analysisOptions";
import { HourSelect } from "./HourSelect";
const empty: CustomEquipment = {
  id: "custom-equipment",
  name: "",
  description: "",
  kind: "context",
  energy: "",
  power: "",
  start: "8",
  end: "18",
  interruptible: false,
};
export function CustomEquipmentFields({
  editor,
  onChange,
  error,
}: {
  editor: ScenarioEditor;
  onChange: (e: ScenarioEditor) => void;
  error?: string;
}) {
  const c = editor.customEquipment;
  const update = (patch: Partial<CustomEquipment>) =>
    onChange({ ...editor, customEquipment: { ...c!, ...patch } });
  if (!c)
    return (
      <button
        type="button"
        className="secondary"
        onClick={() => onChange({ ...editor, customEquipment: { ...empty } })}
      >
        Other / custom equipment
      </button>
    );
  return (
    <fieldset className="custom-equipment" aria-describedby={error ? "custom-equipment-error" : undefined}>
      <legend>Other / custom equipment</legend>
      <div className="form-grid">
        <label>
          Equipment name
          <input
            value={c.name}
            maxLength={100}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label>
          Description (optional)
          <input
            value={c.description}
            maxLength={500}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <label>
          How should this equipment be represented?
          <select
            value={c.kind}
            onChange={(e) =>
              update({ kind: e.target.value as CustomEquipment["kind"] })
            }
          >
            <option value="context">
              Business context only / behavior not confirmed
            </option>
            <option value="fixed">
              Fixed demand · included in hourly building profile
            </option>
            <option value="schedulable">
              Potentially schedulable · interruptible model
            </option>
          </select>
        </label>
      </div>
      {c.kind === "context" && (
        <p className="field-hint">
          A name or description does not establish electricity use. This is
          retained as business context only. Provide hourly demand for a fixed
          load, or confirmed interruptible energy, power and availability to
          schedule it. Thermal HVAC, battery storage and uninterrupted process
          cycles need additional modeling support.
        </p>
      )}
      {c.kind === "fixed" && (
        <p className="field-hint">
          Enter this load in the fixed-demand profile below (combined or named
          sources). Include it exactly once: if already inside whole-building
          demand, do not add it again. This name adds no electricity demand
          automatically.
        </p>
      )}
      {c.kind === "schedulable" && (
        <>
          <p className="field-hint">
            Only interruptible, continuously adjustable grid loads are
            supported; no batteries, thermal dynamics or uninterrupted cycles.
            The model delivers the specified energy within the exclusive window.
          </p>
          <div className="form-grid">
            <label>
              Custom required energy (kWh)
              <input
                type="number"
                min="0"
                step="any"
                value={c.energy}
                onChange={(e) => update({ energy: e.target.value })}
              />
            </label>
            <label>
              Custom maximum power (kW)
              <input
                type="number"
                min="0"
                step="any"
                value={c.power}
                onChange={(e) => update({ power: e.target.value })}
              />
            </label>
            <label>
              Custom available from
              <HourSelect
                value={c.start}
                onChange={(start) => update({ start })}
              />
            </label>
            <label>
              Custom available until (exclusive)
              <HourSelect
                end
                value={c.end}
                onChange={(end) => update({ end })}
              />
            </label>
          </div>
          <label className="custom-confirm">
            <input
              type="checkbox"
              checked={c.interruptible}
              onChange={(e) => update({ interruptible: e.target.checked })}
            />
            I confirm this equipment can pause and vary its power within these
            hours.
          </label>
          {!includesFlexible(editor) && (
            <p role="status">
              Not submitted in the selected analysis. Select Flexible equipment
              only or EV charging and flexible equipment to include this draft.
            </p>
          )}
          <p className="field-hint">
            The standard equipment block is separate. Set its duration to 0 if
            this custom device is your only schedulable equipment.
          </p>
        </>
      )}
      {error && (
        <p id="custom-equipment-error" className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const next = { ...editor };
          delete next.customEquipment;
          onChange(next);
        }}
      >
        Remove custom equipment
      </button>
    </fieldset>
  );
}
