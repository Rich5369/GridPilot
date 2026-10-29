const assert = require('node:assert/strict')

// A mounted SVG and legend can exist even when CSS collapses the plot to zero width.
// Check screen-space geometry, not only chart nodes or SVG path data.
async function assertChartRendered(
  page,
  chart = page.locator('.chart').first(),
) {
  await chart.locator('svg[role="application"]').waitFor({ state: 'visible' })
  await page.waitForFunction(
    (element) => {
      const svg = element.querySelector('svg[role="application"]')
      if (!svg) return false
      const bounds = svg.getBoundingClientRect()
      return (
        bounds.width > 100 &&
        bounds.height > 150 &&
        Math.abs(bounds.width - element.getBoundingClientRect().width) < 3
      )
    },
    await chart.elementHandle(),
  )
  const geometry = await chart.evaluate((element) => {
    const rect = element
      .querySelector('svg[role="application"]')
      .getBoundingClientRect()
    const curves = [
      ...element.querySelectorAll('.recharts-line-curve, .recharts-area-area'),
    ]
    return {
      width: rect.width,
      height: rect.height,
      visibleCurves: curves.filter((curve) => {
        const bounds = curve.getBoundingClientRect()
        return (
          bounds.width > 50 &&
          bounds.height > 0 &&
          !/NaN|Infinity/.test(curve.getAttribute('d'))
        )
      }).length,
      ticks: element.querySelectorAll('.recharts-cartesian-axis-tick-value')
        .length,
    }
  })
  assert(
    geometry.visibleCurves > 0,
    `No visible demand curve: ${JSON.stringify(geometry)}`,
  )
  assert(geometry.ticks > 0, 'Demand axes must be rendered')
  return geometry
}

module.exports = { assertChartRendered }
