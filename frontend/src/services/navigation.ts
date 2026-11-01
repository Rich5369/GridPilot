// Hash routes preserve static Vercel hosting and existing #overview-style links.
export const dashboardViews = [
  'overview',
  'building',
  'savings',
  'configuration',
  'comparison',
  'whatif',
  'assistant',
  'markets',
] as const
export type DashboardView = (typeof dashboardViews)[number]
export type WorkspaceRoute = 'home' | 'setup' | 'example' | `example/${DashboardView}` | DashboardView
export function parseRoute(hash: string): WorkspaceRoute {
  let value = hash.replace(/^#\/?/, '').replace(/^building\//, '')
  if (value.startsWith('example/') && dashboardViews.includes(value.slice(8) as DashboardView)) return value as `example/${DashboardView}`
  if (value === 'energy-plan') value = 'configuration'
  if (value === 'my-building') value = 'building'
  return value === 'example' ? 'example' : value === 'setup'
    ? 'setup'
    : dashboardViews.includes(value as DashboardView)
      ? (value as DashboardView)
      : 'home'
}
export function isDashboardRoute(
  route: WorkspaceRoute,
): route is DashboardView {
  return dashboardViews.includes(route as DashboardView)
}
