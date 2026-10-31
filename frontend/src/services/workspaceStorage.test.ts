// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import {
  businessTypes,
  decodeWorkspace,
  demoWorkspace,
  emptyWorkspace,
  isSavedWorkspace,
  readWorkspace,
  removeWorkspace,
  WORKSPACE_KEY,
  writeWorkspace,
} from "./workspaceStorage";
import { sourceCategories, validateEditor } from "../data/demoScenario";
import type { SavedWorkspace } from "../types/workspace";

function record(): SavedWorkspace {
  return {
    version: 1,
    workspace: {
      ...emptyWorkspace(),
      name: "Northstar",
      businessType: businessTypes[1],
    },
    step: 1,
    completed: false,
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it("leaves missing storage empty and round-trips exact partial inputs without domain normalization", () => {
  expect(readWorkspace()).toEqual({ status: "empty", record: null });
  const value = record();
  value.workspace.editor.limit = "";
  value.workspace.editor.evEnergy = "14.4";
  value.workspace.employees = "0";
  expect(writeWorkspace(value)).toBe(true);
  expect(readWorkspace()).toEqual({ status: "saved", record: value });
  expect(
    validateEditor(readWorkspace().record!.workspace.editor).limit,
  ).toBeTruthy();
});
it("preserves all three fixed-demand representations, including incomplete named profiles", () => {
  for (const mode of ["demo", "custom", "sources"] as const) {
    const value = record();
    value.workspace.editor.demandProfile = {
      mode,
      values: Array(24).fill(""),
      sources: [
        {
          category: sourceCategories[0],
          values: Array.from({ length: 24 }, (_, i) =>
            i === 0 ? "" : String(i / 10),
          ),
        },
      ],
    };
    expect(writeWorkspace(value)).toBe(true);
    expect(readWorkspace().record).toEqual(value);
  }
});
it("retains completed inputs even when a later dashboard edit is temporarily invalid", () => {
  const value = record();
  value.completed = true;
  value.step = 3;
  value.workspace.editor.deadline = "7";
  expect(writeWorkspace(value)).toBe(true);
  expect(readWorkspace().record).toEqual(value);
});
it("requires an explicit demo identity independent of its editable building name", () => {
  const value = {
    version: 1 as const,
    workspace: { ...demoWorkspace(), name: "Renamed example" },
    step: 3,
    completed: true,
  };
  expect(writeWorkspace(value)).toBe(true);
  expect(readWorkspace().record?.workspace.kind).toBe("demo");
});
it.each(["{broken", "null", "[]", '"text"', "1"])(
  "rejects malformed storage without changing it: %s",
  (raw) => {
    localStorage.setItem(WORKSPACE_KEY, raw);
    expect(readWorkspace().status).toBe("invalid");
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
  },
);
it.each([0, 2, 99])(
  "recognizes unsupported version %s and leaves it untouched",
  (version) => {
    const raw = JSON.stringify({ ...record(), version });
    localStorage.setItem(WORKSPACE_KEY, raw);
    expect(readWorkspace().status).toBe("outdated");
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
  },
);
it.each([
  "mode",
  "step",
  "profile",
  "shape",
  "goal",
  "result",
  "source",
  "huge",
  "completed",
])(
  "rejects malformed %s rather than filling demonstration defaults",
  (mutation) => {
    const value: any = record();
    if (mutation === "mode") value.workspace.mode = "automatic";
    if (mutation === "step") value.step = 4;
    if (mutation === "profile")
      value.workspace.editor.demandProfile = { mode: "custom", values: ["1"] };
    if (mutation === "shape") delete value.workspace.editor.limit;
    if (mutation === "goal") value.workspace.goals = ["Guaranteed savings"];
    if (mutation === "result") value.result_id = "expired-server-execution";
    if (mutation === "source")
      value.workspace.editor.demandProfile = {
        mode: "sources",
        values: Array(24).fill("1"),
        sources: [{ category: "Invented source", values: Array(24).fill("1") }],
      };
    if (mutation === "huge") value.workspace.name = "x".repeat(101);
    if (mutation === "completed") {
      value.completed = true;
      value.step = 0;
    }
    expect(decodeWorkspace(JSON.stringify(value)).status).toBe("invalid");
  },
);
it("handles unavailable storage and does not throw on failed reads, writes or removal", () => {
  const denied = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  expect(readWorkspace(denied).status).toBe("unavailable");
  expect(writeWorkspace(record(), denied)).toBe(false);
  expect(removeWorkspace(denied)).toBe(false);
});
it("clears only GridPilot’s workspace key", () => {
  writeWorkspace(record());
  localStorage.setItem("other-app", "keep");
  expect(removeWorkspace()).toBe(true);
  expect(readWorkspace().status).toBe("empty");
  expect(localStorage.getItem("other-app")).toBe("keep");
});
it("bounds stored data size and rejects non-string enum values safely", () => {
  expect(decodeWorkspace("x".repeat(200001)).status).toBe("invalid");
  const value: any = record();
  value.workspace.mode = { toString: "joint" };
  expect(isSavedWorkspace(value)).toBe(false);
});
it("validates completed profile quantities while preserving unfinished text drafts", () => {
  const value = record();
  value.workspace.employees = "-2";
  value.workspace.monthlyBill = "-10";
  expect(isSavedWorkspace(value)).toBe(true);
  value.completed = true;
  value.step = 3;
  expect(isSavedWorkspace(value)).toBe(false);
});
it("bounds and validates saved business context while excluding execution fields", () => {
  const value = record();
  value.workspace.businessContext = {
    business_type: "Warehouse",
    employee_count: 42,
    equipment: "Vans",
    restrictions: null,
  };
  expect(writeWorkspace(value)).toBe(true);
  expect(readWorkspace().record).toEqual(value);
  value.workspace.businessContext.result_id = "expired";
  expect(isSavedWorkspace(value)).toBe(false);
});

it("rejects corrupted nonnumeric text in number-input fields without normalizing it", () => {
  const value = record();
  value.workspace.editor.limit = "not a number";
  const raw = JSON.stringify(value);
  localStorage.setItem(WORKSPACE_KEY, raw);
  expect(readWorkspace().status).toBe("invalid");
  expect(localStorage.getItem(WORKSPACE_KEY)).toBe(raw);
});
