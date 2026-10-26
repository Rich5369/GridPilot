import { lazy, Suspense } from 'react'
import { Activity, ArrowUpRight, Building2, ChartNoAxesCombined, CircleDollarSign, FlaskConical, LayoutDashboard, PlugZap, ShieldCheck, Zap } from 'lucide-react'
import { BackendStatus } from '../components/BackendStatus'
import { MetricCard } from '../components/MetricCard'
const EnergyChart = lazy(() => import('../components/EnergyChart').then(module => ({ default: module.EnergyChart })))

export function Dashboard() {
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-icon"><Zap size={23} fill="currentColor" /></span>GridPilot<span className="brand-period">.</span></a>
      <div className="workspace"><Building2 size={20}/><div><strong>Development workspace</strong><span>Commercial energy</span></div></div>
      <p className="nav-label">WORKSPACE</p>
      <a href="#overview" className="nav-active"><LayoutDashboard size={18}/>Overview</a>
      <div className="sidebar-note"><span className="tag">FOUNDATION / 01</span><p>A smarter way to<br/>power your building.</p><span>Built for the Meta Global AI<br/>Developer Hackathon 2026</span></div>
      <div className="sidebar-bottom"><span className="avatar">GP</span><div><strong>GridPilot team</strong><span>Development environment</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Workspace <span className="breadcrumb">/</span> <strong>Overview</strong></span><BackendStatus/></header>
      <main id="overview">
        <div className="page-heading"><div><p className="eyebrow">YOUR ENERGY, IN FOCUS</p><h1>Energy overview</h1><p className="muted">Commercial Energy Optimization Platform</p></div><button className="run-button" disabled title="Optimization is not implemented"><Zap size={17}/>Run Optimization</button></div>
        <div className="demo-banner"><FlaskConical size={20}/><p><strong>A preview of what’s ahead.</strong> All values are fictional demo data. Simulation and optimization are not connected.</p><span className="tag">DEVELOPMENT</span></div>
        <section className="metrics" aria-label="Illustrative demo metrics">
          <MetricCard title="Electricity usage" value="1,289" unit="kWh" description="Illustrative daily energy" icon={PlugZap}/>
          <MetricCard title="Electricity cost" value="$206.24" unit="USD" description="Illustrative energy-only cost" icon={CircleDollarSign}/>
          <MetricCard title="Peak demand" value="98" unit="kW" description="Illustrative hourly maximum" icon={Activity}/>
        </section>
        <div className="content-grid"><Suspense fallback={<div className="panel chart-panel" role="status">Loading demo chart…</div>}><EnergyChart/></Suspense><section className="panel readiness"><span className="feature-icon"><ChartNoAxesCombined size={23}/></span><p className="eyebrow mt-6">THE NEXT STEP</p><h2>From visibility<br/>to optimization.</h2><p className="muted">A shared foundation for exploring building demand, electricity prices, and EV charging.</p><div className="readiness-row"><ShieldCheck size={18}/><span>Scenario contracts defined</span></div><div className="readiness-row"><span className="pending-dot"/><span>Simulator awaiting implementation</span></div><div className="readiness-row"><span className="pending-dot"/><span>Optimizer awaiting implementation</span></div><a href="#development-note">Development notes <ArrowUpRight size={16}/></a></section></div>
        <footer id="development-note"><span>GridPilot · Project foundation</span><span>Daily energy costs exclude monthly demand charges. No savings calculated.</span></footer>
      </main>
    </div>
  </div>
}
