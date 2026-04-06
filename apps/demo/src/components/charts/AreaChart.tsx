import type { ChartData } from '@/lib/types'

interface AreaChartProps {
  data: ChartData
}

export function AreaChart({ data }: AreaChartProps) {
  const max = Math.max(...data.values, 1)
  const min = Math.min(...data.values, 0)
  const range = max - min || 1
  const w = 400
  const h = 120
  const pad = 8

  const pts = data.values.map((v, i) => {
    const x = pad + (i / Math.max(data.values.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return { x, y }
  })

  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPath = [
    `M ${pts[0]?.x ?? 0},${h - pad}`,
    ...pts.map((p) => `L ${p.x},${p.y}`),
    `L ${pts[pts.length - 1]?.x ?? w},${h - pad}`,
    'Z',
  ].join(' ')

  return (
    <div data-inv-chart="area" className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900">{data.title}</h2>
      {data.description && (
        <p className="text-sm text-gray-500 mt-1">{data.description}</p>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-4 h-32" aria-label="Area chart">
        <path d={areaPath} fill="#6366f1" fillOpacity="0.15" />
        <polyline
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={linePoints}
        />
      </svg>
      <div className="flex justify-between mt-2">
        {data.labels.map((label) => (
          <span key={label} className="text-xs text-gray-600">{label}</span>
        ))}
      </div>
    </div>
  )
}
