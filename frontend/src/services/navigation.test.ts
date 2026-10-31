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
