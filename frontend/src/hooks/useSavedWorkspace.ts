import { useCallback, useRef, useState, type SetStateAction } from "react";
import {
  readWorkspace,
  removeWorkspace,
  writeWorkspace,
} from "../services/workspaceStorage";
import type { SavedWorkspace } from "../types/workspace";

type SaveStatus =
  | ReturnType<typeof readWorkspace>["status"]
  | "write_failed"
  | "clear_failed"
  | "session_only";
export function useSavedWorkspace() {
  const [initial] = useState(readWorkspace);
  const [state, setState] = useState<{
    record: SavedWorkspace | null;
    status: SaveStatus;
    recovery: boolean;
  }>({
    record: initial.record,
    status: initial.status,
    recovery: ["invalid", "outdated"].includes(initial.status),
  });
  const latest = useRef(state);
  const writable = useRef(
    initial.status === "empty" || initial.status === "saved",
  );
  const written = useRef(
    initial.record ? JSON.stringify(initial.record) : null,
  );
  // Save in the input event, not on mount/page unload or inside a React updater.
  // Reads that failed validation/access never authorize replacing existing data.
  const setRecord = useCallback(
    (action: SetStateAction<SavedWorkspace | null>) => {
      const record =
        typeof action === "function" ? action(latest.current.record) : action;
      let status = latest.current.status;
      if (record && writable.current) {
        const encoded = JSON.stringify(record);
        if (encoded !== written.current) {
          if (writeWorkspace(record)) {
            written.current = encoded;
            status = "saved";
          } else status = "write_failed";
        }
      }
      latest.current = { ...latest.current, record, status };
      setState(latest.current);
    },
    [],
  );
  const clear = useCallback(() => {
    if (!removeWorkspace()) {
      latest.current = { ...latest.current, status: "clear_failed" };
      setState(latest.current);
      return false;
    }
    writable.current = true;
    written.current = null;
    latest.current = { record: null, status: "empty", recovery: false };
    setState(latest.current);
    return true;
  }, []);
  const withoutSaving = useCallback(() => {
    writable.current = false;
    written.current = null;
    latest.current = { record: null, status: "session_only", recovery: false };
    setState(latest.current);
  }, []);
  return {
    ...state,
    setRecord,
    clear,
    withoutSaving,
  };
}
