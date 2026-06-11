import type { AppManifest } from "@invariance/schema";
import { useCallback, useEffect, useState } from "react";
import { api, type AnalyticsSummary, type ModRow } from "./api";

const DEFAULT_APP = "streamline";

export default function App() {
  const [appId, setAppId] = useState(DEFAULT_APP);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, s, list] = await Promise.all([
        api.manifest(appId).catch(() => null),
        api.summary(appId),
        api.mods(appId),
      ]);
      setManifest(m);
      setSummary(s);
      setMods(list);
      setError(null);
      setLoadedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(`Cannot reach the control plane (${(err as Error).message})`);
    }
  }, [appId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (action: "kill" | "restore", modId: string) => {
    await (action === "kill" ? api.kill(appId, modId) : api.restore(appId, modId));
    await refresh();
  };

  return (
    <div className="console">
      <header>
        <h1>
          <span className="logo">◆</span> Invariance Console
        </h1>
        <div className="header-right">
          <label>
            App{" "}
            <input value={appId} onChange={(e) => setAppId(e.target.value)} spellCheck={false} />
          </label>
          <button onClick={() => void refresh()}>Refresh</button>
          {loadedAt && <span className="muted">updated {loadedAt}</span>}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <section className="panel">
          <h2>Summary</h2>
          {summary ? <SummaryPanel summary={summary} /> : <p className="muted">No data yet.</p>}
        </section>

        <section className="panel wide">
          <h2>
            Mods <span className="muted">({mods.length})</span>
          </h2>
          <ModsTable mods={mods} onAct={act} />
        </section>

        <section className="panel wide">
          <h2>
            Manifest{" "}
            {manifest && (
              <span className="muted">
                v{manifest.version} · {manifest.appId}
              </span>
            )}
          </h2>
          {manifest ? <ManifestPanel manifest={manifest} /> : <p className="muted">No manifest published.</p>}
        </section>
      </main>
    </div>
  );
}

function SummaryPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <div className="summary">
      <div className="stat-row">
        <Stat label="mods" value={summary.mods.total} />
        <Stat label="active" value={summary.mods.byStatus["active"] ?? 0} />
        <Stat label="degraded" value={summary.mods.degraded} accent={summary.mods.degraded > 0} />
        <Stat label="events" value={summary.events.total} />
      </div>

      <h3>Events by type</h3>
      <Ranked rows={Object.entries(summary.events.byType).map(([name, count]) => ({ name, count }))} />

      <h3>Top tokens touched</h3>
      <Ranked rows={summary.topTokens} empty="No UI customizations yet." />

      <h3>Top endpoints hooked</h3>
      <Ranked rows={summary.topEndpoints} empty="No API-seam mods yet." />

      <h3>Top slots overridden</h3>
      <Ranked rows={summary.topComponents} empty="No slot overrides yet." />

      <h3>Recent prompts</h3>
      {summary.recentPrompts.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="prompts">
          {summary.recentPrompts.slice(0, 8).map((p, i) => (
            <li key={i}>
              <span className="muted">{p.subjectId}:</span> “{p.prompt}”
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`stat${accent ? " accent" : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Ranked({
  rows,
  empty = "Nothing yet.",
}: {
  rows: Array<{ name: string; count: number }>;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="ranked">
      <tbody>
        {rows.slice(0, 6).map((row) => (
          <tr key={row.name}>
            <td className="ranked-name">{row.name}</td>
            <td className="ranked-bar">
              <div className="bar" style={{ width: `${(row.count / max) * 100}%` }} />
            </td>
            <td className="ranked-count">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ModsTable({
  mods,
  onAct,
}: {
  mods: ModRow[];
  onAct: (action: "kill" | "restore", modId: string) => Promise<void>;
}) {
  if (mods.length === 0) return <p className="muted">No mods published for this app.</p>;
  const ordered = [...mods].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (
    <table className="mods">
      <thead>
        <tr>
          <th>subject</th>
          <th>rev</th>
          <th>status</th>
          <th>surfaces</th>
          <th>bound to</th>
          <th>last prompt</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {ordered.map((mod) => (
          <tr key={mod.modId} className={mod.status === "superseded" ? "dim" : ""}>
            <td>{mod.subjectId}</td>
            <td>{mod.revision}</td>
            <td>
              <span className={`status status-${mod.status}`}>{mod.status}</span>
              {mod.status === "degraded" && mod.reasons.length > 0 && (
                <div className="reasons">{mod.reasons.join("; ")}</div>
              )}
            </td>
            <td>{mod.classification ? surfacesLabel(mod.classification.surfaces) : "—"}</td>
            <td>v{mod.boundManifestVersion}</td>
            <td className="prompt-cell">{mod.prompts.at(-1) ?? <span className="muted">seeded</span>}</td>
            <td>
              {(mod.status === "active" || mod.status === "stale" || mod.status === "degraded") && (
                <button className="danger" onClick={() => void onAct("kill", mod.modId)}>
                  Kill
                </button>
              )}
              {mod.status === "disabled" && (
                <button onClick={() => void onAct("restore", mod.modId)}>Restore</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function surfacesLabel(surfaces: { tokens: number; styles: number; slots: number; hooks: number }) {
  const parts: string[] = [];
  if (surfaces.tokens) parts.push(`${surfaces.tokens} token${surfaces.tokens > 1 ? "s" : ""}`);
  if (surfaces.styles) parts.push(`${surfaces.styles} style${surfaces.styles > 1 ? "s" : ""}`);
  if (surfaces.slots) parts.push(`${surfaces.slots} slot${surfaces.slots > 1 ? "s" : ""}`);
  if (surfaces.hooks) parts.push(`${surfaces.hooks} hook${surfaces.hooks > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : "empty";
}

function ManifestPanel({ manifest }: { manifest: AppManifest }) {
  return (
    <div className="manifest">
      <div>
        <h3>Design tokens ({manifest.designTokens.length})</h3>
        <ul>
          {manifest.designTokens.map((t) => (
            <li key={t.name}>
              {t.kind === "color" && <span className="swatch" style={{ background: t.value }} />}
              <code>{t.name}</code> <span className="muted">{t.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Components ({manifest.components.length})</h3>
        <ul>
          {manifest.components.map((c) => (
            <li key={c.id}>
              <code>{c.id}</code>{" "}
              <span className="muted">
                {c.slots.map((s) => s.name + (s.overridable ? "" : " 🔒")).join(", ") || "no slots"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Endpoints ({manifest.endpoints.length})</h3>
        <ul>
          {manifest.endpoints.map((e) => (
            <li key={e.id}>
              <code>
                {e.method} {e.path}
              </code>{" "}
              <span className="muted">{e.id}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Invariants ({manifest.policies.length})</h3>
        <ul>
          {manifest.policies.map((p) => (
            <li key={p.id}>
              <code>{p.id}</code> <span className="muted">{describePolicy(p)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function describePolicy(policy: AppManifest["policies"][number]): string {
  switch (policy.type) {
    case "endpoint-deny":
      return `no hooks on ${policy.endpointId} (${policy.phases.join("/")})`;
    case "field-constraint": {
      const c = policy.constraint;
      const rules = [
        c.immutable ? "immutable" : null,
        c.min !== undefined ? `min ${c.min}` : null,
        c.max !== undefined ? `max ${c.max}` : null,
        c.enum ? `in {${c.enum.join(", ")}}` : null,
        c.pattern ? `matches /${c.pattern}/` : null,
      ].filter(Boolean);
      return `${policy.endpointId} · ${policy.fieldPath}: ${rules.join(", ")}`;
    }
    case "budget-limit":
      return `hooks ≤ ${policy.maxCpuMsPerHook}ms CPU, ≤ ${policy.maxMemMbPerHook}MB`;
  }
}
