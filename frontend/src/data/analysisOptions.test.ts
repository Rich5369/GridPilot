import { expect, it } from "vitest";
import {
  analysisOptions,
  effectiveMode,
  selectedAnalysis,
} from "./analysisOptions";
import { defaultEditor, toScenario, validateEditor } from "./demoScenario";
import type { ScenarioEditor, CustomEquipment } from "../types/dashboard";
import { emptyWorkspace, isSavedWorkspace } from "../services/workspaceStorage";
it.each([
  ["building", 0, 0, "joint"],
  ["flexible", 0, 1, "joint"],
  ["ev", 2, 0, "ev_only"],
  ["joint", 2, 1, "joint"],
  ["held", 2, 1, "ev_only"],
] as const)(
  "maps %s to existing arrays and mode",
  (analysisChoice, ev, flex, mode) => {
    const e = { ...defaultEditor, analysisChoice };
    const s = toScenario(e);
    expect(s.ev_requirements).toHaveLength(ev);
    expect(s.flexible_equipment).toHaveLength(flex);
    expect(effectiveMode(e, "ev_only")).toBe(mode);
    expect(Object.keys(s).sort()).toEqual(
      [
        "operating_hours",
        "building_max_demand_kw",
        "fixed_demand_kw",
        "electricity_prices_usd_per_kwh",
        "ev_requirements",
        "flexible_equipment",
      ].sort(),
    );
  },
);
it("preserves legacy EV-only held-equipment behavior and omits zero-energy placeholders", () => {
  expect(selectedAnalysis(defaultEditor, "ev_only")).toBe("held");
  expect(effectiveMode(defaultEditor, "ev_only")).toBe("ev_only");
  expect(
    toScenario({ ...defaultEditor, chargers: "0", duration: "0" }),
  ).toMatchObject({ ev_requirements: [], flexible_equipment: [] });
});
it("validates active fields only and does not mutate hidden drafts when switching options", () => {
  const e: ScenarioEditor = {
    ...defaultEditor,
    analysisChoice: "building",
    arrival: "",
    deadline: "",
    chargerPower: "",
    evEnergy: "",
    chargers: "",
    duration: "",
    equipmentPower: "",
    equipmentStart: "",
    equipmentEnd: "",
  };
  expect(validateEditor(e)).toEqual({});
  expect(toScenario(e).ev_requirements).toEqual([]);
  expect(toScenario(e).flexible_equipment).toEqual([]);
  expect(validateEditor({ ...e, analysisChoice: "ev" }).chargers).toBeTruthy();
  expect(
    validateEditor({ ...e, analysisChoice: "flexible" }).duration,
  ).toBeTruthy();
  const copy = { ...defaultEditor };
  for (const o of analysisOptions)
    toScenario({ ...copy, analysisChoice: o.value });
  expect(copy).toEqual(defaultEditor);
  expect(
    validateEditor({
      ...defaultEditor,
      chargers: "0",
      arrival: "",
      deadline: "",
      evEnergy: "",
      chargerPower: "",
    }),
  ).toEqual({});
});
const custom: CustomEquipment = {
  id: "custom-equipment",
  name: "Washdown pump",
  description: "Interruptible transfer",
  kind: "schedulable",
  energy: "3.75",
  power: "2.5",
  start: "12",
  end: "24",
  interruptible: true,
};
it("maps custom equipment with exact energy and stable identity, keeping metadata outside Scenario", () => {
  const e: ScenarioEditor = {
    ...defaultEditor,
    analysisChoice: "flexible",
    duration: "0",
    equipmentPower: "",
    equipmentStart: "",
    equipmentEnd: "",
    customEquipment: custom,
  };
  expect(validateEditor(e)).toEqual({});
  const s = toScenario(e);
  expect(s.ev_requirements).toEqual([]);
  expect(s.flexible_equipment).toEqual([
    {
      id: "custom-equipment",
      energy_required_kwh: 3.75,
      max_power_kw: 2.5,
      available_hours: { start_hour: 12, end_hour: 24 },
    },
  ]);
  expect(JSON.stringify(s)).not.toContain(custom.name);
  const workspace = { ...emptyWorkspace(), editor: e };
  expect(
    isSavedWorkspace({ version: 1, workspace, completed: false, step: 1 }),
  ).toBe(true);
});
it("retains context/fixed metadata without guessing loads or double-counting fixed demand", () => {
  for (const kind of ["context", "fixed"] as const) {
    const e = {
      ...defaultEditor,
      analysisChoice: "building" as const,
      customEquipment: {
        ...custom,
        kind,
        energy: "",
        power: "",
        interruptible: false,
      },
    };
    expect(validateEditor(e)).toEqual({});
    expect(toScenario(e)).toEqual(
      toScenario({ ...defaultEditor, analysisChoice: "building" }),
    );
  }
});
it.each([
  { interruptible: false },
  { energy: "" },
  { power: "0" },
  { start: "22", end: "6" },
  { start: "8.5" },
  { end: "25" },
])(
  "blocks unsupported/incomplete active schedulable equipment: %j",
  (patch) => {
    expect(
      validateEditor({
        ...defaultEditor,
        analysisChoice: "flexible",
        customEquipment: { ...custom, ...patch },
      }).customEquipment,
    ).toBeTruthy();
  },
);
