import { useCallback, useState } from "react";
import { Zap } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { Setup } from "./pages/Setup";
import { useSavedWorkspace } from "./hooks/useSavedWorkspace";
import { demoWorkspace } from "./services/workspaceStorage";
import type { WorkspaceSetup } from "./types/workspace";
import type { ScenarioEditor } from "./types/dashboard";
import type { SchedulingMode } from "./services/api";

export default function App() {
  const { record, setRecord, status, clear, withoutSaving, recovery } =
    useSavedWorkspace();
  const [screen, setScreen] = useState<"setup" | "dashboard">("setup");
  const [resumed, setResumed] = useState(false);
  const [session, setSession] = useState(0);
  const [pending, setPending] = useState<"clear" | "demo" | null>(null);
  const workspace = record?.workspace;
  const resetView = () => {
    setScreen("setup");
    setSession((n) => n + 1);
    window.scrollTo(0, 0);
  };
  const saveDraft = useCallback(
    (draft: WorkspaceSetup, step: number) => {
      setRecord((previous) => ({
        version: 1,
        workspace: draft,
        step,
        completed: previous?.completed ?? false,
      }));
    },
    [setRecord],
  );
  const saveInputs = useCallback(
    (editor: ScenarioEditor, mode: SchedulingMode) => {
      setRecord((previous) =>
        previous
          ? { ...previous, workspace: { ...previous.workspace, editor, mode } }
          : previous,
      );
    },
    [setRecord],
  );
  const saveBusinessContext = useCallback(
    (profile: Record<string, string | number | null>) => {
      setRecord((previous) =>
        previous
          ? {
              ...previous,
              workspace: { ...previous.workspace, businessContext: profile },
            }
          : previous,
      );
    },
    [setRecord],
  );
  function complete(value: WorkspaceSetup) {
    setRecord({ version: 1, workspace: value, step: 3, completed: true });
    setResumed(false);
    setScreen("dashboard");
    window.scrollTo(0, 0);
  }
  function edit(editor?: ScenarioEditor, mode?: SchedulingMode) {
    setRecord((previous) =>
      previous
        ? {
            ...previous,
            completed: false,
            step: 0,
            workspace: {
              ...previous.workspace,
              editor: editor ?? previous.workspace.editor,
              mode: mode ?? previous.workspace.mode,
            },
          }
        : previous,
    );
    resetView();
  }
  function confirm() {
    if (pending === "clear") {
      if (!clear()) return;
      resetView();
    } else if (pending === "demo") complete(demoWorkspace());
    setPending(null);
  }
  const messages: Partial<Record<typeof status, string>> = {
    unavailable:
      "Browser storage is unavailable. Your inputs stay in this session only; any previous saved data has not been replaced.",
    write_failed:
      "Changes could not be saved in this browser. Your current inputs are still here, but the last successful save may be older.",
    clear_failed:
      "Browser storage could not be cleared. Your workspace has not been removed. Enable storage and try again.",
    invalid:
      "The saved workspace could not be validated. Its data has not been replaced. Clear it to start again, or continue without saving.",
    outdated:
      "This saved workspace uses an unsupported version. Its data has not been replaced. Clear it to start again, or continue without saving.",
    session_only:
      "Working without saving. Any previous browser data has been left untouched. Refreshing will lose this session’s changes.",
  };
  const label =
    status === "saved"
      ? "Saved in this browser"
      : status === "empty"
        ? "Changes will be saved in this browser"
        : "Not saved";
  const controls = (
    <div className="workspace-storage" data-storage-status={status}>
      <span className="workspace-storage-scope" role="status">
        {label}
      </span>
      {workspace?.kind === "demo" && (
        <span className="tag">Demonstration workspace</span>
      )}
      {(record || recovery) && (
        <button
          type="button"
          className="workspace-storage-link"
          onClick={() => setPending("clear")}
        >
          Clear saved workspace
        </button>
      )}
      {messages[status] && (
        <p className="workspace-storage-warning" role="status">
          {messages[status]}
        </p>
      )}
      {pending && (
        <div className="workspace-confirm" role="alert">
          <p>
            {pending === "clear"
              ? "Clear the saved building and setup draft from this browser?"
              : "Replace your saved workspace with a clearly labeled demonstration workspace?"}
          </p>
          <button type="button" className="secondary" onClick={confirm}>
            {pending === "clear"
              ? "Clear workspace"
              : "Replace with demonstration"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setPending(null)}
          >
            Keep workspace
          </button>
        </div>
      )}
    </div>
  );
  if (recovery)
    return (
      <div className="setup-page">
        <header className="site-header">
          <span className="brand">
            <Zap />
            GridPilot
          </span>
        </header>
        <main className="setup-main">
          <section className="setup-card workspace-recovery">
            <h1>Saved workspace needs attention</h1>
            {controls}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                withoutSaving();
                setPending(null);
                resetView();
              }}
            >
              Continue without saving
            </button>
          </section>
        </main>
      </div>
    );
  return screen === "setup" || !workspace ? (
    <Setup
      key={session}
      initial={workspace}
      initialStep={record?.step}
      completed={record?.completed}
      workspaceControls={controls}
      onDraftChange={saveDraft}
      onComplete={complete}
      onContinue={() => {
        setResumed(true);
        setScreen("dashboard");
        window.scrollTo(0, 0);
      }}
      onEdit={() => edit()}
      onDemo={() => {
        if (record) setPending("demo");
        else complete(demoWorkspace());
      }}
    />
  ) : (
    <Dashboard
      initialEditor={workspace.editor}
      initialMode={workspace.mode}
      workspaceName={workspace.name}
      workspaceControls={controls}
      resumed={resumed}
      onInputsChange={saveInputs}
      onBusinessContextChange={saveBusinessContext}
      businessContextLabel={
        workspace.businessContext
          ? status === "saved"
            ? "Saved in this browser"
            : "Current building context"
          : "From setup"
      }
      businessProfile={{
        business_type: workspace.businessType,
        operating_hours: `${workspace.editor.opening}:00–${workspace.editor.closing}:00`,
        employee_count:
          workspace.employees === "" ? null : Number(workspace.employees),
        electricity_cost_and_period:
          workspace.monthlyBill === ""
            ? null
            : `USD ${workspace.monthlyBill} per month`,
        goals: workspace.goals.join(", ") || null,
        ...workspace.businessContext,
      }}
      onSetup={edit}
    />
  );
}
