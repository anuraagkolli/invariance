import type { ChartData } from '@/lib/types'

interface LineChartProps {
  data: ChartData
}

export function LineChart({ data }: LineChartProps) {
  const max = Math.max(...data.values, 1)
  const min = Math.min(...data.values, 0)
  const range = max - min || 1
  const w = 400
  const h = 120
  const pad = 8

  const points = data.values.map((v, i) => {
    const x = pad + (i / Math.max(data.values.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900">{data.title}</h2>
      {data.description && (
        <p className="text-sm text-gray-500 mt-1">{data.description}</p>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-4 h-32" aria-label="Line chart">
        <polyline
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(' ')}
        />
        {data.values.map((v, i) => {
          const x = pad + (i / Math.max(data.values.length - 1, 1)) * (w - pad * 2)
          const y = h - pad - ((v - min) / range) * (h - pad * 2)
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3.5"
              fill="#6366f1"
              aria-label={`${data.labels[i] ?? i}: ${v}`}
            />
          )
        })}
      </svg>
      <div className="flex justify-between mt-2">
        {data.labels.map((label) => (
          <span key={label} className="text-xs text-gray-600">{label}</span>
        ))}
      </div>
    </div>
  )
}
