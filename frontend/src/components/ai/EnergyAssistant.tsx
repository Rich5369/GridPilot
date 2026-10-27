import { Sparkles } from 'lucide-react'
export function EnergyAssistant() {
  return (
    <section className="panel assistant">
      <div className="section-heading">
        <h2>
          <Sparkles size={19} />
          AI Energy Assistant
        </h2>
        <span className="tag">NOT CONNECTED</span>
      </div>
      <p className="muted">
        A future workspace for exploring energy decisions with Meta AI. No AI
        service is connected and no responses are generated.
      </p>
      <p className="eyebrow">QUESTIONS YOU COULD EXPLORE</p>
      <blockquote>
        “How can we reduce electricity costs while keeping our peak demand below
        15 kW?”
      </blockquote>
      <blockquote>
        “Can we add another EV charger without exceeding our building’s power
        limit?”
      </blockquote>
      <div className="assistant-input">
        Assistant messaging will be available in a later phase.
        <Sparkles size={17} />
      </div>
    </section>
  )
}
