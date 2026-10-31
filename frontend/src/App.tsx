import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Setup, type WorkspaceSetup } from "./pages/Setup";
import { defaultEditor } from "./data/demoScenario";

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSetup | null>(null);
  const [screen, setScreen] = useState<"setup" | "dashboard">("setup");
  return screen === "setup" ? (
    <Setup
      initial={workspace}
      onComplete={(value) => {
        setWorkspace(value);
        setScreen("dashboard");
        window.scrollTo(0, 0);
      }}
      onDemo={() => {
        setWorkspace({
          name: "Demonstration building",
          businessType: "Synthetic commercial example",
          employees: "",
          monthlyBill: "",
          goals: [],
          editor: { ...defaultEditor },
          mode: "joint",
        });
        setScreen("dashboard");
        window.scrollTo(0, 0);
      }}
    />
  ) : (
    <Dashboard
      initialEditor={workspace?.editor}
      initialMode={workspace?.mode}
      workspaceName={workspace?.name}
      businessProfile={
        workspace
          ? {
              business_type: workspace.businessType,
              operating_hours: `${workspace.editor.opening}:00–${workspace.editor.closing}:00`,
              employee_count:
                workspace.employees === "" ? null : Number(workspace.employees),
              electricity_cost_and_period:
                workspace.monthlyBill === ""
                  ? null
                  : `USD ${workspace.monthlyBill} per month`,
              goals: workspace.goals.join(", ") || null,
            }
          : undefined
      }
      onSetup={(editor, mode) => {
        setWorkspace((value) => (value ? { ...value, editor, mode } : null));
        setScreen("setup");
        window.scrollTo(0, 0);
      }}
    />
  );
}
