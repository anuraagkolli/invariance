// An enterprise-shaped analytics dashboard — the demo's canvas. It themes EXCLUSIVELY through
// hsl(var(--x)) (+ --radius for corners); Tailwind is layout/spacing/typography only. There are NO
// dark-mode Tailwind utilities (which would be a second source of truth) — light/dark is driven
// entirely by the var map the scoped applier swaps. (Guard: test/canvas-purevar.test.ts.)

const bg = (v: string): React.CSSProperties => ({ background: `hsl(var(${v}))` });
const fg = (v: string): React.CSSProperties => ({ color: `hsl(var(${v}))` });
const rounded: React.CSSProperties = { borderRadius: "calc(var(--radius, 8) * 1px)" };
const border: React.CSSProperties = { borderColor: "hsl(var(--border))", borderWidth: 1, borderStyle: "solid" };

const NAV = ["Overview", "Reports", "Audiences", "Settings"];
const KPIS = [
  { label: "Active users", value: "48,210", delta: "+12.4%", up: true },
  { label: "Revenue", value: "$92,540", delta: "+4.1%", up: true },
  { label: "Churn", value: "1.9%", delta: "−0.3%", up: false },
];
const ROWS = [
  { name: "Acme Corp", plan: "Enterprise", usage: 82 },
  { name: "Globex", plan: "Growth", usage: 64 },
  { name: "Initech", plan: "Starter", usage: 38 },
];

export function AnalyticsDashboard() {
  return (
    <div className="flex min-h-[560px] w-full" style={{ ...bg("--background"), ...fg("--foreground") }}>
      {/* sidebar */}
      <aside className="flex w-56 flex-col gap-1 p-4" style={{ ...bg("--card"), borderRight: "1px solid hsl(var(--border))" }}>
        <div className="mb-4 px-2 text-lg font-bold" style={fg("--foreground")}>
          Northstar
        </div>
        {NAV.map((item, i) => (
          <div
            key={item}
            className="px-3 py-2 text-sm font-medium"
            style={{ ...rounded, ...(i === 0 ? { ...bg("--primary"), ...fg("--primary-foreground") } : fg("--muted-foreground")) }}
          >
            {item}
          </div>
        ))}
      </aside>

      {/* main */}
      <main className="flex flex-1 flex-col gap-6 p-6">
        {/* top bar */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={fg("--foreground")}>
              Overview
            </h1>
            <p className="text-sm" style={fg("--muted-foreground")}>
              Last 30 days across all workspaces
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 text-sm font-medium" style={{ ...rounded, ...bg("--secondary"), ...fg("--secondary-foreground") }}>
              Export
            </button>
            <button data-testid="cta" className="px-3 py-2 text-sm font-semibold" style={{ ...rounded, ...bg("--primary"), ...fg("--primary-foreground") }}>
              New report
            </button>
          </div>
        </header>

        {/* KPI cards */}
        <section className="grid grid-cols-3 gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className="flex flex-col gap-2 p-4" style={{ ...rounded, ...border, ...bg("--card"), ...fg("--card-foreground") }}>
              <span className="text-sm" style={fg("--muted-foreground")}>
                {k.label}
              </span>
              <span className="text-2xl font-bold">{k.value}</span>
              <span className="text-xs font-medium" style={fg(k.up ? "--primary" : "--destructive")}>
                {k.delta}
              </span>
            </div>
          ))}
        </section>

        {/* chart (CSS bars) */}
        <section className="flex flex-col gap-3 p-4" style={{ ...rounded, ...border, ...bg("--card") }}>
          <span className="text-sm font-medium" style={fg("--card-foreground")}>
            Weekly active
          </span>
          <div className="flex h-32 items-end gap-2">
            {[40, 65, 50, 80, 70, 95, 60].map((h, i) => (
              <div key={i} className="flex-1" style={{ height: `${h}%`, ...rounded, ...bg(i === 5 ? "--primary" : "--accent") }} />
            ))}
          </div>
        </section>

        {/* table */}
        <section className="flex flex-col p-4" style={{ ...rounded, ...border, ...bg("--card") }}>
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 pb-2 text-xs font-semibold uppercase tracking-wide" style={fg("--muted-foreground")}>
            <span>Workspace</span>
            <span>Plan</span>
            <span>Usage</span>
            <span />
          </div>
          {ROWS.map((r) => (
            <div key={r.name} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-4 py-2 text-sm" style={{ borderTop: "1px solid hsl(var(--border))", ...fg("--card-foreground") }}>
              <span className="font-medium">{r.name}</span>
              <span style={fg("--muted-foreground")}>{r.plan}</span>
              <span>{r.usage}%</span>
              <button className="px-2 py-1 text-xs font-medium" style={{ ...rounded, ...bg("--destructive"), ...fg("--destructive-foreground") }}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <p className="text-xs" style={fg("--muted-foreground")}>
          Data refreshes hourly · times shown in your workspace timezone.
        </p>
      </main>
    </div>
  );
}
