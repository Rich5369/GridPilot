import { expect, it } from "vitest";
import { parseRoute, dashboardViews, isDashboardRoute } from "./navigation";
it.each(dashboardViews)(
  "preserves old dashboard hash %s and supports building aliases",
  (view) => {
    expect(parseRoute("#" + view)).toBe(view);
    expect(parseRoute("#/building/" + view)).toBe(view);
    expect(isDashboardRoute(view)).toBe(true);
  },
);
it.each(["", "#home", "#unknown", "#how-it-works", "#the-model"])(
  "keeps unknown/product anchors on the home screen (%s)",
  (hash) => expect(parseRoute(hash)).toBe("home"),
);
it("recognizes explicit setup without a new server route", () =>
  expect(parseRoute("#setup")).toBe("setup"));
it('supports new primary aliases and the isolated offline example', () => {
  expect(parseRoute('#energy-plan')).toBe('configuration')
  expect(parseRoute('#my-building')).toBe('building')
  expect(parseRoute('#example')).toBe('example')
})

it.each(dashboardViews)('preserves example subview %s for refresh and history', view => {
  expect(parseRoute('#example/' + view)).toBe('example/' + view)
})
it('recognizes the separate information page', () => expect(parseRoute('#learn-more')).toBe('learn-more'))
