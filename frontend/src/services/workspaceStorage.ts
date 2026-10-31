import { defaultEditor, sourceCategories } from "../data/demoScenario";
import type { SavedWorkspace, WorkspaceSetup } from "../types/workspace";

export const WORKSPACE_KEY = "gridpilot.building-workspace";
export const WORKSPACE_VERSION = 1;
export const workspaceGoals = [
  "Reduce energy costs",
  "Manage peak demand",
  "Improve operating flexibility",
  "Plan vehicle charging",
  "Understand energy use",
];
export const businessTypes = [
  "Office",
  "Warehouse & logistics",
  "Retail",
  "Manufacturing",
  "Hospitality",
  "Other commercial building",
];
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReadWorkspace = {
  status: "empty" | "saved" | "invalid" | "outdated" | "unavailable";
  record: SavedWorkspace | null;
};

export function emptyWorkspace(): WorkspaceSetup {
  return {
    kind: "building",
    name: "",
    businessType: "",
    employees: "",
    monthlyBill: "",
    goals: workspaceGoals.slice(0, 2),
    editor: { ...defaultEditor },
    mode: "joint",
  };
}
export function demoWorkspace(): WorkspaceSetup {
  return {
    kind: "demo",
    name: "Demonstration building",
    businessType: "Synthetic commercial example",
    employees: "",
    monthlyBill: "",
    goals: [],
    editor: { ...defaultEditor },
    mode: "joint",
  };
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  return (
    required.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every(
      (k) => required.includes(k) || optional.includes(k),
    )
  );
}
function text(value: unknown, max = 100): value is string {
  return typeof value === "string" && value.length <= max;
}
function numericDraft(value: unknown): value is string {
  return (
    text(value) &&
    (value === "" || (value.trim() !== "" && Number.isFinite(Number(value))))
  );
}
function hours(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 24 &&
    value.every((v) => numericDraft(v))
  );
}
function choice(value: unknown, options: readonly string[]) {
  return typeof value === "string" && options.includes(value);
}
function editor(value: unknown): boolean {
  if (
    !object(value) ||
    !keys(value, Object.keys(defaultEditor), ["demandProfile"]) ||
    !Object.keys(defaultEditor).every((k) => numericDraft(value[k]))
  )
    return false;
  if (!Object.hasOwn(value, "demandProfile")) return true;
  const profile = value.demandProfile;
  if (
    !object(profile) ||
    !keys(profile, ["mode", "values"], ["sources"]) ||
    !choice(profile.mode, ["demo", "custom", "sources"]) ||
    !hours(profile.values)
  )
    return false;
  if (profile.sources !== undefined) {
    if (
      !Array.isArray(profile.sources) ||
      profile.sources.length > sourceCategories.length
    )
      return false;
    const categories = new Set();
    for (const source of profile.sources) {
      if (
        !object(source) ||
        !keys(source, ["category", "values"]) ||
        !choice(source.category, sourceCategories) ||
        categories.has(source.category) ||
        !hours(source.values)
      )
        return false;
      categories.add(source.category);
    }
  }
  return true;
}
export function isSavedWorkspace(value: unknown): value is SavedWorkspace {
  if (
    !object(value) ||
    !keys(value, ["version", "workspace", "step", "completed"]) ||
    value.version !== WORKSPACE_VERSION ||
    !Number.isInteger(value.step) ||
    Number(value.step) < 0 ||
    Number(value.step) > 3 ||
    typeof value.completed !== "boolean"
  )
    return false;
  const w = value.workspace;
  if (
    !object(w) ||
    !keys(
      w,
      [
        "kind",
        "name",
        "businessType",
        "employees",
        "monthlyBill",
        "goals",
        "editor",
        "mode",
      ],
      ["businessContext"],
    ) ||
    !choice(w.kind, ["building", "demo"]) ||
    !text(w.name) ||
    !text(w.businessType, 120) ||
    !numericDraft(w.employees) ||
    !numericDraft(w.monthlyBill) ||
    !choice(w.mode, ["ev_only", "joint"]) ||
    !editor(w.editor)
  )
    return false;
  if (w.businessContext !== undefined) {
    const c = w.businessContext;
    const limits: Record<string, number> = {
      business_type: 120,
      operating_hours: 200,
      electricity_cost_and_period: 200,
      consumption_and_units: 200,
      equipment: 500,
      goals: 500,
      restrictions: 500,
    };
    if (
      !object(c) ||
      !Object.keys(c).every(
        (k) => k === "employee_count" || Object.hasOwn(limits, k),
      )
    )
      return false;
    for (const [k, v] of Object.entries(c)) {
      if (v === null) continue;
      if (
        k === "employee_count"
          ? typeof v !== "number" || !Number.isFinite(v)
          : !text(v, limits[k])
      )
        return false;
    }
  }
  if (
    w.businessType !== "" &&
    !businessTypes.includes(w.businessType) &&
    !(w.kind === "demo" && w.businessType === "Synthetic commercial example")
  )
    return false;
  if (
    !Array.isArray(w.goals) ||
    w.goals.length > 3 ||
    new Set(w.goals).size !== w.goals.length ||
    !w.goals.every((g) => workspaceGoals.includes(g))
  )
    return false;
  // A created building may contain later, temporarily invalid scenario edits.
  // Validate representation here, leaving engineering validation to validateEditor.
  if (
    value.completed &&
    (value.step !== 3 || !w.name.trim() || !w.businessType)
  )
    return false;
  if (value.completed) {
    const employees = w.employees.trim();
    const bill = w.monthlyBill.trim();
    if (
      w.employees !== "" &&
      (!employees ||
        !Number.isInteger(Number(employees)) ||
        Number(employees) < 0 ||
        Number(employees) > 10000000)
    )
      return false;
    if (
      w.monthlyBill !== "" &&
      (!bill || !Number.isFinite(Number(bill)) || Number(bill) < 0)
    )
      return false;
  }
  return true;
}
export function decodeWorkspace(raw: string | null): ReadWorkspace {
  if (raw === null) return { status: "empty", record: null };
  if (raw.length > 200_000) return { status: "invalid", record: null };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      object(value) &&
      Number.isInteger(value.version) &&
      value.version !== WORKSPACE_VERSION
    )
      return { status: "outdated", record: null };
    return isSavedWorkspace(value)
      ? { status: "saved", record: value }
      : { status: "invalid", record: null };
  } catch {
    return { status: "invalid", record: null };
  }
}
export function readWorkspace(storage?: StoragePort): ReadWorkspace {
  try {
    return decodeWorkspace(
      (storage ?? window.localStorage).getItem(WORKSPACE_KEY),
    );
  } catch {
    return { status: "unavailable", record: null };
  }
}
export function writeWorkspace(
  record: SavedWorkspace,
  storage?: StoragePort,
): boolean {
  try {
    if (!isSavedWorkspace(record)) return false;
    (storage ?? window.localStorage).setItem(
      WORKSPACE_KEY,
      JSON.stringify(record),
    );
    return true;
  } catch {
    return false;
  }
}
export function removeWorkspace(storage?: StoragePort): boolean {
  try {
    (storage ?? window.localStorage).removeItem(WORKSPACE_KEY);
    return true;
  } catch {
    return false;
  }
}
