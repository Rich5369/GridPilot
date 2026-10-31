/** UI labels only. The model retains integer hours and exclusive interval ends. */
export function formatHour(value: string | number): string {
  if (
    String(value).trim() === "" ||
    !Number.isInteger(Number(value)) ||
    Number(value) < 0 ||
    Number(value) > 24
  )
    return "Time not provided";
  const h = Number(value);
  if (h === 24) return "12:00 AM — end of day";
  return `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
}
export const formatWindow = (start: string | number, end: string | number) =>
  `${formatHour(start)}–${formatHour(end)} (end excluded)`;
export function parseHour(value: string): number | null {
  return /^(?:[0-9]|1[0-9]|2[0-4])$/.test(value) ? Number(value) : null;
}
export const timeFields = [
  "opening",
  "closing",
  "peakStart",
  "peakEnd",
  "arrival",
  "deadline",
  "equipmentStart",
  "equipmentEnd",
] as const;
export const isTimeField = (field: string) =>
  timeFields.some((f) => f === field);
export const isEndField = (field: string) =>
  ["closing", "peakEnd", "deadline", "equipmentEnd"].includes(field);
