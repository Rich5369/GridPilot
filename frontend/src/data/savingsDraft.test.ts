import { expect, it } from "vitest";
import {
  buildSavingsRequest,
  categoryApplicability,
  emptySavingsDraft,
  mapSavingsProfile,
  measureToDraft,
  syntheticLedDraft,
  newSavingsMeasure,
  validSavingsDraft,
  calculationFields,
} from "./savingsDraft";
import type { SavingsDraft, MeasureNumber } from "../types/savings";
import {
  emptyWorkspace,
  writeWorkspace,
  readWorkspace,
  isSavedWorkspace,
} from "../services/workspaceStorage";
import warehouse from "../../../docs/verification/meta-savings-acceptance-request.json";
const draft = (): SavingsDraft => ({
  ...emptySavingsDraft(),
  measures: [syntheticLedDraft()],
});
it("maps explicit synthetic evidence to numbers/booleans without profile, scenario, rate or runtime inference", () => {
  const d = draft(),
    profile = mapSavingsProfile({
      business_type: "Office",
      employee_count: 50,
      operating_hours: "8 AM–5 PM",
      electricity_cost_and_period: "USD 2400 per month",
      unexpected: "not an API field",
    });
  const { request, errors } = buildSavingsRequest(d, profile);
  expect(errors).toEqual({});
  const m = request.measures![0];
  expect(m.fixture_count).toBe(100);
  expect(m.old_watts).toBe(60);
  expect(m.rate!.usd_per_kwh).toBe(0.2);
  expect(m.equivalent_service_confirmed).toBe(true);
  expect(m.annual_incremental_cost_usd).toBe(0);
  expect(request.profile).not.toHaveProperty("unexpected");
  expect(request).not.toHaveProperty("scenario");
  expect(request).not.toHaveProperty("category_applicability");
  const empty = emptySavingsDraft();
  empty.measures = [newSavingsMeasure("led", "main")];
  empty.measures[0].load_id = "lights";
  empty.measures[0].evidence_reference = "Unknown evidence";
  const noInference = buildSavingsRequest(empty, profile).request.measures![0];
  expect(noInference.hours_per_day).toBeNull();
  expect(noInference.rate).toBeNull();
  expect(noInference.equivalent_service_confirmed).toBeNull();
});
it("keeps blank annual costs/upfront unknown and explicit zero numeric, including removing a rate without losing its draft", () => {
  const d = draft();
  d.measures[0].numbers.annual_incremental_cost_usd = "";
  d.measures[0].numbers.installation_cost_usd = "";
  d.measures[0].rateEnabled = false;
  const m = buildSavingsRequest(d, {}).request.measures![0];
  expect(m.rate).toBeNull();
  expect(m.annual_incremental_cost_usd).toBeNull();
  expect(m.installation_cost_usd).toBeNull();
  expect(d.measures[0].rate.usd_per_kwh).toBe("0.2");
  d.measures[0].numbers.annual_incremental_cost_usd = "0";
  expect(
    buildSavingsRequest(d, {}).request.measures![0].annual_incremental_cost_usd,
  ).toBe(0);
});
it("omits unknown relevance, never excludes scheduling solely from no EVs, and blocks inconsistent exclusions", () => {
  const d = draft();
  d.applicability = { led: "yes", scheduling: "", refrigeration: "no" };
  expect(categoryApplicability(d)).toEqual({ led: true, refrigeration: false });
  expect(categoryApplicability(emptySavingsDraft())).not.toHaveProperty(
    "scheduling",
  );
  d.applicability.led = "no";
  expect(buildSavingsRequest(d, {}).errors["measures.0.applicable"]).toContain(
    "excluded",
  );
  d.measures[0].confirmations.applicable = "no";
  expect(buildSavingsRequest(d, {}).errors).toEqual({});
});
it.each([
  ["fixture_count", "1.5"],
  ["fixture_count", "0"],
  ["days_per_year", "367"],
  ["hours_per_day", "25"],
  ["new_watts", "61"],
  ["new_watts", "0"],
  ["installation_cost_usd", "-1"],
  ["old_watts", "Infinity"],
  ["old_watts", "NaN"],
])("rejects invalid %s=%s before HTTP", (field, value) => {
  const d = draft();
  d.measures[0].numbers[field as MeasureNumber] = value;
  expect(Object.keys(buildSavingsRequest(d, {}).errors).length).toBeGreaterThan(
    0,
  );
});
it.each(["source", "valid_from", "valid_through", "usd_per_kwh"] as const)(
  "validates enabled rate %s while leaving expired rates unchanged for backend evaluation",
  (field) => {
    const d = draft();
    d.measures[0].rate[field] = "";
    expect(
      buildSavingsRequest(d, {}).errors["measures.0.rate." + field],
    ).toBeTruthy();
    d.measures[0].rate = {
      ...syntheticLedDraft().rate,
      valid_from: "2000-01-01",
      valid_through: "2001-01-01",
    };
    expect(buildSavingsRequest(d, {}).errors).toEqual({});
    expect(
      buildSavingsRequest(d, {}).request.measures![0].rate!.valid_through,
    ).toBe("2001-01-01");
  },
);
it.each(Object.keys(calculationFields))(
  "builds typed %s evidence and leaves safety unknown instead of claiming safe/nonessential",
  (category) => {
    const d = emptySavingsDraft();
    const m = newSavingsMeasure(
      category as keyof typeof calculationFields,
      "p",
    );
    m.load_id = "equipment";
    m.evidence_reference = "Caller notes";
    d.measures = [m];
    expect(buildSavingsRequest(d, {}).errors).toEqual({});
    const request = buildSavingsRequest(d, {}).request.measures![0];
    if (["office", "shutdown", "lighting_controls"].includes(category)) {
      expect(request.safe_to_switch_off).toBeNull();
      expect(request.essential_service).toBeNull();
    } else expect(request.equivalent_service_confirmed).toBeNull();
  },
);
it("retains distinct measures in the same category and supports the exact warehouse evidence without fabricating finance", () => {
  const d = emptySavingsDraft();
  d.measures = warehouse.evidence.measures.map((m) =>
    measureToDraft(m as Parameters<typeof measureToDraft>[0]),
  );
  d.applicability = {
    led: "yes",
    scheduling: "no",
    refrigeration: "no",
    compressed_air: "no",
  };
  const { request, errors } = buildSavingsRequest(
    d,
    warehouse.evidence.profile,
  );
  expect(errors).toEqual({});
  expect(request.measures!.map((m) => m.id)).toEqual([
    "main-lighting",
    "pilot-lighting",
  ]);
  expect(request.measures![0].old_watts).toBeNull();
  expect(request.measures![1].hours_per_day).toBe(8);
  expect(request.measures!.every((m) => m.rate === null)).toBe(true);
  d.measures[1].id = d.measures[0].id;
  expect(buildSavingsRequest(d, {}).errors["measures.1.id"]).toContain(
    "unique",
  );
});
it("bounds and validates saved savings drafts; malformed/execution fields cannot masquerade as saved inputs", () => {
  const d = draft();
  expect(validSavingsDraft(d)).toBe(true);
  for (const bad of [
    { ...d, response: {} },
    { ...d, applicability: { scheduling: null } },
    { ...d, location: { ...d.location, geocoded: true } },
    {
      ...d,
      measures: [
        {
          ...d.measures[0],
          numbers: { ...d.measures[0].numbers, old_watts: "NaN" },
        },
      ],
    },
  ])
    expect(validSavingsDraft(bad)).toBe(false);
});

it("round-trips valid v1 savings inputs separately from results and still accepts old workspaces", () => {
  const workspace = { ...emptyWorkspace(), savingsDraft: draft() };
  const record = { version: 1 as const, workspace, step: 1, completed: false };
  let raw: string | null = null;
  const port = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
    removeItem: () => {
      raw = null;
    },
  };
  expect(writeWorkspace(record, port)).toBe(true);
  expect(readWorkspace(port).record).toEqual(record);
  expect(isSavedWorkspace({ ...record, workspace: emptyWorkspace() })).toBe(
    true,
  );
  expect(
    isSavedWorkspace({
      ...record,
      workspace: { ...workspace, savingsDraft: { ...draft(), response: {} } },
    }),
  ).toBe(false);
  expect(raw).not.toContain("portfolio_savings_usd");
});

it("requires separately attributed positive non-energy benefits and preserves omitted versus zero", () => {
  const d = draft(),
    m = d.measures[0];
  expect(
    buildSavingsRequest(d, {}).request.measures![0]
      .annual_operating_cost_savings_usd,
  ).toBeUndefined();
  expect(buildSavingsRequest(d, {}).request.measures![0]).not.toHaveProperty(
    "operating_cost_savings_reference",
  );
  m.numbers.annual_operating_cost_savings_usd = "300";
  expect(
    buildSavingsRequest(d, {}).errors[
      "measures.0.operating_cost_savings_reference"
    ],
  ).toBeTruthy();
  m.operating_cost_savings_reference =
    "Maintenance estimate: $400 before, $100 after per year; excludes energy";
  const built = buildSavingsRequest(d, {});
  expect(built.errors).toEqual({});
  expect(built.request.measures![0].annual_operating_cost_savings_usd).toBe(
    300,
  );
  expect(built.request.measures![0].operating_cost_savings_reference).toBe(
    m.operating_cost_savings_reference,
  );
  expect(validSavingsDraft(d)).toBe(true);
  m.numbers.annual_operating_cost_savings_usd = "0";
  m.operating_cost_savings_reference = "";
  expect(buildSavingsRequest(d, {}).errors).toEqual({});
  expect(
    buildSavingsRequest(d, {}).request.measures![0]
      .annual_operating_cost_savings_usd,
  ).toBe(0);
});
