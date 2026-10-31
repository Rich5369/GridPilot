import { useSyncExternalStore } from "react";
import { parseRoute, type WorkspaceRoute } from "../services/navigation";
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}
const snapshot = () => parseRoute(window.location.hash);
export function useWorkspaceNavigation() {
  const route = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "home" as const,
  );
  function navigate(next: WorkspaceRoute, replace = false) {
    const hash = next === "home" ? "#home" : `#${next}`;
    if (window.location.hash !== hash) {
      window.history[replace ? "replaceState" : "pushState"](null, "", hash);
      window.dispatchEvent(new Event("hashchange"));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return { route, navigate };
}
