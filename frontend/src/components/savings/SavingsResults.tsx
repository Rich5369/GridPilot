import type {
  SavingsResponse,
  SavingsRecommendation,
  SavingsConversationResponse,
  SavingsRequest,
  SavingsCategory,
} from "../../types/savings";
import { money } from "../../data/demoScenario";
const number = (v: number | null, unit: string, precision = 2) =>
  v === null
    ? "Unknown — more information needed"
    : `${v.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })} ${unit}`;
const usd = (v: number | null, period: string) =>
  v === null ? "Unknown — more information needed" : `${money(v)} ${period}`;
const statuses = {
  quantified: "Calculated · reported measurements",
  scenario_estimate: "Calculated · scenario estimate",
  needs_data: "Needs evidence · investigation only",
  not_applicable: "Excluded · not applicable",
};
const priorities = {
  financial: "Financial evidence available",
  energy_only: "Energy evidence only",
  investigation: "Investigation",
  not_applicable: "Not applicable",
};
function SourceLinks({ sources }: { sources: string[] }) {
  return (
    <ul>
      {sources.map((s, i) => (
        <li key={s}>
          <a href={s} target="_blank" rel="noreferrer">
            Source reference {i + 1}
          </a>
        </li>
      ))}
    </ul>
  );
}
function RecommendationCard({
  r,
  rank,
  onAnswer,
  confirmed,
  stale,
}: {
  r: SavingsRecommendation;
  rank: number;
  onAnswer: () => void;
  confirmed?: boolean;
  stale: boolean;
}) {
  return (
    <article
      className="panel savings-card"
      data-measure-id={r.id}
      data-calculation-status={r.calculation_status}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Priority {rank} · {priorities[r.priority_group]}
          </p>
          <h3>{r.title}</h3>
          <p className="savings-project-id">Project: {r.id}</p>
        </div>
        <span className="tag">{statuses[r.calculation_status]}</span>
      </div>
      {stale && (
        <p className="savings-warning">
          Previous submitted evidence — update before making decisions.
        </p>
      )}
      <p>{r.explanation}</p>
      <p className="field-hint">
        Applicability:{" "}
        {r.applicability === "confirmed"
          ? "supported by submitted evidence"
          : r.applicability === "not_applicable"
            ? "excluded by caller"
            : confirmed
              ? "category relevance confirmed by caller; measurements still required"
              : "not confirmed — investigate before acting"}
        .
      </p>
      <p className="field-hint">
        {r.provenance.kind === "synthetic"
          ? "Synthetic example — not customer savings."
          : r.calculation_status === "quantified"
            ? "Calculated from caller-reported measurements; not an independent audit or proof of realized savings."
            : "Caller scenario or incomplete evidence — not verified realized savings."}
      </p>
      <dl className="savings-values">
        <div>
          <dt>Annual energy reduction</dt>
          <dd
            data-financial="energy"
            data-value-state={
              r.annual_kwh_saved === null
                ? "unknown"
                : r.annual_kwh_saved < 0
                  ? "negative"
                  : "known"
            }
          >
            {number(r.annual_kwh_saved, "kWh/year")}
          </dd>
        </div>
        <div>
          <dt>Gross annual energy-charge savings</dt>
          <dd
            data-financial="gross"
            data-value-state={
              r.annual_energy_charge_savings_usd === null
                ? "unknown"
                : r.annual_energy_charge_savings_usd < 0
                  ? "negative"
                  : "known"
            }
          >
            {usd(r.annual_energy_charge_savings_usd, "USD/year")}
          </dd>
        </div>
        <div>
          <dt>Recurring non-energy cost savings</dt>
          <dd
            data-financial="operating"
            data-value-state={
              r.annual_operating_cost_savings_usd == null ? "unknown" : "known"
            }
          >
            {r.annual_operating_cost_savings_usd == null
              ? "Not included in this estimate"
              : usd(r.annual_operating_cost_savings_usd, "USD/year")}
          </dd>
        </div>
        <div>
          <dt>Incremental annual expenses</dt>
          <dd data-financial="expenses" data-value-state={typeof r.inputs_used.annual_incremental_cost_usd === "number" ? "known" : "unknown"}>
            {usd(typeof r.inputs_used.annual_incremental_cost_usd === "number" ? r.inputs_used.annual_incremental_cost_usd : null, "USD/year")}
          </dd>
        </div>
        <div>
          <dt>Net annual savings</dt>
          <dd
            data-financial="net"
            data-value-state={
              r.annual_net_savings_usd === null
                ? "unknown"
                : r.annual_net_savings_usd < 0
                  ? "negative"
                  : "known"
            }
          >
            {usd(r.annual_net_savings_usd, "USD/year")}
          </dd>
        </div>
        <div>
          <dt>Net upfront cost</dt>
          <dd
            data-financial="upfront"
            data-value-state={
              r.upfront_cost_usd === null
                ? "unknown"
                : r.upfront_cost_usd < 0
                  ? "negative"
                  : "known"
            }
          >
            {usd(r.upfront_cost_usd, "USD upfront")}
          </dd>
        </div>
        <div>
          <dt>Simple payback</dt>
          <dd
            data-financial="payback"
            data-value-state={
              r.simple_payback_years === null
                ? "unknown"
                : r.simple_payback_years < 0
                  ? "negative"
                  : "known"
            }
          >
            {number(r.simple_payback_years, "years")}
          </dd>
        </div>
        <div>
          <dt>Annual simple ROI</dt>
          <dd
            data-financial="roi"
            data-value-state={
              r.annual_simple_roi_percent === null
                ? "unknown"
                : r.annual_simple_roi_percent < 0
                  ? "negative"
                  : "known"
            }
          >
            {number(r.annual_simple_roi_percent, "% per year")}
          </dd>
        </div>
      </dl>
      {!!r.warnings?.length && (
        <section
          className="savings-warning"
          aria-label={`Advisory evidence warnings for ${r.id}`}
        >
          <h4>Review inputs and operating evidence</h4>
          <p>
            Nonblocking guidance — no values were corrected or independently
            verified.
          </p>
          <ul>
            {r.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="savings-priority">{r.priority_reason}</p>
      {!!r.missing_information.length && (
        <section aria-label={`Missing evidence for ${r.id}`}>
          <h4>Add these details to calculate this estimate</h4>
          <ul>
            {r.missing_information.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <p>
        <strong>Next action: </strong>
        {r.next_action}
      </p>
      {r.calculation_status !== "not_applicable" && confirmed !== false && (
        <button type="button" className="secondary" onClick={onAnswer}>
          {r.annual_kwh_saved === null ? 'Add missing details' : r.annual_energy_charge_savings_usd === null ? 'Add electricity price' : r.upfront_cost_usd === null ? 'Add installation cost' : 'Edit this improvement'}
        </button>
      )}
      <details className="savings-evidence">
        <summary>How this was calculated</summary>
        <p>Net annual savings include documented recurring non-energy benefits when supplied, less additional annual expenses.</p>
        <h4>Inputs used (submitted values and units)</h4>
        <pre>{JSON.stringify(r.inputs_used, null, 2)}</pre>
        <h4>Evidence provenance</h4>
        <pre>{JSON.stringify(r.provenance, null, 2)}</pre>
        <p>
          <strong>Confidence: </strong>
          {r.confidence}
        </p>
        <h4>Assumptions and limitations</h4>
        <ul>
          {r.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
        <p>
          <strong>Calculation method: </strong>
          {r.calculation_method}
        </p>
        <SourceLinks sources={r.sources} />
      </details>
    </article>
  );
}
export function SavingsResults({
  response,
  conversation,
  request,
  confirmed,
  stale,
  onAnswer,
  onScheduling,
}: {
  response: SavingsResponse;
  conversation: SavingsConversationResponse | null;
  request: SavingsRequest;
  confirmed: Partial<Record<SavingsCategory, boolean>>;
  stale: boolean;
  onAnswer: (id: string, category: SavingsCategory) => void;
  onScheduling: () => void;
}) {
  const ids = new Set(request.measures?.map((m) => m.id) ?? []),
    selected = new Set(conversation?.selected_categories ?? []);
  const projects = response.recommendations.filter(
    (r) =>
      ids.has(r.id) &&
      r.calculation_status !== "not_applicable" &&
      confirmed[r.category] !== false,
  );
  const investigations = response.recommendations.filter(
    (r) =>
      !ids.has(r.id) &&
      selected.has(r.category) &&
      r.calculation_status !== "not_applicable" &&
      confirmed[r.category] !== false,
  );
  const general = response.recommendations.filter(
    (r) =>
      !ids.has(r.id) &&
      !selected.has(r.category) &&
      r.calculation_status !== "not_applicable" &&
      confirmed[r.category] !== false,
  );
  const excluded = response.recommendations.filter(
    (r) =>
      r.calculation_status === "not_applicable" ||
      confirmed[r.category] === false,
  );
  const cards = (rows: SavingsRecommendation[]) =>
    rows.map((r) => (
      <RecommendationCard
        key={r.id}
        r={r}
        stale={stale}
        rank={response.recommendations.indexOf(r) + 1}
        confirmed={confirmed[r.category]}
        onAnswer={() =>
          r.category === "scheduling"
            ? onScheduling()
            : onAnswer(r.id, r.category)
        }
      />
    ));
  const b = response.benchmark;
  // PR #54 copies per-project warnings to the global list for legacy clients.
  // Show each beside its project and retain global overlap/service notices.
  const copiedWarnings = new Set(
    response.recommendations.flatMap((r) =>
      (r.warnings ?? []).map((w) => `${r.id}: ${w}`),
    ),
  );
  const globalWarnings = response.warnings.filter(
    (w) => !copiedWarnings.has(w),
  );
  return (
    <section
      id="savings-results"
      tabIndex={-1}
      className="savings-results"
      aria-label="Savings calculation results"
    >
      {stale && (
        <p className="savings-warning" role="status">
          Savings evidence changed. These results belong to the previous
          submitted profile and inputs. Recalculate explicitly.
        </p>
      )}
      <p className="savings-no-total">
        Modeled annual estimates — do not add these improvements together. Savings may overlap.
      </p>
      {!!globalWarnings.length && (
        <div className="savings-warning" role="note">
          <h3>Important warnings and overlapping estimates</h3>
          <ul>
            {globalWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {conversation && (
        <section className="panel savings-selection">
          <h3>
            {conversation.source === "meta"
              ? "AI-assisted category selection"
              : "AI unavailable · standard guidance"}
          </h3>
          <p>{conversation.message}</p>
          <p>
            AI suggestions do not verify measurements or guarantee savings.
          </p>
          <p>
            <strong>
              {conversation.source === "meta"
                ? "Selected categories"
                : "Standard guidance selections"}
              :{" "}
            </strong>
            {conversation.selected_categories.join(", ") ||
              "No applicable categories selected"}
          </p>
          {!!conversation.follow_up_questions.length && (
            <section aria-label="Savings follow-up questions">
              <h4>Questions to complete your evidence</h4>
              <ul>
                {conversation.follow_up_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}
          <details>
            <summary>Returned calculation facts</summary>
            <ul>
              {conversation.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <h2>Your submitted projects</h2>
      {projects.length ? (
        <div className="savings-card-grid">{cards(projects)}</div>
      ) : (
        <p className="panel savings-empty">
          No applicable project evidence was submitted. Add a project or
          investigate a category below.
        </p>
      )}
      {!!investigations.length && (
        <section>
          <h2>Selected investigations · not investment recommendations</h2>
          <div className="savings-card-grid">{cards(investigations)}</div>
        </section>
      )}
      <details className="panel savings-general">
        <summary>
          General catalog guidance · {general.length} unselected opportunities
        </summary>
        <p>
          {conversation
            ? "These suggestions were not selected for your request."
            : "These are general suggestions, not personalized investment advice."}{" "}
          Confirm relevance and provide evidence before estimating savings.
        </p>
        {general.map((r) => (
          <section key={r.id}>
            <h3>{r.title}</h3>
            <p>{r.explanation}</p>
            <p>
              <strong>Evidence requirements: </strong>
              {r.missing_information.join("; ")}
            </p>
            <p>{r.next_action}</p>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                r.category === "scheduling"
                  ? onScheduling()
                  : onAnswer(r.id, r.category)
              }
            >
              Investigate {r.title}
            </button>
          </section>
        ))}
      </details>
      {!!excluded.length && (
        <details className="panel savings-excluded">
          <summary>
            Review exclusions · {excluded.length} not applicable
          </summary>
          <p>
            These improvements do not apply based on your answers or the calculation results.
          </p>
          <div className="savings-card-grid">{cards(excluded)}</div>
        </details>
      )}
      <details className="panel savings-benchmark">
        <summary>Historical EIA benchmark · separate from your rate</summary>
        {b ? (
          <>
            <p>
              {b.state} · {b.period} ·{" "}
              {b.freshness === "available"
                ? "Published historical release"
                : b.freshness === "saved"
                  ? "Saved release"
                  : "Older / delayed release"}
            </p>
            <p>
              {b.average_retail_price === null
                ? "Price unknown"
                : `${b.average_retail_price.toFixed(4)} USD/kWh historical commercial average`}
            </p>
            <p>{b.notice}</p>
            <p>
              {b.source} · published {b.released_at} · retrieved{" "}
              {b.retrieved_at}
            </p>
            <a href={b.source_url} target="_blank" rel="noreferrer">
              EIA data and notes
            </a>
          </>
        ) : (
          <p>
            Benchmark unavailable or not requested. Valid equipment calculations
            remain usable. Supply a state for historical context; never use a
            state average as the customer rate.
          </p>
        )}
        <p>{response.location_notice}</p>
      </details>
    </section>
  );
}
