import { type TurnResult, failureTemplate } from "../demo/wiring.js";

// The three turn outcomes. Rejection copy is the ENGINE's (failureTemplate) — only the styling is
// local. rejected always carries real wall/verifier failures (no empty-array sentinel; the unscripted
// "notice" is an App-level banner, not an outcome).
const COLOR_ROLES = new Set(["primary", "accent", "neutral", "destructive"]);
const swatch = (triple: string): React.CSSProperties => ({
  display: "inline-block",
  width: 14,
  height: 14,
  borderRadius: 3,
  background: `hsl(${triple})`,
  border: "1px solid hsl(var(--border))",
});

export function OutcomePanel({ outcome, onAcknowledge }: { outcome: TurnResult | null; onAcknowledge: () => void }) {
  if (!outcome) {
    return (
      <p data-testid="idle" style={{ color: "hsl(var(--muted-foreground))" }}>
        Pick a prompt to start.
      </p>
    );
  }

  if (outcome.kind === "no_change") {
    return (
      <p data-testid="no-change" style={{ color: "hsl(var(--muted-foreground))" }}>
        No visual change from that.
      </p>
    );
  }

  if (outcome.kind === "rejected") {
    return (
      <div data-testid="rejection" style={{ border: "2px solid hsl(var(--destructive))", borderRadius: 8, padding: 12 }}>
        {outcome.failures.map((f, i) => {
          const m = failureTemplate(f);
          return (
            <div key={i} style={{ marginBottom: 8 }}>
              <strong style={{ color: "hsl(var(--destructive))" }}>{m.headline}</strong>
              <p style={{ margin: "4px 0" }}>{m.detail}</p>
              {m.suggestion && <p style={{ margin: 0, color: "hsl(var(--muted-foreground))" }}>{m.suggestion}</p>}
            </div>
          );
        })}
        <p style={{ margin: 0, fontWeight: 600 }}>
          <em>Your design is unchanged.</em>
        </p>
      </div>
    );
  }

  // diff
  return (
    <div data-testid="diff" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {outcome.diff.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, minWidth: 90 }}>{d.role}</span>
          {d.from && COLOR_ROLES.has(d.role) ? <span style={swatch(d.from)} /> : <span>{d.from ?? "—"}</span>}
          <span>→</span>
          {d.to && COLOR_ROLES.has(d.role) ? <span style={swatch(d.to)} /> : <span>{d.to ?? "—"}</span>}
          <span style={{ color: "hsl(var(--muted-foreground))" }}>({d.kind})</span>
        </div>
      ))}
      <button
        data-testid="acknowledge"
        onClick={onAcknowledge}
        style={{ marginTop: 6, padding: "6px 12px", borderRadius: 6, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
      >
        Apply this look
      </button>
    </div>
  );
}
