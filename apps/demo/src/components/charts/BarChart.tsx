import type { ChartData } from '@/lib/types'

interface BarChartProps {
  data: ChartData
}

export function BarChart({ data }: BarChartProps) {
  const max = Math.max(...data.values, 1)
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900">{data.title}</h2>
      {data.description && (
        <p className="text-sm text-gray-500 mt-1">{data.description}</p>
      )}
      <div className="mt-6 flex items-end gap-3 h-40">
        {data.values.map((value, i) => {
          const heightPct = (value / max) * 100
          const label = data.labels[i] ?? String(i)
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full rounded-t-md bg-indigo-500"
                style={{ height: `${heightPct}%` }}
                role="img"
                aria-label={`${label}: ${value}`}
              />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
