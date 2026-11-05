import { Zap } from 'lucide-react'
import './landing.css'
import powerlinePhoto from '../assets/powerline.png'

function Header() {
  return <header className="site-header welcome-header">
    <a href="#home" className="brand" aria-label="GridPilot home"><Zap aria-hidden="true" />GridPilot</a>
    <nav aria-label="Website navigation"><a href="#learn-more">Learn more</a><a className="run-button" href="#setup">Get started</a></nav>
  </header>
}
export function Landing() {
  const steps = [
    ['Tell us about your building', 'Share basic details such as business type and operating hours.'],
    ['Explore your opportunities', 'Review relevant energy recommendations or configure a daily energy plan.'],
    ['Review your results', 'Understand modeled costs, possible improvements, and next steps.'],
  ]
  return <div className="welcome-page landing-page">
    <a className="skip-link" href="#welcome-main">Skip to main content</a>
    <Header />
    <main id="welcome-main" className="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="welcome-copy landing-copy">
          <h1 id="landing-title">Smarter energy decisions for your building.</h1>
          <p>Understand your energy use, explore ways to lower costs, and plan around your business operations.</p>
          <div className="welcome-actions">
            <a className="run-button" href="#setup">Get started</a>
            <a className="secondary" href="#learn-more">Learn more</a>
          </div>
        </div>
        <figure className="landing-photo">
          <img src={powerlinePhoto} width="1013" height="672" alt="Electricity transmission towers and overhead powerlines beneath a blue, clouded sky, with a yellow field in the foreground" fetchPriority="high" />
        </figure>
      </section>
      <section className="landing-steps" aria-labelledby="landing-steps-title">
        <h2 id="landing-steps-title">Get started in 3 simple steps</h2>
        <ol>
          {steps.map(([title, description], index) => <li key={title}>
            <span className="landing-step-number" aria-hidden="true">{index + 1}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </li>)}
        </ol>
      </section>
      <section className="landing-statistics" aria-label="Modeled energy savings statistics">
        <dl className="landing-statistics-row">
          <div><dt>Avg. Modeled Cost Reduction</dt><dd>3.81%</dd></div>
          <div><dt>Avg. Annual Reduction</dt><dd>$1503.8</dd></div>
          <div><dt>Lower Energy Charges</dt><dd>6.48%</dd></div>
        </dl>
        <details className="landing-statistics-note">
          <summary>Based on fictional simulations; actual savings may vary.</summary>
          <div>
            <p>3.81%: Across 67 eligible modeled comparisons, including zero reductions.</p>
            <p>$1503.8/year: Annualized average modeled reduction across 41 valid controllable-load comparisons, including zero reductions, based on $4.12/day × 365 days.</p>
            <p>6.48%: One modeled warehouse example without EVs (W01), compared with immediate-start scheduling.</p>
            <p>Energy charges only; these scenarios represent no actual customer savings.</p>
          </div>
        </details>
      </section>
    </main>
  </div>
}
export function LearnMore() {
  return <div className="information-page"><Header /><main className="learn-main" id="learn-main">
    <a className="text-link" href="#home">← Back to home</a>
    <h1>A clearer view of your building’s energy.</h1>
    <section><h2>What is GridPilot?</h2><p>GridPilot helps businesses understand modeled energy use and explore potential savings. Use your building information to compare options before deciding what to change.</p></section>
    <section><h2>How does it work?</h2><ol><li>Tell us about your building.</li><li>Choose what you want to understand or improve.</li><li>Explore calculated results and recommendations.</li></ol></section>
    <section><h2>What can GridPilot help with?</h2><p>Explore energy costs, understand peak demand, plan supported equipment schedules, and evaluate savings opportunities such as lighting upgrades or reducing unnecessary equipment use.</p><p>Results depend on your inputs and model assumptions. They are estimates to support planning; savings are not guaranteed and no equipment is controlled.</p></section>
    <div className="welcome-actions"><a className="run-button" href="#setup">Get started</a><a className="secondary" href="#home">Back to home</a></div>
  </main></div>
}
