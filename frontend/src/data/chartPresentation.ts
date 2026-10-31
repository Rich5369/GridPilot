import { formatWindow } from "./time";
export const chartAxis = { fontSize: 11, fill: "#95a5ba" };
export const chartCursor = {
  stroke: "#7b8ba3",
  strokeWidth: 1,
  strokeDasharray: "3 4",
};
export function hourInterval(hour: unknown) {
  const start = Math.min(23, Number(hour));
  return formatWindow(start, start + 1);
}
