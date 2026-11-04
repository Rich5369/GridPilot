import { useEffect, useRef, useState, useCallback } from "react";
import {
  calculateSavings,
  converseSavings,
  getSavingsCatalog,
  savingsFailure,
} from "../../services/savings";
import type {
  SavingsDraft,
  SavingsCatalog,
  SavingsProfile,
  SavingsCategory,
  SavingsResponse,
  SavingsConversationResponse,
  SavingsRequest,
} from "../../types/savings";
import { savingsCategories } from "../../types/savings";
import {
  emptySavingsDraft,
  newSavingsMeasure,
  syntheticLedDraft,
  mapSavingsProfile,
  profileLimits,
  locationLimits,
  buildSavingsRequest,
  categoryApplicability,
  isCalculatedCategory,
  calculationFields,
} from "../../data/savingsDraft";
import type {
  CalculatedCategory,
  SavingsErrors,
} from "../../data/savingsDraft";
import { SavingsMeasureForm, ConfirmSelect } from "./SavingsMeasureForm";
import { SavingsResults } from "./SavingsResults";
import states from "../../data/usStates.json";
type Accepted = {
  response: SavingsResponse;
  conversation: SavingsConversationResponse | null;
  request: SavingsRequest;
  confirmed: Partial<Record<SavingsCategory, boolean>>;
  key: string;
  question: string;
};
const titles: Record<CalculatedCategory, string> = {
  led: "LED lighting replacement",
  lighting_controls: "Lighting occupancy controls",
  shutdown: "After-hours equipment shutdown",
  office: "Office equipment power management",
  motor: "Motor/system consumption",
  refrigeration: "Refrigeration consumption",
};
const profileLabels: Record<keyof SavingsProfile, string> = {
  business_type: "Business type",
  employee_count: "Employee count",
  operating_hours: "Business operating hours",
  electricity_cost_and_period:
    "Electricity spending and billing period",
  consumption_and_units: "Reported consumption and units",
  equipment: "Equipment descriptions",
  goals: "Goals",
  restrictions: "Restrictions",
};
export function SavingsOpportunities({
  businessProfile,
  onProfileChange,
  initialDraft,
  onDraftChange,
  onScheduling,
  workspaceName,
}: {
  businessProfile?: Record<string, string | number | null>;
  onProfileChange?: (p: Record<string, string | number | null>) => void;
  initialDraft?: SavingsDraft;
  onDraftChange?: (d: SavingsDraft) => void;
  onScheduling: () => void;
  workspaceName: string;
}) {
  const [draft, setDraft] = useState<SavingsDraft>(
    () => initialDraft ?? emptySavingsDraft(),
  );
  const [localProfile, setLocalProfile] = useState(() =>
    mapSavingsProfile(businessProfile),
  );
  const profile = onProfileChange
    ? mapSavingsProfile(businessProfile)
    : localProfile;
  const [catalog, setCatalog] = useState<SavingsCatalog | null>(null),
    [catalogError, setCatalogError] = useState(""),
    [catalogRevision, setCatalogRevision] = useState(0);
  const [category, setCategory] = useState<CalculatedCategory>("led"),
    [activeProject, setActiveProject] = useState<number | null>(null),
    [investigation, setInvestigation] = useState<SavingsCategory | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [errors, setErrors] = useState<SavingsErrors>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState<"calculation" | "conversation" | null>(null),
    [accepted, setAccepted] = useState<Accepted | null>(null),
    [replaceExample, setReplaceExample] = useState(false);
  const [history, setHistory] = useState<{
    context: string;
    turns: { role: "user" | "assistant"; content: string }[];
  } | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(
      null,
    ),
    sequence = useRef(0),
    mounted = useRef(true);
  const key = JSON.stringify([draft, profile]);
  const currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
  }, [key]);
  useEffect(() => {
    if (!accepted || accepted.key !== currentKey.current) return;
    const results = document.getElementById("savings-results");
    results?.focus({ preventScroll: true });
    results?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [accepted]);
  const abortOnUnmount = useCallback(() => {
    mounted.current = false;
    sequence.current++;
    requestRef.current?.controller.abort();
  }, []);
  useEffect(() => {
    mounted.current = true;
    return abortOnUnmount;
  }, [abortOnUnmount]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void getSavingsCatalog(controller.signal).then(
      (v) => {
        if (active) {
          setCatalog(v);
          setCatalogError("");
        }
      },
      (e) => {
        if (active && !controller.signal.aborted)
          setCatalogError(savingsFailure(e).message);
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [catalogRevision]);
  useEffect(() => {
    if (activeProject === null) return;
    const section = document.getElementById(`savings-project-${activeProject}`);
    section?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
    section
      ?.querySelector<HTMLInputElement>("input")
      ?.focus({ preventScroll: true });
  }, [activeProject]);
  function update(next: SavingsDraft) {
    setDraft(next);
    onDraftChange?.(next);
  }
  function updateProfile(k: keyof SavingsProfile, value: string) {
    const next = {
      ...profile,
      [k]:
        k === "employee_count"
          ? value === ""
            ? null
            : Number(value)
          : value || null,
    };
    if (onProfileChange) onProfileChange(next);
    else setLocalProfile(next);
  }
  function add(c: SavingsCategory) {
    if (!isCalculatedCategory(c)) {
      setInvestigation(c);
      return;
    }
    if (draft.measures.length >= 100) {
      setMessage("At most 100 projects can be submitted.");
      return;
    }
    update({ ...draft, measures: [...draft.measures, newSavingsMeasure(c)] });
    setActiveProject(draft.measures.length);
  }
  function answer(id: string, c: SavingsCategory) {
    const i = draft.measures.findIndex((m) => m.id === id);
    if (i >= 0) {
      setActiveProject(i);
      const form = document.getElementById(
        `savings-project-${i}`,
      ) as HTMLDetailsElement | null;
      if (form) {
        form.open = true;
        form.scrollIntoView?.({ block: "start", behavior: "instant" });
        form
          .querySelector<HTMLInputElement>("input")
          ?.focus({ preventScroll: true });
      }
    } else add(c);
  }
  function loadExample() {
    update({ ...draft, measures: [syntheticLedDraft()] });
    setActiveProject(0);
    setReplaceExample(false);
    setMessage(
      "Synthetic LED example loaded. Review its fictional rate dates before calculating.",
    );
  }
  async function submit(kind: "calculation" | "conversation") {
    if (requestRef.current) return;
    const built = buildSavingsRequest(draft, profile),
      nextErrors = { ...built.errors };
    if (kind === "conversation" && !draft.question.trim())
      nextErrors.question =
        "Enter a question before requesting optional AI selection.";
    setErrors(nextErrors);
    setMessage("");
    setCanRetry(false);
    if (Object.keys(nextErrors).length) {
      setMessage(
        "Review the savings input errors. Unknown measurements may remain blank; identity and evidence references are required for submitted projects.",
      );
      return;
    }
    const controller = new AbortController(),
      id = ++sequence.current;
    requestRef.current = { id, controller };
    setBusy(kind);
    const confirmed = categoryApplicability(draft),
      submittedKey = key,
      request = built.request,
      question = draft.question;
    const context = JSON.stringify([request, confirmed]),
      prior = history?.context === context ? history.turns : [];
    try {
      const conversation =
        kind === "conversation"
          ? await converseSavings(
              {
                request: question,
                history: prior.slice(-12),
                evidence: request,
                category_applicability: confirmed,
              },
              controller.signal,
            )
          : null;
      const response =
        conversation?.savings ??
        (await calculateSavings(request, controller.signal));
      if (!mounted.current || id !== sequence.current) return;
      setAccepted({
        response,
        conversation,
        request,
        confirmed,
        key: submittedKey,
        question,
      });
      if (conversation)
        setHistory({
          context,
          turns: [
            ...prior,
            { role: "user", content: question },
            { role: "assistant", content: conversation.message.slice(0, 3000) },
          ].slice(-12) as { role: "user" | "assistant"; content: string }[],
        });
      setMessage("Savings estimates ready.");
    } catch (e) {
      if (!mounted.current || id !== sequence.current) return;
      const failure = savingsFailure(e);
      setErrors(failure.fields);
      setMessage(failure.message);
      setCanRetry(true);
    } finally {
      if (mounted.current && id === sequence.current) {
        requestRef.current = null;
        setBusy(null);
      }
    }
  }
  function cancel() {
    sequence.current++;
    requestRef.current?.controller.abort();
    requestRef.current = null;
    setBusy(null);
    setCanRetry(true);
    setMessage(
      "Stopped waiting. Your inputs and previous results are retained. The server may still be processing; wait before an explicit retry. No automatic retry or AI request will run.",
    );
  }
  const stale = !!accepted && accepted.key !== key;
  const name = (c: SavingsCategory) =>
    catalog?.categories.find((d) => d.category === c)?.title ??
    (isCalculatedCategory(c) ? titles[c] : c.replaceAll("_", " "));
  useEffect(() => {
    if (investigation)
      document
        .getElementById("savings-investigation")
        ?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [investigation]);
  const descriptor = catalog?.categories.find(
    (d) => d.category === investigation,
  );
  return (
    <div className="savings-workspace">
      <section className="panel savings-intro">
        <p className="eyebrow">BUILDING OPPORTUNITIES · ANNUAL ESTIMATES</p>
        <p>Explore improvements for your building. Add the details you know to estimate energy savings, costs, and payback.</p>
        <p><strong>{workspaceName}</strong> · {profile.business_type ?? 'Business type not provided'}</p>
        <button
          type="button"
          className="run-button"
          aria-controls="savings-conversation"
          onClick={() => {
            if (!draft.question.trim())
              update({ ...draft, question: "How can my business lower its electricity costs?" });
            const section = document.getElementById("savings-conversation") as HTMLDetailsElement;
            section.open = true;
            section.querySelector("textarea")?.focus();
          }}
        >
          Ask Meta Energy Advisor
        </button>{" "}
        <a className="secondary" href="#savings-building-context" onClick={(e) => { e.preventDefault(); const details = document.getElementById('savings-building-context') as HTMLDetailsElement; details.open = true; details.scrollIntoView?.({block:'start'}); details.querySelector('input')?.focus(); }}>Edit building summary</a>
        <details><summary>How this was calculated</summary><p>Modeled annual estimates are for individual improvements and must not be added into a portfolio total. Inputs are saved in this browser; results stay in this session. Annual improvements do not require a daily plan. Opening hours, monthly spending and regional benchmarks do not establish equipment measurements or your electricity rate.</p></details>
        {catalogError && (
          <p className="savings-warning" role="status">
            Catalog unavailable: {catalogError} The supported project forms and
            non-AI calculation remain available.{" "}
            <button
              type="button"
              className="secondary"
              onClick={() => setCatalogRevision((n) => n + 1)}
            >
              Retry catalog
            </button>
          </p>
        )}
      </section>
      <details id="savings-conversation" className="panel savings-conversation">
        <summary>Help me find opportunities</summary>
        <p>Ask for help choosing an improvement. AI can suggest relevant opportunities. For daily plan advice, use Ask Energy Advisor.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit("conversation");
          }}
        >
          <div className="field">
            <label htmlFor="savings-question">
              Question about savings opportunities
            </label>
            <textarea
              id="savings-question"
              rows={3}
              maxLength={2000}
              value={draft.question}
              onChange={(e) => update({ ...draft, question: e.target.value })}
              aria-invalid={!!errors.question}
              aria-describedby="savings-ai-boundary"
            />
          </div>
          <p id="savings-ai-boundary" className="field-hint">
            Your question draft is saved in this browser. Conversations stay in this session.
          </p>
          <button
            className="run-button"
            type="submit"
            disabled={!!busy || !draft.question.trim()}
          >
            Submit question
          </button>
        </form>
      </details>
      <form
        id="savings-evidence"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit("calculation");
        }}
      >
        <details id="savings-building-context" className="panel savings-context">
          <summary>About your building</summary>
          <div className="form-grid">
            {(Object.keys(profileLimits) as (keyof SavingsProfile)[]).map(
              (k) => (
                <div className="field" key={k}>
                  <label htmlFor={`savings-profile-${k}`}>
                    {profileLabels[k]}
                  </label>
                  <input
                    id={`savings-profile-${k}`}
                    type={k === "employee_count" ? "number" : "text"}
                    maxLength={profileLimits[k]}
                    value={profile[k] ?? ""}
                    onChange={(e) => updateProfile(k, e.target.value)}
                    aria-invalid={!!errors["profile." + k]}
                    aria-describedby={
                      errors["profile." + k]
                        ? `savings-profile-${k}-error`
                        : undefined
                    }
                  />
                  {errors["profile." + k] && (
                    <p
                      className="field-error"
                      id={`savings-profile-${k}-error`}
                    >
                      {errors["profile." + k]}
                    </p>
                  )}
                </div>
              ),
            )}
            <div className="field">
              <label htmlFor="savings-location-state">
                State (optional · historical benchmark only)
              </label>
              <select
                id="savings-location-state"
                value={draft.location.state}
                onChange={(e) =>
                  update({
                    ...draft,
                    location: { ...draft.location, state: e.target.value },
                  })
                }
              >
                <option value="">Not provided</option>
                {[...states]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
              </select>
            </div>
            {(["zip_code", "city", "utility", "rate_plan"] as const).map(
              (k) => (
                <div className="field" key={k}>
                  <label htmlFor={`savings-location-${k}`}>
                    {
                      {
                        zip_code: "ZIP (optional)",
                        city: "City (optional)",
                        utility: "Utility (optional · unverified)",
                        rate_plan: "Rate-plan name (optional · unverified)",
                      }[k]
                    }
                  </label>
                  <input
                    id={`savings-location-${k}`}
                    value={draft.location[k]}
                    maxLength={locationLimits[k]}
                    onChange={(e) =>
                      update({
                        ...draft,
                        location: { ...draft.location, [k]: e.target.value },
                      })
                    }
                    aria-invalid={!!errors["location." + k]}
                  />
                  {errors["location." + k] && (
                    <p className="field-error">{errors["location." + k]}</p>
                  )}
                </div>
              ),
            )}
          </div>
        </details>
        <details className="panel savings-applicability">
          <summary>Which equipment does your building have?</summary>
          <div className="form-grid">
            {savingsCategories.map((c) => (
              <ConfirmSelect
                key={c}
                id={`savings-applicability-${c}`}
                label={
                  c === "scheduling"
                    ? "Eligible EVs OR other interruptible flexible loads?"
                    : `${name(c)} relevant to this business?`
                }
                value={draft.applicability[c] ?? ""}
                onChange={(v) =>
                  update({
                    ...draft,
                    applicability: { ...draft.applicability, [c]: v },
                  })
                }
              />
            ))}
          </div>
        </details>
        <section className="panel savings-projects">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHOOSE AN IMPROVEMENT</p>
              <h2>Add an improvement</h2>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                draft.measures.length ? setReplaceExample(true) : loadExample()
              }
            >
              Load synthetic LED example
            </button>
          </div>
          {replaceExample && (
            <div className="savings-warning" role="alert">
              <p>
                Replace your current projects with a clearly labeled fictional
                LED example? About your building stay unchanged.
              </p>
              <button type="button" className="secondary" onClick={loadExample}>
                Replace with synthetic LED example
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setReplaceExample(false)}
              >
                Keep current projects
              </button>
            </div>
          )}
          <p>
            Add the details you know. Leave measurements or costs blank if you are not sure.
          </p>
          <div className="savings-add">
            <div className="field">
              <label htmlFor="savings-new-category">What would you like to improve?</label>
              <select
                id="savings-new-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as CalculatedCategory)
                }
              >
                {Object.keys(calculationFields).map((c) => (
                  <option key={c} value={c}>
                    {name(c as SavingsCategory)}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => add(category)}
              disabled={draft.measures.length >= 100}
            >
              Add improvement
            </button>
          </div>
          {!draft.measures.length && (
            <p className="savings-empty">
              Choose an improvement or try the synthetic example.
            </p>
          )}
          {draft.measures.map((m, i) => (
            <SavingsMeasureForm
              key={i}
              title={name(m.category)}
              measure={m}
              index={i}
              open={activeProject === i}
              errors={errors}
              onChange={(next) =>
                update({
                  ...draft,
                  measures: draft.measures.map((item, j) =>
                    j === i ? next : item,
                  ),
                })
              }
              onRemove={() => {
                update({
                  ...draft,
                  measures: draft.measures.filter((_, j) => j !== i),
                });
                setActiveProject(null);
              }}
            />
          ))}
          <div className="savings-actions">
            <button
              className="run-button"
              type="submit"
              disabled={!!busy}
              aria-busy={busy === "calculation"}
            >
              Calculate savings
            </button>
            {busy && (
              <button className="secondary" type="button" onClick={cancel}>
                Cancel savings request
              </button>
            )}
          </div>
        </section>
      </form>
      {!!Object.keys(errors).length && (
        <div className="savings-warning" role="alert">
          <h3>Review savings inputs</h3>
          <ul>
            {Object.entries(errors).map(([path, msg]) => (
              <li key={path}>
                <strong>{path}: </strong>
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy && (
        <p className="savings-request-status" role="status">
          {busy === "conversation"
            ? "Requesting optional category selection…"
            : "Calculating your submitted project evidence…"}{" "}
          Inputs remain editable; changed evidence makes an earlier response
          stale.
        </p>
      )}
      {message && (
        <p className="savings-request-status" role="status">
          {message}
        </p>
      )}
      {canRetry && !busy && (
        <button
          type="button"
          className="secondary"
          onClick={() => void submit("calculation")}
        >
          Retry calculation without AI
        </button>
      )}
      {investigation && (
        <section
          id="savings-investigation"
          className="panel savings-investigation"
          aria-label="Selected catalog investigation"
        >
          <h2>{name(investigation)} · investigation only</h2>
          <p>
            {descriptor?.eligibility ??
              "Confirm equipment applicability and obtain the required evidence before acting."}
          </p>
          <p>
            Savings cannot be calculated for this category yet.
          </p>
          <ul>
            {descriptor?.required_inputs.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          {descriptor?.sources.map((s) => (
            <p key={s}>
              <a href={s} target="_blank" rel="noreferrer">
                Evidence reference
              </a>
            </p>
          ))}
        </section>
      )}
      {canRetry && accepted && (
        <p className="savings-warning" role="status">
          The latest request did not produce a new accepted response. Results
          below are from the previous successful submission, not the failed or
          canceled attempt.
        </p>
      )}
      {accepted ? (
        <SavingsResults
          response={accepted.response}
          conversation={accepted.conversation}
          request={accepted.request}
          confirmed={accepted.confirmed}
          stale={stale}
          onAnswer={answer}
          onScheduling={onScheduling}
        />
      ) : (
        <section className="panel savings-empty">
          <h2>Ready to calculate</h2>
          <p>
            No annual savings have been calculated yet. Add an improvement to begin.
          </p>
        </section>
      )}
    </div>
  );
}
