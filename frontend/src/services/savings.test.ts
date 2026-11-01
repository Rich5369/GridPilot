import { afterEach, expect, it, vi } from "vitest";
import request from "../../../docs/verification/savings-request.json";
import response from "../../../docs/verification/savings-response.json";
import catalog from "../testFixtures/savingsCatalog.json";
import warehouse from "../testFixtures/warehouseSavingsConversation.json";
import warehouseRequest from "../../../docs/verification/meta-savings-acceptance-request.json";
import {
  isSavingsCatalog,
  isSavingsResponse,
  isSavingsRequest,
  isSavingsConversation,
  matchesSavings,
  calculateSavings,
  converseSavings,
  getSavingsCatalog,
  savingsFailure,
} from "./savings";
import { ApiError } from "./api";
import type {
  SavingsRequest,
  SavingsResponse,
  SavingsConversationRequest,
} from "../types/savings";
afterEach(() => vi.unstubAllGlobals());
it("accepts actual v1 contracts, catalog and captured numerical evidence", () => {
  expect(isSavingsCatalog(catalog)).toBe(true);
  expect(isSavingsResponse(response)).toBe(true);
  expect(isSavingsRequest(request)).toBe(true);
  expect(
    matchesSavings(response as SavingsResponse, request as SavingsRequest),
  ).toBe(true);
  expect(isSavingsConversation(warehouse)).toBe(true);
  expect(
    matchesSavings(
      warehouse.savings as SavingsResponse,
      warehouseRequest.evidence as SavingsRequest,
    ),
  ).toBe(true);
});
it.each([
  { version: "2" },
  { portfolio_savings_usd: 5000 },
  {
    recommendations: [
      { ...response.recommendations[0], annual_net_savings_usd: "2500" },
    ],
  },
  {
    recommendations: [
      { ...response.recommendations[0], simple_payback_years: NaN },
    ],
  },
  { benchmark: { ...response.benchmark, source_url: "javascript:bad" } },
  {
    recommendations: [response.recommendations[0], response.recommendations[0]],
  },
  {
    recommendations: [
      { ...response.recommendations[0], calculation_status: "quantified" },
    ],
  },
])("rejects malformed/unsafe response: %j", (patch) =>
  expect(isSavingsResponse({ ...response, ...patch })).toBe(false),
);
it("rejects financial results from another project/rate instead of accepting a stale response", async () => {
  const bad = structuredClone(response);
  bad.recommendations[0].inputs_used.rate!.usd_per_kwh = 0.25;
  expect(
    matchesSavings(bad as SavingsResponse, request as SavingsRequest),
  ).toBe(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(bad))),
  );
  await expect(calculateSavings(request as SavingsRequest)).rejects.toThrow(
    "No new result was accepted",
  );
});
it("uses configured service conventions for all three actual endpoints; no Scenario or invented category fields", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
    .mockResolvedValueOnce(new Response(JSON.stringify(response)))
    .mockResolvedValueOnce(new Response(JSON.stringify(warehouse)));
  vi.stubGlobal("fetch", fetch);
  await getSavingsCatalog();
  await calculateSavings(request as SavingsRequest);
  await converseSavings(warehouseRequest as SavingsConversationRequest);
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "http://localhost:8000/api/savings/catalog",
    "http://localhost:8000/api/savings/recommendations",
    "http://localhost:8000/api/ai/savings/conversation",
  ]);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty(
    "category_applicability",
  );
  expect(JSON.parse(fetch.mock.calls[2][1].body)).not.toHaveProperty(
    "scenario",
  );
});
it("never coerces nonfinite numbers/numeric strings or unknown applicability before HTTP", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const value of ["100", Infinity, true])
    await expect(
      calculateSavings({
        ...request,
        measures: [{ ...request.measures[0], fixture_count: value }],
      } as unknown as SavingsRequest),
    ).rejects.toThrow();
  await expect(
    converseSavings({
      ...warehouseRequest,
      category_applicability: { led: null },
    } as unknown as SavingsConversationRequest),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects conversation selections that contradict explicit exclusions", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...warehouse, selected_categories: ["scheduling"] }),
        ),
      ),
  );
  await expect(
    converseSavings(warehouseRequest as SavingsConversationRequest),
  ).rejects.toThrow("No new result was accepted");
});
it("maps 422 locations usefully and distinguishes service errors, timeouts and fallback data", () => {
  const e = savingsFailure(
    new ApiError(422, {
      detail: [
        {
          loc: ["body", "evidence", "measures", 0, "rate", "source"],
          msg: "Field required",
        },
      ],
    }),
  );
  expect(e.fields["measures.0.rate.source"]).toBe("Field required");
  expect(e.message).toContain("retained");
  expect(savingsFailure(new ApiError(503, {})).message).toContain(
    "unavailable",
  );
  expect(
    savingsFailure(new DOMException("expired", "TimeoutError")).message,
  ).toContain("may still be processing");
  expect(
    isSavingsConversation({ ...warehouse, source: "deterministic_fallback" }),
  ).toBe(true);
});

it("supports additive recurring benefit fields and old responses while rejecting invalid amounts and missing attribution", () => {
  const req = structuredClone(request) as SavingsRequest;
  req.measures![0].annual_operating_cost_savings_usd = 300;
  expect(isSavingsRequest(req)).toBe(false);
  req.measures![0].operating_cost_savings_reference =
    "Documented maintenance reduction, excluding energy";
  expect(isSavingsRequest(req)).toBe(true);
  const res = structuredClone(response) as SavingsResponse;
  expect(isSavingsResponse(res)).toBe(true); // Pre-PR #53 v1 response.
  const rec = res.recommendations[0];
  rec.annual_operating_cost_savings_usd = 300;
  expect(isSavingsResponse(res)).toBe(true);
  expect(matchesSavings(res, req)).toBe(false); // Cannot accept a response omitting the supplied attribution.
  rec.inputs_used.annual_operating_cost_savings_usd = 300;
  rec.inputs_used.operating_cost_savings_reference =
    req.measures![0].operating_cost_savings_reference;
  expect(matchesSavings(res, req)).toBe(true);
  rec.annual_operating_cost_savings_usd = -1;
  expect(isSavingsResponse(res)).toBe(false);
});

it("validates additive advisory warnings and strict independent operating-evidence booleans", () => {
  const req = structuredClone(request) as SavingsRequest;
  req.measures![0].operating_baseline_confirmed = false;
  expect(isSavingsRequest(req)).toBe(true);
  expect(
    isSavingsRequest({
      ...req,
      measures: [
        { ...req.measures![0], operating_baseline_confirmed: "false" },
      ],
    }),
  ).toBe(false);
  const res = structuredClone(response) as SavingsResponse;
  res.recommendations[0].warnings = ["Plausibility: confirm units"];
  expect(isSavingsResponse(res)).toBe(true);
  expect(
    isSavingsResponse({
      ...res,
      recommendations: [{ ...res.recommendations[0], warnings: [42] }],
    }),
  ).toBe(false);
});
