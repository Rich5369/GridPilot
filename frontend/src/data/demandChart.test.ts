import { expect, it } from 'vitest'
import { intervalRows } from './demandChart'
it('positions every hourly interval on a numeric axis and closes at midnight without adding energy', () => {
  const values = Array.from({ length: 24 }, (_, h) => h + 1)
  const rows = intervalRows([{ key: 'total', label: 'Total', values }])
  expect(rows).toHaveLength(25)
  expect(rows[23]).toEqual({ hour: 23, total: 24 })
  expect(rows[24]).toEqual({ hour: 24, total: 24 })
  expect(rows.slice(0, 24).reduce((sum, row) => sum + row.total, 0)).toBe(300)
})
