import { Zap } from 'lucide-react'
import dashboardPreview from '../assets/dashboard-preview.png'

function Header() {
  return <header className="site-header welcome-header">
    <a href="#home" className="brand" aria-label="GridPilot home"><Zap aria-hidden="true" />GridPilot</a>
    <nav aria-label="Website navigation"><a href="#learn-more">Learn more</a><a className="run-button" href="#setup">Get started</a></nav>
  </header>
}
export function Landing() {
  return <div className="welcome-page">
    <a className="skip-link" href="#welcome-main">Skip to main content</a>
    <Header />
    <main id="welcome-main" className="welcome-main">
      <div className="welcome-copy">
        <h1>Smarter energy decisions for your building.</h1>
        <p>Understand your energy use, discover ways to reduce costs, and plan around your business operations.</p>
        <div className="welcome-actions"><a className="run-button" href="#setup">Get started</a><a className="secondary" href="#learn-more">Learn more</a></div>
      </div>
      <figure className="welcome-preview"><img src={dashboardPreview} alt="GridPilot hourly building demand chart, showing baseline and optimized demand for the verified synthetic example" width="760" height="700" /><figcaption>Illustrative example · synthetic building inputs</figcaption></figure>
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
