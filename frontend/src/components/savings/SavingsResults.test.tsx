// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SavingsResults } from "./SavingsResults";
import response from "../../../../docs/verification/savings-response.json";
import request from "../../../../docs/verification/savings-request.json";
import warehouse from "../../testFixtures/warehouseSavingsConversation.json";
import warehouseRequest from "../../../../docs/verification/meta-savings-acceptance-request.json";
import type {
  SavingsResponse,
  SavingsRequest,
  SavingsConversationResponse,
} from "../../types/savings";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
async function render(
  r: SavingsResponse,
  req: SavingsRequest = request as SavingsRequest,
  conversation: SavingsConversationResponse | null = null,
) {
  const host = document.createElement("div"),
    root = createRoot(host);
  await act(async () =>
    root.render(
      <SavingsResults
        response={r}
        request={req}
        conversation={conversation}
        confirmed={{}}
        stale={false}
        onAnswer={vi.fn()}
        onScheduling={vi.fn()}
      />,
    ),
  );
  return { host, close: () => act(async () => root.unmount()) };
}
it("renders exact returned annual fields with units and provenance, without mutating data or deriving payback/ROI", async () => {
  const r = structuredClone(response) as SavingsResponse;
  r.recommendations[0].simple_payback_years = 1.2345;
  r.recommendations[0].annual_simple_roi_percent = 42.789;
  const before = structuredClone(r),
    { host, close } = await render(r);
  try {
    const card = host.querySelector("[data-measure-id=office-led-scenario]")!;
    expect(card.querySelector("[data-financial=energy]")!.textContent).toBe(
      "12,500.00 kWh/year",
    );
    expect(card.querySelector("[data-financial=gross]")!.textContent).toBe(
      "$2,500.00 USD/year",
    );
    expect(card.querySelector("[data-financial=payback]")!.textContent).toBe(
      "1.23 years",
    );
    expect(card.querySelector("[data-financial=roi]")!.textContent).toBe(
      "42.79 % per year",
    );
    expect(card.textContent).toContain("Synthetic example");
    expect(host.textContent).toContain("No Meta selection was requested");
    expect(host.textContent).toContain(
      "Portfolio savings are intentionally withheld",
    );
    expect(r).toEqual(before);
  } finally {
    await close();
  }
});
it.each([null, 0, -250])(
  "distinguishes financial unknown, valid zero and negative savings (%s)",
  async (value) => {
    const r = structuredClone(response) as SavingsResponse;
    r.recommendations[0].annual_net_savings_usd = value;
    r.recommendations[0].annual_energy_charge_savings_usd = value;
    const { host, close } = await render(r);
    try {
      const field = host.querySelector(
        "[data-measure-id=office-led-scenario] [data-financial=net]",
      )!;
      expect(field.textContent).toBe(
        value === null
          ? "Unknown — more information needed"
          : value === 0
            ? "$0.00 USD/year"
            : "-$250.00 USD/year",
      );
      expect(
        host.querySelector("[data-financial=energy]")!.textContent,
      ).toContain("12,500.00");
    } finally {
      await close();
    }
  },
);
it.each(["meta", "deterministic_fallback"] as const)(
  "separates %s selections, two LED projects, unknown financials, investigations and exclusions",
  async (source) => {
    const c = { ...warehouse, source } as SavingsConversationResponse;
    const { host, close } = await render(
      c.savings,
      warehouseRequest.evidence as SavingsRequest,
      c,
    );
    try {
      const cards = [...host.querySelectorAll(".savings-card")];
      expect(
        cards.some(
          (c) => c.getAttribute("data-measure-id") === "main-lighting",
        ),
      ).toBe(true);
      expect(
        cards.some(
          (c) => c.getAttribute("data-measure-id") === "pilot-lighting",
        ),
      ).toBe(true);
      expect(
        host.querySelector(
          "[data-measure-id=pilot-lighting] [data-financial=energy]",
        )!.textContent,
      ).toBe("2,000.00 kWh/year");
      expect(
        host.querySelector(
          "[data-measure-id=pilot-lighting] [data-financial=gross]",
        )!.textContent,
      ).toContain("Unknown");
      expect(host.querySelector(".savings-excluded")!.textContent).toContain(
        "scheduling",
      );
      expect(host.querySelector(".savings-selection")!.textContent).toContain(
        source === "meta"
          ? "AI-assisted category selection"
          : "AI selection unavailable · deterministic fallback",
      );
      expect(host.querySelector(".savings-general")!.textContent).toContain(
        "not selected",
      );
      expect(
        host.querySelector('[aria-label="Savings follow-up questions"]'),
      ).toBeTruthy();
    } finally {
      await close();
    }
  },
);
it("does not describe quantified caller reports as an independent audit or realized savings", async () => {
  const r = structuredClone(response) as SavingsResponse;
  r.recommendations[0].calculation_status = "quantified";
  r.recommendations[0].provenance.kind = "measured";
  const { host, close } = await render(r);
  try {
    expect(host.querySelector(".savings-card")!.textContent).toContain(
      "not an independent audit or proof of realized savings",
    );
  } finally {
    await close();
  }
});

it.each([undefined, null, 0, 300])(
  "renders recurring non-energy benefit %s separately without inferring net",
  async (benefit) => {
    const r = structuredClone(response) as SavingsResponse;
    r.recommendations[0].annual_operating_cost_savings_usd = benefit;
    r.recommendations[0].annual_net_savings_usd = 2700.01;
    const { host, close } = await render(r);
    try {
      const card = host.querySelector("[data-measure-id=office-led-scenario]")!;
      expect(
        card.querySelector("[data-financial=operating]")!.textContent,
      ).toBe(
        benefit == null
          ? "Not included in this estimate"
          : benefit === 0
            ? "$0.00 USD/year"
            : "$300.00 USD/year",
      );
      expect(card.querySelector("[data-financial=gross]")!.textContent).toBe(
        "$2,500.00 USD/year",
      );
      expect(card.querySelector("[data-financial=net]")!.textContent).toBe(
        "$2,700.01 USD/year",
      );
    } finally {
      await close();
    }
  },
);
