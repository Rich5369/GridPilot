import states from "../data/usStates.json";
export type RetailPrices = {
  period: string;
  previous_year_period: string;
  released_at: string;
  source_checked_at: string;
  source: string;
  source_url: string;
  reuse_url: string;
  sector: "Commercial";
  units: "cents/kWh";
  status: "available" | "saved" | "delayed";
  notice: string | null;
  preliminary: boolean;
  states: {
    state: string;
    cents_per_kwh: number | null;
    previous_year_cents_per_kwh: number | null;
  }[];
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const names = new Set(states.map((s) => s.name));
const price = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const month = (v: unknown) =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const url = (v: unknown) => {
  try {
    return (
      typeof v === "string" && ["https:", "http:"].includes(new URL(v).protocol)
    );
  } catch {
    return false;
  }
};
// Validate the existing backend contract before formatting numbers or dates.
export function isRetailPrices(v: unknown): v is RetailPrices {
  if (
    !object(v) ||
    typeof v.source !== "string" ||
    !v.source.trim() ||
    !url(v.source_url) ||
    !url(v.reuse_url) ||
    v.sector !== "Commercial" ||
    v.units !== "cents/kWh" ||
    !month(v.period) ||
    !month(v.previous_year_period) ||
    !date(v.released_at) ||
    typeof v.source_checked_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v.source_checked_at) ||
    !date(v.source_checked_at.slice(0, 10)) ||
    !Number.isFinite(Date.parse(v.source_checked_at)) ||
    typeof v.status !== "string" ||
    !["available", "saved", "delayed"].includes(v.status) ||
    typeof v.preliminary !== "boolean" ||
    !(v.notice === null || typeof v.notice === "string") ||
    !Array.isArray(v.states) ||
    v.states.length > 51
  )
    return false;
  const seen = new Set<string>();
  return v.states.every((row) => {
    if (
      !object(row) ||
      typeof row.state !== "string" ||
      !names.has(row.state) ||
      seen.has(row.state) ||
      !price(row.cents_per_kwh) ||
      !price(row.previous_year_cents_per_kwh)
    )
      return false;
    seen.add(row.state);
    return true;
  });
}
