// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HourSelect } from "./HourSelect";
import { formatHour, formatWindow, parseHour } from "../../data/time";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each([
  [0, "12:00 AM"],
  [8, "8:00 AM"],
  [12, "12:00 PM"],
  [13, "1:00 PM"],
  [18, "6:00 PM"],
  [24, "12:00 AM — end of day"],
] as const)(
  "labels %s without changing the numeric hour",
  async (hour, label) => {
    const host = document.createElement("div"),
      root = createRoot(host),
      change = vi.fn();
    try {
      await act(async () =>
        root.render(
          <label>
            Time
            <HourSelect
              value={String(hour)}
              end={hour === 24}
              onChange={change}
            />
          </label>,
        ),
      );
      expect(host.querySelector("option:checked")!.textContent).toBe(label);
      expect(
        parseHour(host.querySelector<HTMLSelectElement>("select")!.value),
      ).toBe(hour);
      expect(formatHour(hour)).toBe(label);
    } finally {
      await act(async () => root.unmount());
    }
  },
);
it("does not silently round minute values or repair invalid saved hours", async () => {
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(<HourSelect value="8.5" onChange={vi.fn()} />),
    );
    expect(host.querySelector("option:checked")!.textContent).toContain(
      "Unsupported saved time: 8.5",
    );
    expect(parseHour("8.5")).toBeNull();
    expect(parseHour("24")).toBe(24);
    expect(formatWindow(13, 24)).toContain("end of day");
    expect(formatWindow(13, 24)).toContain("end excluded");
  } finally {
    await act(async () => root.unmount());
  }
});
