import { m } from "invariance";
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
    <div className="bg-[var(--inv-section-5-bg)] rounded-[var(--inv-section-5-radius)] border border-[var(--inv-section-5-border)] p-[var(--inv-section-5-pad)] flex flex-col gap-[var(--inv-section-5-pad-1)]">
      <p className="text-sm font-medium text-[var(--inv-section-5-text)]">{metric.label}</p>
      <p className="text-2xl font-bold text-[var(--inv-section-5-text-1)]">{metric.value}</p>
      {metric.change && (
        <div className={`flex items-center gap-1 text-sm font-medium ${changeColor}`}>
          <TrendArrow trend={metric.trend} />
          <span>{metric.change} <m.text name="text-3">from last month</m.text></span>
        </div>
      )}
    </div>
  )
}

export function Dashboard({ metrics, chartData }: DashboardProps) {
  return (
    <m.slot name="section-5" level={0} cssVariables={['--inv-section-5-bg', '--inv-section-5-border', '--inv-section-5-text', '--inv-section-5-text-1', '--inv-section-5-bg-1', '--inv-section-5-radius', '--inv-section-5-pad', '--inv-section-5-pad-1', '--inv-section-5-pad-2', '--inv-section-5-margin']}><main className="flex-1 overflow-y-auto p-[var(--inv-section-5-pad-2)] bg-[var(--inv-section-5-bg-1)]">
            {/* Metric cards */}
            <section aria-label="Key metrics">
              <h2 className="sr-only"><m.text name="text-4">Key metrics</m.text></h2>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-[var(--inv-section-5-pad)]">
                {metrics.map((metric) => (
                  <MetricCard key={metric.id} metric={metric} />
                ))}
              </div>
            </section>

            {/* Chart area */}
            <section aria-label="Chart" className="mt-[var(--inv-section-5-margin)]">
              <BarChart data={chartData} />
            </section>
          </main></m.slot>
  )
}
