export interface DemandSeries {
  key: string
  label: string
  values: number[]
}
export function intervalRows(
  series: DemandSeries[],
): ({ hour: number } & Record<string, number>)[] {
  // Closing sample extends the final plateau to midnight; exclude it from energy sums.
  return Array.from({ length: 25 }, (_, hour) => ({
    hour,
    ...Object.fromEntries(
      series.map((s) => [s.key, s.values[Math.min(hour, 23)]]),
    ),
  }))
}
