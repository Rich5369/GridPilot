import { useCallback, useState, useRef } from "react";
import { Zap } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { Setup } from "./pages/Setup";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";
import { isDashboardRoute } from "./services/navigation";
import { useSavedWorkspace } from "./hooks/useSavedWorkspace";
import { demoWorkspace } from "./services/workspaceStorage";
import type { WorkspaceSetup } from "./types/workspace";
import type { ScenarioEditor } from "./types/dashboard";
import { optimizeScenario, type SchedulingMode } from "./services/api";
import { toScenario, validateEditor } from "./data/demoScenario";
import { effectiveMode } from "./data/analysisOptions";
import { formatWindow } from "./data/time";
import type { InitialCalculation } from "./types/initialCalculation";

export default function App() {
  const { record, setRecord, status, clear, withoutSaving, recovery } =
    useSavedWorkspace();
  const { route, navigate } = useWorkspaceNavigation();
  const [resumed, setResumed] = useState(() => record?.completed ?? false);
  const [session, setSession] = useState(0);
  const [pending, setPending] = useState<"clear" | "demo" | null>(null);
  const workspace = record?.workspace;
  const [initialCalculation, setInitialCalculation] =
    useState<InitialCalculation | null>(null);
  const setupPending = useRef<object | null>(null);
  const consumeInitial = useCallback(() => setInitialCalculation(null), []);
  const resetView = () => {
    navigate("setup");
    setSession((n) => n + 1);
    window.scrollTo(0, 0);
  };
  const saveDraft = useCallback(
    (draft: WorkspaceSetup, step: number) => {
      setRecord(() => ({
        version: 1,
        workspace: draft,
        step,
        completed: false,
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
  function complete(value: WorkspaceSetup, calculate = false) {
    if (setupPending.current) return;
    if (calculate && Object.keys(validateEditor(value.editor)).length) return;
    value = { ...value, mode: effectiveMode(value.editor, value.mode) };
    if (calculate) {
      const token = {};
      setupPending.current = token;
      const scenario = toScenario(value.editor);
      const promise = optimizeScenario(scenario, value.mode);
      void promise.then(
        () => {
          if (setupPending.current === token) setupPending.current = null;
        },
        () => {
          if (setupPending.current === token) setupPending.current = null;
        },
      );
      setInitialCalculation({
        editor: structuredClone(value.editor),
        scenario,
        mode: value.mode,
        promise,
      });
    } else setInitialCalculation(null);
    setRecord({ version: 1, workspace: value, step: 3, completed: true });
    setResumed(false);
    navigate("overview");
    window.scrollTo(0, 0);
  }
  function edit(editor?: ScenarioEditor, mode?: SchedulingMode) {
    setInitialCalculation(null);
    setupPending.current = null;
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
      setInitialCalculation(null);
      setupPending.current = null;
      resetView();
    } else if (pending === "demo") {
      setupPending.current = null;
      complete(demoWorkspace());
    }
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
  return !isDashboardRoute(route) || !workspace || !record?.completed ? (
    <Setup
      key={`${session}:${route === "setup" ? "edit" : "entry"}`}
      initial={workspace}
      initialStep={route === "setup" && record?.completed ? 0 : record?.step}
      completed={route !== "setup" && record?.completed}
      entryMessage={
        isDashboardRoute(route) && !record?.completed
          ? "Finish or resume your building setup to open this dashboard section. No inputs have been replaced."
          : undefined
      }
      workspaceControls={controls}
      onDraftChange={saveDraft}
      onComplete={(value) => complete(value, true)}
      onContinue={() => {
        setResumed(true);
        setInitialCalculation(null);
        navigate(isDashboardRoute(route) ? route : "overview");
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
      initialCalculation={initialCalculation}
      onInitialSettled={consumeInitial}
      selectedView={route}
      onNavigate={navigate}
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
        equipment: workspace.editor.customEquipment
          ? `${workspace.editor.customEquipment.name}: ${workspace.editor.customEquipment.description} (${workspace.editor.customEquipment.kind})`.slice(
              0,
              500,
            )
          : null,
        operating_hours: formatWindow(
          workspace.editor.opening,
          workspace.editor.closing,
        ),
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
