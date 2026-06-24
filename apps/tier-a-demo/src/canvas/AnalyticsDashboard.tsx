// An enterprise-shaped analytics dashboard — the demo's canvas. It themes EXCLUSIVELY through
// hsl(var(--x)) (+ --radius, --space-*, --font-*) — CSS vars set by applyScoped. Tailwind is
// layout-only (flex/grid/items-*); NO dark-mode Tailwind utilities (second source of truth) and NO raw numeric
// spacing classes (spacing is var-driven). (Guards: test/canvas-purevar.test.ts.)

import React from "react";

const bg = (v: string): React.CSSProperties => ({ background: `hsl(var(${v}))` });
const fg = (v: string): React.CSSProperties => ({ color: `hsl(var(${v}))` });
const rounded: React.CSSProperties = { borderRadius: "calc(var(--radius, 8) * 1px)" };

const sp = (s: string) => `var(--space-${s})`;

const SIZES = {
  dense:    { base: 12, h1: 18, kpi: 18, label: 11 },
  standard: { base: 14, h1: 20, kpi: 24, label: 12 },
  roomy:    { base: 15, h1: 22, kpi: 28, label: 13 },
} as const;

const SHADOWS = {
  flat:     { sm: "none",                          md: "none" },
  soft:     { sm: "0 1px 2px rgb(0 0 0 / 0.08)",  md: "0 4px 12px rgb(0 0 0 / 0.10)" },
  elevated: { sm: "0 2px 8px rgb(0 0 0 / 0.15)",  md: "0 12px 32px rgb(0 0 0 / 0.22)" },
} as const;

const BORDERS = { hairline: "1px", standard: "2px", heavy: "3px" } as const;

const NAV = ["Overview", "Reports", "Audiences", "Settings"];
const TABS = ["Overview", "Activity", "Billing"];
const KPIS = [
  { label: "Active users", value: "48,210", delta: "+12.4%", up: true },
  { label: "Revenue",      value: "$92,540", delta: "+4.1%",  up: true },
  { label: "Churn",        value: "1.9%",    delta: "−0.3%",  up: false },
];
const ROWS = [
  { name: "Acme Corp",     plan: "Enterprise", usage: 82, status: "Active" },
  { name: "Globex",        plan: "Growth",     usage: 64, status: "Active" },
  { name: "Initech",       plan: "Starter",    usage: 38, status: "Trial"  },
  { name: "Umbrella Corp", plan: "Growth",     usage: 51, status: "Trial"  },
  { name: "Soylent Co",    plan: "Starter",    usage: 23, status: "Active" },
  { name: "Momcorp",       plan: "Enterprise", usage: 90, status: "Active" },
];

export function AnalyticsDashboard({
  ctaTestId = "cta",
  profile = "standard",
  shadow = "soft",
  borderWeight = "hairline",
}: {
  ctaTestId?: string;
  profile?: "dense" | "standard" | "roomy";
  shadow?: "flat" | "soft" | "elevated";
  borderWeight?: "hairline" | "standard" | "heavy";
} = {}) {
  const isTerminal = profile === "dense";
  const S = SIZES[profile];
  const shadowOf = (lvl: "sm" | "md"): React.CSSProperties => ({ boxShadow: SHADOWS[shadow][lvl] });
  const border: React.CSSProperties = {
    borderWidth: BORDERS[borderWeight],
    borderColor: "hsl(var(--border))",
    borderStyle: "solid",
  };
  const card: React.CSSProperties = {
    ...rounded,
    ...border,
    ...bg("--card"),
    ...fg("--card-foreground"),
  };

  const statusPill = (status: string): React.CSSProperties => ({
    fontSize: S.label,
    padding: `${sp("2xs")} ${sp("xs")}`,
    borderRadius: isTerminal ? 2 : "calc(var(--radius, 8) * 1px)",
    borderWidth: BORDERS[borderWeight],
    borderStyle: "solid",
    borderColor: "hsl(var(--border))",
    ...bg(status === "Active" ? "--primary" : "--secondary"),
    ...fg(status === "Active" ? "--primary-foreground" : "--secondary-foreground"),
    fontFamily: "var(--font-mono)",
    display: "inline-block",
  });

  const tabRow = (
    <div
      style={{
        display: "flex",
        gap: sp("xs"),
        borderBottom: isTerminal ? `1px solid hsl(var(--border))` : "none",
        marginBottom: sp("xs"),
      }}
    >
      {TABS.map((tab, i) => (
        <div
          key={tab}
          style={{
            padding: `${sp("xs")} ${sp("sm")}`,
            fontSize: S.label,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
            ...(i === 0
              ? isTerminal
                ? { ...fg("--primary"), borderBottom: `2px solid hsl(var(--primary))` }
                : { ...rounded, ...bg("--primary"), ...fg("--primary-foreground") }
              : fg("--muted-foreground")),
          }}
        >
          {tab}
        </div>
      ))}
    </div>
  );

  const filterBar = (
    <div style={{ display: "flex", gap: sp("xs"), alignItems: "center", marginBottom: sp("xs") }}>
      <input
        readOnly
        placeholder="Search workspaces…"
        value=""
        onChange={() => {}}
        style={{
          flex: 1,
          padding: `${sp("xs")} ${sp("sm")}`,
          fontSize: S.base,
          fontFamily: "var(--font-body)",
          ...rounded,
          ...border,
          ...bg("--background"),
          ...fg("--foreground"),
          outline: "none",
        }}
      />
      <select
        style={{
          padding: `${sp("xs")} ${sp("sm")}`,
          fontSize: S.base,
          fontFamily: "var(--font-body)",
          ...rounded,
          ...border,
          ...bg("--background"),
          ...fg("--foreground"),
        }}
      >
        <option>All plans</option>
        <option>Enterprise</option>
        <option>Growth</option>
        <option>Starter</option>
      </select>
      <button
        style={{
          padding: `${sp("xs")} ${sp("sm")}`,
          fontSize: S.base,
          fontFamily: "var(--font-body)",
          ...rounded,
          ...bg("--secondary"),
          ...fg("--secondary-foreground"),
          cursor: "pointer",
        }}
      >
        Apply
      </button>
    </div>
  );

  if (isTerminal) {
    return (
      <div
        data-profile={profile}
        className="flex min-h-[560px] w-full flex-col"
        style={{ ...bg("--background"), ...fg("--foreground"), fontFamily: "var(--font-body)", fontSize: S.base }}
      >
        {/* top-nav */}
        <nav
          data-testid="topnav"
          className="flex items-center justify-between"
          style={{
            padding: `${sp("xs")} ${sp("xl")}`,
            ...bg("--card"),
            borderBottom: `${BORDERS[borderWeight]} solid hsl(var(--border))`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: sp("lg") }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: S.h1, ...fg("--foreground") }}>
              Northstar
            </span>
            <div style={{ display: "flex", gap: sp("xs") }}>
              {NAV.map((item, i) => (
                <div
                  key={item}
                  style={{
                    padding: `${sp("xs")} ${sp("sm")}`,
                    fontSize: S.base,
                    fontWeight: 500,
                    ...(i === 0
                      ? { ...fg("--primary"), borderBottom: `2px solid hsl(var(--primary))` }
                      : fg("--muted-foreground")),
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: sp("xs") }}>
            <button
              style={{
                padding: `${sp("xs")} ${sp("sm")}`,
                fontSize: S.base,
                fontWeight: 500,
                ...rounded,
                ...bg("--secondary"),
                ...fg("--secondary-foreground"),
                cursor: "pointer",
              }}
            >
              Export
            </button>
            <button
              data-testid={ctaTestId}
              style={{
                padding: `${sp("xs")} ${sp("sm")}`,
                fontSize: S.base,
                fontWeight: 600,
                ...rounded,
                ...bg("--primary"),
                ...fg("--primary-foreground"),
                cursor: "pointer",
              }}
            >
              New report
            </button>
          </div>
        </nav>

        <main className="flex flex-1 flex-col" style={{ padding: sp("xl"), gap: sp("md") }}>
          <header>
            <h1 style={{ margin: 0, fontSize: S.h1, fontFamily: "var(--font-display)", fontWeight: 700, ...fg("--foreground") }}>
              Overview
            </h1>
            <p style={{ margin: 0, fontSize: S.label, ...fg("--muted-foreground") }}>
              Last 30 days across all workspaces
            </p>
          </header>

          {tabRow}

          {/* KPI strip — inline, hairline dividers, no cards */}
          <section
            style={{
              display: "flex",
              gap: 0,
              borderTop: `1px solid hsl(var(--border))`,
              borderBottom: `1px solid hsl(var(--border))`,
            }}
          >
            {KPIS.map((k, i) => (
              <div
                key={k.label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: sp("2xs"),
                  padding: `${sp("xs")} ${sp("md")}`,
                  borderRight: i < KPIS.length - 1 ? `1px solid hsl(var(--border))` : "none",
                }}
              >
                <span style={{ fontSize: S.label, ...fg("--muted-foreground"), fontFamily: "var(--font-body)" }}>{k.label}</span>
                <span style={{ fontSize: S.kpi, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{k.value}</span>
                <span style={{ fontSize: S.label, fontWeight: 500, fontFamily: "var(--font-mono)", ...fg(k.up ? "--primary" : "--destructive") }}>{k.delta}</span>
              </div>
            ))}
          </section>

          {/* chart — thin, sharp, short bars */}
          <section style={{ padding: sp("md"), ...card }}>
            <span style={{ fontSize: S.label, fontWeight: 500, ...fg("--card-foreground"), display: "block", marginBottom: sp("xs") }}>
              Weekly active
            </span>
            <div style={{ display: "flex", height: 64, alignItems: "flex-end", gap: sp("2xs") }}>
              {[40, 65, 50, 80, 70, 95, 60].map((h, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    height: `${Math.round(h * 0.6)}%`,
                    borderRadius: 1,
                    ...bg(i === 5 ? "--primary" : "--accent"),
                  }}
                />
              ))}
            </div>
          </section>

          {/* table — compact */}
          <section style={{ padding: sp("md"), ...card }}>
            {filterBar}
            <div
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto]"
              style={{
                gap: sp("xs"),
                paddingBottom: sp("2xs"),
                fontSize: S.label,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                ...fg("--muted-foreground"),
                fontFamily: "var(--font-body)",
              }}
            >
              <span>Workspace</span>
              <span>Plan</span>
              <span>Usage</span>
              <span>Status</span>
              <span />
            </div>
            {ROWS.map((r) => (
              <div
                key={r.name}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center"
                style={{
                  gap: sp("xs"),
                  padding: `${sp("2xs")} 0`,
                  borderTop: `1px solid hsl(var(--border))`,
                  ...fg("--card-foreground"),
                  fontSize: S.base,
                }}
              >
                <span style={{ fontWeight: 500, fontFamily: "var(--font-body)" }}>{r.name}</span>
                <span style={{ ...fg("--muted-foreground"), fontFamily: "var(--font-mono)" }}>{r.plan}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{r.usage}%</span>
                <span style={statusPill(r.status)}>{r.status}</span>
                <button
                  style={{
                    // vertical pad rides --space-xs to honor the WCAG target-size floor's assumption
                    padding: `${sp("xs")} ${sp("2xs")}`,
                    fontSize: S.label - 1,
                    fontFamily: "var(--font-body)",
                    borderRadius: 2,
                    ...bg("--destructive"),
                    ...fg("--destructive-foreground"),
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        </main>
      </div>
    );
  }

  // ── STANDARD / ROOMY layout ────────────────────────────────────────────────
  return (
    <div
      data-profile={profile}
      className="flex min-h-[560px] w-full"
      style={{ ...bg("--background"), ...fg("--foreground"), fontFamily: "var(--font-body)", fontSize: S.base }}
    >
      {/* sidebar */}
      <aside
        data-testid="sidebar"
        className="flex w-56 flex-col"
        style={{
          gap: sp("2xs"),
          padding: sp("md"),
          ...bg("--card"),
          borderRight: `${BORDERS[borderWeight]} solid hsl(var(--border))`,
        }}
      >
        <div
          style={{
            marginBottom: sp("md"),
            padding: `0 ${sp("xs")}`,
            fontSize: S.h1,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            ...fg("--foreground"),
          }}
        >
          Northstar
        </div>
        {NAV.map((item, i) => (
          <div
            key={item}
            style={{
              padding: `${sp("xs")} ${sp("sm")}`,
              fontSize: S.base,
              fontWeight: 500,
              ...rounded,
              ...(i === 0 ? { ...bg("--primary"), ...fg("--primary-foreground") } : fg("--muted-foreground")),
            }}
          >
            {item}
          </div>
        ))}
      </aside>

      {/* main */}
      <main className="flex flex-1 flex-col" style={{ gap: sp("lg"), padding: sp("xl") }}>
        {/* top bar */}
        <header className="flex items-center justify-between">
          <div>
            <h1 style={{ margin: 0, fontSize: S.h1, fontWeight: 700, fontFamily: "var(--font-display)", ...fg("--foreground") }}>
              Overview
            </h1>
            <p style={{ margin: 0, fontSize: S.base, ...fg("--muted-foreground") }}>
              Last 30 days across all workspaces
            </p>
          </div>
          <div style={{ display: "flex", gap: sp("xs") }}>
            <button
              style={{
                padding: `${sp("xs")} ${sp("sm")}`,
                fontSize: S.base,
                fontWeight: 500,
                ...rounded,
                ...bg("--secondary"),
                ...fg("--secondary-foreground"),
                cursor: "pointer",
                ...shadowOf("sm"),
              }}
            >
              Export
            </button>
            <button
              data-testid={ctaTestId}
              style={{
                padding: `${sp("xs")} ${sp("sm")}`,
                fontSize: S.base,
                fontWeight: 600,
                ...rounded,
                ...bg("--primary"),
                ...fg("--primary-foreground"),
                cursor: "pointer",
                ...shadowOf("sm"),
              }}
            >
              New report
            </button>
          </div>
        </header>

        {tabRow}

        {/* KPI cards */}
        <section className="grid grid-cols-3" style={{ gap: sp("md") }}>
          {KPIS.map((k) => (
            <div
              key={k.label}
              className="flex flex-col"
              style={{ gap: sp("xs"), padding: sp("md"), ...card, ...shadowOf("md") }}
            >
              <span style={{ fontSize: S.label, ...fg("--muted-foreground"), fontFamily: "var(--font-body)" }}>{k.label}</span>
              <span style={{ fontSize: S.kpi, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{k.value}</span>
              <span style={{ fontSize: S.label, fontWeight: 500, fontFamily: "var(--font-mono)", ...fg(k.up ? "--primary" : "--destructive") }}>{k.delta}</span>
            </div>
          ))}
        </section>

        {/* chart — rounded tops, taller */}
        <section className="flex flex-col" style={{ gap: sp("xs"), padding: sp("md"), ...card, ...shadowOf("md") }}>
          <span style={{ fontSize: S.base, fontWeight: 500, ...fg("--card-foreground"), fontFamily: "var(--font-body)" }}>
            Weekly active
          </span>
          <div style={{ display: "flex", height: 128, alignItems: "flex-end", gap: sp("xs") }}>
            {[40, 65, 50, 80, 70, 95, 60].map((h, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  height: `${h}%`,
                  borderRadius: `calc(var(--radius, 8) * 1px) calc(var(--radius, 8) * 1px) 0 0`,
                  ...bg(i === 5 ? "--primary" : "--accent"),
                }}
              />
            ))}
          </div>
        </section>

        {/* table */}
        <section className="flex flex-col" style={{ padding: sp("md"), ...card, ...shadowOf("md") }}>
          {filterBar}
          <div
            className="grid grid-cols-[2fr_1fr_1fr_1fr_auto]"
            style={{
              gap: sp("md"),
              paddingBottom: sp("xs"),
              fontSize: S.label,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              ...fg("--muted-foreground"),
              fontFamily: "var(--font-body)",
            }}
          >
            <span>Workspace</span>
            <span>Plan</span>
            <span>Usage</span>
            <span>Status</span>
            <span />
          </div>
          {ROWS.map((r) => (
            <div
              key={r.name}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center"
              style={{
                gap: sp("md"),
                padding: `${sp("sm")} 0`,
                borderTop: `1px solid hsl(var(--border))`,
                ...fg("--card-foreground"),
              }}
            >
              <span style={{ fontWeight: 500, fontFamily: "var(--font-body)", fontSize: S.base }}>{r.name}</span>
              <span style={{ ...fg("--muted-foreground"), fontFamily: "var(--font-body)", fontSize: S.base }}>{r.plan}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: S.base }}>{r.usage}%</span>
              <span style={statusPill(r.status)}>{r.status}</span>
              <button
                style={{
                  padding: `${sp("xs")} ${sp("sm")}`,
                  fontSize: S.label,
                  fontFamily: "var(--font-body)",
                  ...rounded,
                  ...bg("--destructive"),
                  ...fg("--destructive-foreground"),
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </section>

        <p style={{ margin: 0, fontSize: S.label, ...fg("--muted-foreground"), fontFamily: "var(--font-body)" }}>
          Data refreshes hourly · times shown in your workspace timezone.
        </p>
      </main>
    </div>
  );
}
