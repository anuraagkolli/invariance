import type { Metric, ChartData } from '@/lib/types'
import { BarChart } from './charts/BarChart'

interface DashboardProps {
  metrics: Metric[]
  chartData: ChartData
}

function TrendArrow({ trend }: { trend: Metric['trend'] }) {
  if (trend === 'up') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
      </svg>
    )
  }
  if (trend === 'down') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    )
  }
  return null
}

function MetricCard({ metric }: { metric: Metric }) {
  const changeColor =
    metric.trend === 'up'
      ? 'text-emerald-700'
      : metric.trend === 'down'
        ? 'text-red-600'
        : 'text-gray-600'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500">{metric.label}</p>
      <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
      {metric.change && (
        <div className={`flex items-center gap-1 text-sm font-medium ${changeColor}`}>
          <TrendArrow trend={metric.trend} />
          <span>{metric.change} from last month</span>
        </div>
      )}
    </div>
  )
}

export function Dashboard({ metrics, chartData }: DashboardProps) {
  return (
    <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Metric cards */}
      <section aria-label="Key metrics">
        <h2 className="sr-only">Key metrics</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
          {metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      </section>

      {/* Chart area */}
      <section aria-label="Chart" className="mt-6">
        <BarChart data={chartData} />
      </section>
    </main>
  )
}
