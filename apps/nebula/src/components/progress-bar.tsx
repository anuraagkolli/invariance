interface ProgressBarProps {
  // 0-1 watched fraction
  value: number
}

// Accent fill on a border-strong track — the one place a row's card shows the
// crimson note, keeping the accent meaningful rather than decorative.
export function ProgressBar({ value }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-base bg-borderStrong"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}
