import type { LucideIcon } from 'lucide-react'

interface Props { title: string; value: string; unit: string; description: string; icon: LucideIcon }
export function MetricCard({ title, value, unit, description, icon: Icon }: Props) {
  return <article className="panel metric">
    <div className="flex items-center justify-between"><h3>{title}</h3><Icon size={19} className="text-teal-700" /></div>
    <p className="metric-value">{value} <span>{unit}</span></p>
    <p className="muted text-sm">{description}</p>
  </article>
}
