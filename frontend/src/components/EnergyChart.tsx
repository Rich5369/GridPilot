import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Fictional display-only profile. Not an API response or simulation result.
const demoDemand = [24, 22, 21, 20, 22, 28, 41, 58, 72, 79, 85, 91, 87, 94, 98, 90, 78, 65, 51, 43, 36, 31, 28, 25]
const data = demoDemand.map((demand, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, demand }))
export function EnergyChart() {
  return <section className="panel chart-panel" aria-labelledby="energy-title">
    <div className="section-heading"><div><h2 id="energy-title">Energy consumption</h2><p className="muted text-sm mt-1">Chart placeholder · fictional 24-hour demand profile</p></div><span className="tag">DEMO DATA</span></div>
    <div className="chart" role="img" aria-label="Illustrative hourly demand ranges from 20 to 98 kW; this is not simulated data.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs><linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.22}/><stop offset="100%" stopColor="#0d9488" stopOpacity={0.01}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e5ebe8" />
          <XAxis dataKey="hour" interval={5} axisLine={false} tickLine={false} tick={{ fill: '#667970', fontSize: 12 }} dy={10}/>
          <YAxis unit=" kW" width={65} axisLine={false} tickLine={false} tick={{ fill: '#667970', fontSize: 11 }}/>
          <Tooltip formatter={(value) => [`${value} kW`, 'Demo demand']} contentStyle={{ borderRadius: 12, border: '1px solid #dce5df' }}/>
          <Area type="monotone" dataKey="demand" stroke="#0d9488" strokeWidth={2.5} fill="url(#demandFill)" isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-footer"><span><i /> Illustrative demand</span><span>1-hour intervals · kW</span></div>
  </section>
}
