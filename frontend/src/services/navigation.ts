// Hash routes preserve static Vercel hosting and existing #overview-style links.
export const dashboardViews = [
  "overview",
  "configuration",
  "comparison",
  "whatif",
  "assistant",
  "markets",
] as const;
export type DashboardView = (typeof dashboardViews)[number];
export type WorkspaceRoute = "home" | "setup" | DashboardView;
export function parseRoute(hash: string): WorkspaceRoute {
  const value = hash.replace(/^#\/?/, "").replace(/^building\//, "");
  return value === "setup"
    ? "setup"
    : dashboardViews.includes(value as DashboardView)
      ? (value as DashboardView)
      : "home";
}
export function isDashboardRoute(
  route: WorkspaceRoute,
): route is DashboardView {
  return dashboardViews.includes(route as DashboardView);
}
