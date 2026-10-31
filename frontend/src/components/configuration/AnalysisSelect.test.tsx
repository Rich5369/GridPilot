// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AnalysisSelect } from "./AnalysisSelect";
import { ScenarioPanel } from "./ScenarioPanel";
import { defaultEditor, toScenario } from "../../data/demoScenario";
import type { ScenarioEditor } from "../../types/dashboard";
import type { SchedulingMode } from "../../services/api";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shows relevant equipment fields, keeps common inputs, and preserves drafts without submitting excluded devices", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  let current: ScenarioEditor = { ...defaultEditor, analysisChoice: "joint" },
    mode: SchedulingMode = "joint";
  function Editor() {
    const [editor, setEditor] = useState(current),
      [m, setMode] = useState(mode);
    return (
      <>
        <AnalysisSelect
          editor={editor}
          mode={m}
          onChange={(e, nextMode) => {
            current=e;mode=nextMode;
            setEditor(e);
            setMode(nextMode);
          }}
        />
        <ScenarioPanel editor={editor} onChange={setEditor} />
      </>
    );
  }
  const choose = async (value: string) =>
    act(async () => {
      const select = host.querySelector<HTMLSelectElement>("#analysis-choice")!;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  try {
    await act(async () => root.render(<Editor />));
    expect(host.querySelector("#arrival")!.tagName).toBe("SELECT");
    expect(host.querySelector("#duration")).toBeTruthy();
    await choose("building");
    expect(host.querySelector("#arrival")).toBeNull();
    expect(host.querySelector("#duration")).toBeNull();
    for (const id of ["opening", "closing", "limit", "offPeak", "peak"])
      expect(host.querySelector("#" + id)).toBeTruthy();
    expect(current.chargers).toBe("2");
    expect(current.duration).toBe("2");
    expect(toScenario(current)).toMatchObject({
      ev_requirements: [],
      flexible_equipment: [],
    });
    expect(mode).toBe("joint");
    await choose("flexible");
    expect(host.querySelector("#arrival")).toBeNull();
    expect(host.querySelector("#duration")).toBeTruthy();
    await choose("ev");
    expect(host.querySelector("#arrival")).toBeTruthy();
    expect(host.querySelector("#duration")).toBeNull();
    expect(mode).toBe("ev_only");
    await choose("held");
    expect(host.querySelector("#duration")).toBeTruthy();
    expect(host.textContent).toContain("retains its baseline schedule");
    expect(
      host.querySelector<HTMLSelectElement>("#opening")!.selectedOptions[0]
        .textContent,
    ).toBe("8:00 AM");
    expect(
      [...host.querySelectorAll("button")].some(
        (b) => b.textContent === "Other / custom equipment",
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
  }
});
