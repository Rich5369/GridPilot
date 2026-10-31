import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  Leaf,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { ScenarioPanel } from "../components/configuration/ScenarioPanel";
import { profileSource, validateEditor } from "../data/demoScenario";
import type { SchedulingMode } from "../services/api";
import buildingImage from "../assets/commercial-building.webp";

import type { WorkspaceSetup } from "../types/workspace";
import {
  emptyWorkspace,
  businessTypes,
  workspaceGoals as goals,
} from "../services/workspaceStorage";
export type { WorkspaceSetup } from "../types/workspace";
const steps = [
  "Company info",
  "Energy profile",
  "Your goals",
  "Create workspace",
];
export function Setup({
  initial,
  onComplete,
  onDemo,
  initialStep = 0,
  completed = false,
  onDraftChange,
  onContinue,
  onEdit,
  workspaceControls,
}: {
  initial?: WorkspaceSetup | null;
  onComplete: (setup: WorkspaceSetup) => void;
  onDemo: () => void;
  initialStep?: number;
  completed?: boolean;
  onDraftChange?: (draft: WorkspaceSetup, step: number) => void;
  onContinue?: () => void;
  onEdit?: () => void;
  workspaceControls?: ReactNode;
}) {
  const [draft, setDraft] = useState<WorkspaceSetup>(
    () => initial ?? emptyWorkspace(),
  );
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState("");
  useEffect(() => {
    if (step === 0) return;
    const title = document.getElementById("setup-title");
    title?.focus({ preventScroll: true });
    title
      ?.closest(".setup-card")
      ?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [step]);
  function update(value: Partial<WorkspaceSetup>) {
    const next = { ...draft, ...value };
    if (draft.businessContext) {
      next.businessContext = { ...draft.businessContext };
      if (value.businessType !== undefined)
        next.businessContext.business_type = value.businessType || null;
      if (value.employees !== undefined)
        next.businessContext.employee_count =
          value.employees === "" ? null : Number(value.employees);
      if (value.monthlyBill !== undefined)
        next.businessContext.electricity_cost_and_period =
          value.monthlyBill === ""
            ? null
            : `USD ${value.monthlyBill} per month`;
      if (value.goals !== undefined)
        next.businessContext.goals = value.goals.join(", ") || null;
      if (
        value.editor &&
        (value.editor.opening !== draft.editor.opening ||
          value.editor.closing !== draft.editor.closing)
      )
        next.businessContext.operating_hours = `${value.editor.opening}:00–${value.editor.closing}:00`;
    }
    setDraft(next);
    onDraftChange?.(next, step);
  }
  function changeStep(next: number) {
    setStep(next);
    onDraftChange?.(draft, next);
  }
  function next(event: FormEvent) {
    event.preventDefault();
    if (step === 0 && (!draft.name.trim() || !draft.businessType)) {
      setError("Enter a business name and choose a business type.");
      return;
    }
    if (Object.keys(validateEditor(draft.editor)).length) {
      setError(
        "Check the energy profile: hours must be within one day and all values must be valid.",
      );
      if (step !== 1) changeStep(1);
      return;
    }
    setError("");
    if (step < 3) {
      changeStep(step + 1);
      return;
    }
    onComplete({ ...draft, name: draft.name.trim() });
  }
  function toggleGoal(goal: string) {
    if (!draft.goals.includes(goal) && draft.goals.length === 3) return;
    update({
      goals: draft.goals.includes(goal)
        ? draft.goals.filter((g) => g !== goal)
        : [...draft.goals, goal],
    });
  }
  return (
    <div className="setup-page">
      <a className="skip-link" href="#setup-form">
        Skip to business setup
      </a>
      <header className="site-header">
        <a href="#" className="brand" aria-label="GridPilot home">
          <span className="brand-icon">
            <Zap fill="currentColor" />
          </span>
          GridPilot
        </a>
        <nav aria-label="Website navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#the-model">The planning model</a>
        </nav>
        <button className="setup-demo" onClick={onDemo}>
          Explore demo <ArrowRight size={15} />
        </button>
      </header>
      <main className="setup-main">
        <div className="setup-heading">
          <p className="eyebrow">
            <span className="status-dot" />
            COMMERCIAL ENERGY, CLEARER
          </p>
          <h1>
            From insight to impact.
            <br />
            <span>A smarter energy plan.</span>
          </h1>
          <p>
            A clearer picture of your building. A practical plan for your
            energy.
          </p>
        </div>
        <div className="setup-layout">
          <aside className="setup-intro">
            <div className="intro-copy">
              <span className="section-kicker">
                BUILT AROUND YOUR OPERATIONS
              </span>
              <h2>
                Better energy decisions.
                <br />A little less guesswork.
              </h2>
              <p>
                Bring your building, charging needs and electricity rates
                together. See what can shift, what it costs, and where your
                limits are.
              </p>
              <div className="intro-benefits">
                <span>
                  <Gauge size={18} />
                  Understand your peaks
                </span>
                <span>
                  <Clock3 size={18} />
                  Plan around your hours
                </span>
                <span>
                  <ShieldCheck size={18} />
                  Check every constraint
                </span>
              </div>
            </div>
            <figure className="building-figure">
              <img
                src={buildingImage}
                alt="Illustrative commercial building at dusk with delivery vans and EV charging stations"
              />
              <figcaption>
                <span>
                  <Building2 size={15} />A more resilient working day
                </span>
                <small>Illustrative site · not a connected facility</small>
              </figcaption>
            </figure>
            <p className="intro-footnote">
              <ShieldCheck size={16} />
              Your building stays in this browser. No account, cross-device sync
              or hardware connection required.
            </p>
          </aside>
          <section className="setup-card" aria-labelledby="setup-title">
            <div className="setup-card-top">
              <span className="section-kicker">YOUR ENERGY WORKSPACE</span>
              <span>
                {completed ? "Building saved" : `Step ${step + 1} of 4`}
              </span>
            </div>
            {workspaceControls}
            {completed ? (
              <div className="workspace-resume">
                <div className="ready-icon">
                  <CheckCircle2 size={30} />
                </div>
                <h2 id="setup-title">Welcome back, {draft.name}</h2>
                {draft.kind === "demo" && (
                  <p className="tag">
                    Demonstration workspace · synthetic inputs
                  </p>
                )}
                <p>
                  Your building inputs are ready. Optimizer results are not
                  restored; run optimization explicitly for fresh results.
                </p>
                <button
                  type="button"
                  className="run-button"
                  onClick={onContinue}
                >
                  Continue to your building <ArrowRight size={17} />
                </button>
                <button type="button" className="secondary" onClick={onEdit}>
                  Edit building
                </button>
              </div>
            ) : (
              <>
                <ol className="setup-progress" aria-label="Setup progress">
                  {steps.map((label, i) => (
                    <li
                      key={label}
                      aria-current={step === i ? "step" : undefined}
                      className={i <= step ? "is-reached" : ""}
                    >
                      <span>{i < step ? <Check size={14} /> : i + 1}</span>
                      <small>{label}</small>
                    </li>
                  ))}
                </ol>
                <div className="setup-form-heading">
                  <h2 id="setup-title" tabIndex={-1}>
                    {
                      [
                        "Tell us about your business",
                        "Build your energy profile",
                        "What matters most to you?",
                        "Your workspace is ready",
                      ][step]
                    }
                  </h2>
                  <p>
                    {
                      [
                        "A little context makes this workspace yours. Start with the basics.",
                        "Review the example inputs or replace them with your own hourly data.",
                        "Choose up to three priorities. Goals guide your planning, not the solver objective.",
                        "Check your inputs, then explore your building’s energy plan.",
                      ][step]
                    }
                  </p>
                </div>
                {/* The reused panel accepts fractional energy; use its engineering validator. */}
                <form id="setup-form" onSubmit={next} noValidate={step === 1}>
                  {step === 0 && (
                    <>
                      <div className="setup-fields">
                        <label>
                          Business name <span className="required">*</span>
                          <input
                            name="businessName"
                            value={draft.name}
                            onChange={(e) => update({ name: e.target.value })}
                            placeholder="e.g. Northstar Logistics"
                            maxLength={100}
                            required
                            autoComplete="organization"
                          />
                        </label>
                        <label>
                          Business type <span className="required">*</span>
                          <select
                            value={draft.businessType}
                            onChange={(e) =>
                              update({ businessType: e.target.value })
                            }
                            required
                          >
                            <option value="">Select your business</option>
                            {[
                              ...businessTypes,
                              ...(draft.kind === "demo"
                                ? ["Synthetic commercial example"]
                                : []),
                            ].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Opening hour
                          <input
                            type="number"
                            min="0"
                            max="23"
                            step="1"
                            value={draft.editor.opening}
                            onChange={(e) =>
                              update({
                                editor: {
                                  ...draft.editor,
                                  opening: e.target.value,
                                },
                              })
                            }
                            required
                          />
                        </label>
                        <label>
                          Closing hour
                          <input
                            type="number"
                            min="1"
                            max="24"
                            step="1"
                            value={draft.editor.closing}
                            onChange={(e) =>
                              update({
                                editor: {
                                  ...draft.editor,
                                  closing: e.target.value,
                                },
                              })
                            }
                            required
                          />
                        </label>
                        <label>
                          Number of employees <small>Optional</small>
                          <input
                            type="number"
                            min="0"
                            max="10000000"
                            step="1"
                            value={draft.employees}
                            onChange={(e) =>
                              update({ employees: e.target.value })
                            }
                            placeholder="e.g. 50"
                          />
                        </label>
                        <label>
                          Monthly electricity bill <small>Optional · USD</small>
                          <div className="currency-input">
                            <span>$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.monthlyBill}
                              onChange={(e) =>
                                update({ monthlyBill: e.target.value })
                              }
                              placeholder="Not provided"
                            />
                          </div>
                        </label>
                      </div>
                      <p className="field-hint">
                        Use whole hours in building-local time, e.g. 8–18.
                        Business context does not generate or replace measured
                        demand.
                      </p>
                      <fieldset className="setup-choices">
                        <legend>Loads to include in your scenario</legend>
                        <div>
                          {[
                            ["EV charging", Number(draft.editor.chargers) > 0],
                            [
                              "Interruptible equipment",
                              Number(draft.editor.duration) > 0,
                            ],
                          ].map(([label, selected]) => (
                            <button
                              key={String(label)}
                              type="button"
                              aria-pressed={Boolean(selected)}
                              onClick={() =>
                                update({
                                  editor: {
                                    ...draft.editor,
                                    ...(label === "EV charging"
                                      ? { chargers: selected ? "0" : "2" }
                                      : { duration: selected ? "0" : "2" }),
                                  },
                                })
                              }
                            >
                              <span className="choice-box">
                                {selected && <Check size={12} />}
                              </span>
                              {label}
                            </button>
                          ))}
                          <span className="fixed-load-chip">
                            <Building2 size={13} />
                            Fixed building demand
                          </span>
                        </div>
                      </fieldset>
                    </>
                  )}
                  {step === 1 && (
                    <div className="setup-energy">
                      <label className="setup-mode">
                        Scheduling mode
                        <select
                          value={draft.mode}
                          onChange={(e) =>
                            update({ mode: e.target.value as SchedulingMode })
                          }
                        >
                          <option value="joint">EV + flexible equipment</option>
                          <option value="ev_only">
                            EV-only · hold equipment at baseline
                          </option>
                        </select>
                      </label>
                      <p className="setup-notice">
                        <Sparkles size={16} />
                        Example demand and rates are prefilled. They are
                        synthetic planning inputs, not your building’s
                        measurements.
                      </p>
                      <ScenarioPanel
                        editor={draft.editor}
                        onChange={(editor) => update({ editor })}
                      />
                    </div>
                  )}
                  {step === 2 && (
                    <>
                      <div className="goal-options">
                        {goals.map((goal, i) => (
                          <button
                            type="button"
                            key={goal}
                            aria-pressed={draft.goals.includes(goal)}
                            disabled={
                              draft.goals.length === 3 &&
                              !draft.goals.includes(goal)
                            }
                            onClick={() => toggleGoal(goal)}
                          >
                            <span>
                              {i === 0 ? (
                                <Zap size={20} />
                              ) : i === 1 ? (
                                <Gauge size={20} />
                              ) : i === 2 ? (
                                <Leaf size={20} />
                              ) : (
                                <Building2 size={20} />
                              )}
                            </span>
                            {goal}
                            <span className="goal-check">
                              {draft.goals.includes(goal) && (
                                <Check size={15} />
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="field-hint">
                        {draft.goals.length} of 3 selected. Optimization
                        minimizes modeled daily energy charges, then peak
                        demand. No sustainability or utility-bill savings are
                        calculated.
                      </p>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <div className="ready-icon">
                        <CheckCircle2 size={30} />
                      </div>
                      <dl className="setup-review">
                        <div>
                          <dt>Building</dt>
                          <dd>
                            {draft.name} <small>{draft.businessType}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Planning window</dt>
                          <dd>
                            24 hourly intervals{" "}
                            <small>One abstract building-local day</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Site power limit</dt>
                          <dd>{draft.editor.limit} kW</dd>
                        </div>
                        <div>
                          <dt>Scheduling</dt>
                          <dd>
                            {draft.mode === "joint"
                              ? "EV + flexible equipment"
                              : "EV-only"}
                          </dd>
                        </div>
                        <div>
                          <dt>Priorities</dt>
                          <dd>
                            {draft.goals.join(" · ") || "Explore energy use"}
                          </dd>
                        </div>
                      </dl>
                      <p className="setup-notice">
                        {profileSource(draft.editor)}. No optimization has run
                        yet. Your dashboard will show results only after you
                        submit a scenario.
                      </p>
                    </>
                  )}
                  {error && (
                    <p className="field-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="setup-actions">
                    {step > 0 && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          changeStep(step - 1);
                          setError("");
                        }}
                      >
                        <ArrowLeft size={15} />
                        Back
                      </button>
                    )}
                    <button className="run-button" type="submit">
                      {
                        [
                          "Continue to energy profile",
                          "Continue to your goals",
                          "Review workspace",
                          "Create my workspace",
                        ][step]
                      }
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <p className="setup-bottom-note">
                    <ShieldCheck size={12} />
                    Planning only. No equipment is controlled or connected.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
        <section id="how-it-works" className="setup-how">
          <div>
            <p className="section-kicker">A CLEARER WAY FORWARD</p>
            <h2>Your building. Your constraints. Your plan.</h2>
          </div>
          <div className="how-grid">
            {[
              [
                "01",
                "Bring your context",
                "Set your building profile, rates and operating constraints.",
              ],
              [
                "02",
                "See the possibilities",
                "Run the real optimizer to compare baseline demand and a verified schedule.",
              ],
              [
                "03",
                "Choose your next move",
                "Explore what-if scenarios and review the tradeoffs before making a decision.",
              ],
            ].map(([n, title, copy]) => (
              <article key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="the-model" className="setup-model">
          <ShieldCheck size={22} />
          <div>
            <h2>Clarity includes knowing the limits.</h2>
            <p>
              GridPilot models one day with hourly averages, fixed building
              demand, EV charging and interruptible equipment. Results estimate
              energy charges—not full utility bills or measured savings. AI
              guidance supports your review; the optimizer supplies the numbers.
            </p>
          </div>
          <a href="#setup-form">
            Build your plan <ChevronRight size={16} />
          </a>
        </section>
      </main>
      <footer className="site-footer">
        <span className="brand">
          <Zap size={19} fill="currentColor" />
          GridPilot
        </span>
        <span>Commercial energy planning, with a clearer view.</span>
        <span>Plan thoughtfully. Act with confidence.</span>
      </footer>
    </div>
  );
}
