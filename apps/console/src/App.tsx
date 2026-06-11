import type { AppManifest } from "@invariance/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AnalyticsSummary, type ModRow } from "./api";

const DEFAULT_APP = "streamline";
const HELP_DISMISSED_KEY = "invariance-console:help-dismissed";

const STATUS_HELP: Record<string, string> = {
  active: "Live: this user sees the customization right now.",
  stale: "Your app shipped an update; this mod is re-checked on the user's next visit.",
  degraded: "Paused: it no longer passes your guardrails after an app update. The user is offered an AI fix.",
  disabled: "Killed by a developer. The user sees the base app.",
  superseded: "Replaced by a newer revision of this user's customizations.",
};

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

      <HelpBanner />

      {error && <div className="error">{error}</div>}

      <main>
        <section className="panel">
          <h2>At a glance</h2>
          {summary ? <SummaryPanel summary={summary} /> : <p className="muted">No data yet.</p>}
        </section>

        <section className="panel wide">
          <h2>
            Your users&rsquo; customizations <span className="muted">({mods.length})</span>
          </h2>
          <p className="hint">
            Every change a user has made, newest first. Kill anything that shouldn&rsquo;t be live —
            it takes effect within seconds and the user falls back to the base app.
          </p>
          <ModsTable mods={mods} onAct={act} />
        </section>

        <section className="panel wide">
          <h2>
            What users are allowed to touch{" "}
            {manifest && (
              <span className="muted">
                (manifest v{manifest.version} · {manifest.appId})
              </span>
            )}
          </h2>
          <p className="hint">
            Published from your codebase with <code>invariance manifest publish</code>. Users can
            only customize what is declared here — anything else is rejected before it is ever
            signed.
          </p>
          {manifest ? (
            <ManifestPanel manifest={manifest} />
          ) : (
            <p className="muted">No manifest published for this app yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function HelpBanner() {
  const [open, setOpen] = useState(() => localStorage.getItem(HELP_DISMISSED_KEY) !== "1");
  if (!open) {
    return (
      <button
        className="link"
        onClick={() => {
          localStorage.removeItem(HELP_DISMISSED_KEY);
          setOpen(true);
        }}
      >
        What am I looking at?
      </button>
    );
  }
  return (
    <div className="help">
      <div className="help-head">
        <strong>How Invariance works</strong>
        <button
          className="link"
          onClick={() => {
            localStorage.setItem(HELP_DISMISSED_KEY, "1");
            setOpen(false);
          }}
        >
          Dismiss
        </button>
      </div>
      <p>
        Your users describe changes to your app in plain language — &ldquo;make the accent color
        teal&rdquo;, &ldquo;sort shows by rating&rdquo;. Each request becomes a <strong>mod</strong>:
        a small, signed package of changes that only applies for that user.
      </p>
      <ol>
        <li>
          <strong>You stay in control.</strong> Mods can only touch what you declare below — your
          chosen style properties, UI areas, and API endpoints — and must pass your{" "}
          <strong>guardrails</strong> (e.g. &ldquo;prices can never be rewritten&rdquo;) before they
          are signed. There is no way around the check: unsigned mods never run.
        </li>
        <li>
          <strong>Nothing breaks.</strong> Mods run sandboxed with strict budgets, and any failure
          falls back to your base app. When you ship an update, incompatible mods pause themselves.
        </li>
        <li>
          <strong>You see everything.</strong> This console shows what users are changing, and every
          mod has a kill switch.
        </li>
      </ol>
    </div>
  );
}

function SummaryPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <div className="summary">
      <div className="stat-row">
        <Stat label="customizations" value={summary.mods.total} />
        <Stat label="live now" value={summary.mods.byStatus["active"] ?? 0} />
        <Stat
          label="paused"
          value={summary.mods.degraded}
          accent={summary.mods.degraded > 0}
          help="Mods that stopped passing your guardrails after an app update."
        />
        <Stat label="events" value={summary.events.total} />
      </div>

      <h3 title="Telemetry from the SDKs: applications, rejections, enforcement actions.">
        Activity
      </h3>
      <Ranked rows={Object.entries(summary.events.byType).map(([name, count]) => ({ name, count }))} />

      <h3 title="Design tokens: the named style properties (colors, spacing, type) users may restyle.">
        Most-restyled properties
      </h3>
      <Ranked rows={summary.topTokens} empty="No restyles yet." />

      <h3 title="API endpoints users have attached behavior-changing hooks to.">
        Most-rewired endpoints
      </h3>
      <Ranked rows={summary.topEndpoints} empty="No behavior changes yet." />

      <h3 title="UI slots users have replaced with their own content.">Most-edited UI areas</h3>
      <Ranked rows={summary.topComponents} empty="No UI edits yet." />

      <h3 title="The most recent plain-language requests, straight from your users.">
        What users are asking for
      </h3>
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

function Stat({
  label,
  value,
  accent,
  help,
}: {
  label: string;
  value: number;
  accent?: boolean;
  help?: string;
}) {
  return (
    <div className={`stat${accent ? " accent" : ""}`} title={help}>
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

const MODS_PAGE = 15;

function ModsTable({
  mods,
  onAct,
}: {
  mods: ModRow[];
  onAct: (action: "kill" | "restore", modId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = useMemo(() => {
    const ordered = [...mods].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const live = showHistory ? ordered : ordered.filter((m) => m.status !== "superseded");
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (m) =>
        m.subjectId.toLowerCase().includes(q) ||
        m.status.includes(q) ||
        m.prompts.some((p) => p.toLowerCase().includes(q)),
    );
  }, [mods, query, showHistory]);

  if (mods.length === 0) {
    return (
      <p className="muted">
        No customizations yet. They will appear here the moment a user submits one.
      </p>
    );
  }

  const visible = showAll ? filtered : filtered.slice(0, MODS_PAGE);

  return (
    <>
      <div className="table-tools">
        <input
          className="search"
          placeholder="Search by user, request, or status…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowAll(false);
          }}
        />
        <label className="muted checkbox">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />{" "}
          include replaced revisions
        </label>
      </div>
      <table className="mods">
        <thead>
          <tr>
            <th>user</th>
            <th title="Each new request replaces the previous revision of that user's mod.">rev</th>
            <th>status</th>
            <th title="Which surfaces this mod touches: style properties, CSS rules, UI areas, API hooks.">
              what it changes
            </th>
            <th title="The app version this mod was verified against.">app version</th>
            <th>user&rsquo;s request</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((mod) => (
            <tr key={mod.modId} className={mod.status === "superseded" ? "dim" : ""}>
              <td>{mod.subjectId}</td>
              <td>{mod.revision}</td>
              <td>
                <span className={`status status-${mod.status}`} title={STATUS_HELP[mod.status]}>
                  {mod.status === "degraded" ? "paused" : mod.status === "disabled" ? "killed" : mod.status}
                </span>
                {mod.status === "degraded" && mod.reasons.length > 0 && (
                  <div className="reasons">{mod.reasons.join("; ")}</div>
                )}
              </td>
              <td>{mod.classification ? surfacesLabel(mod.classification.surfaces) : "—"}</td>
              <td>v{mod.boundManifestVersion}</td>
              <td className="prompt-cell">
                {mod.prompts.at(-1) ?? <span className="muted">published by a developer</span>}
              </td>
              <td>
                {(mod.status === "active" || mod.status === "stale" || mod.status === "degraded") && (
                  <button
                    className="danger"
                    title="Disable this mod. The user falls back to the base app within seconds."
                    onClick={() => void onAct("kill", mod.modId)}
                  >
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
      {filtered.length > visible.length && (
        <button className="link" onClick={() => setShowAll(true)}>
          Show all {filtered.length}
        </button>
      )}
      {filtered.length === 0 && <p className="muted">No mods match “{query}”.</p>}
    </>
  );
}

function surfacesLabel(surfaces: { tokens: number; styles: number; slots: number; hooks: number }) {
  const parts: string[] = [];
  if (surfaces.tokens) parts.push(`${surfaces.tokens} style propert${surfaces.tokens > 1 ? "ies" : "y"}`);
  if (surfaces.styles) parts.push(`${surfaces.styles} CSS rule${surfaces.styles > 1 ? "s" : ""}`);
  if (surfaces.slots) parts.push(`${surfaces.slots} UI area${surfaces.slots > 1 ? "s" : ""}`);
  if (surfaces.hooks) parts.push(`${surfaces.hooks} API hook${surfaces.hooks > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : "empty";
}

/**
 * Manifest sections are searchable and capped: a real app can declare
 * hundreds of tokens and endpoints, and a wall of all of them helps no one.
 */
function ManifestSection<T>({
  title,
  hint,
  items,
  searchText,
  render,
  keyOf,
}: {
  title: string;
  hint: string;
  items: T[];
  searchText: (item: T) => string;
  render: (item: T) => React.ReactNode;
  keyOf: (item: T) => string;
}) {
  const CAP = 8;
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => searchText(i).toLowerCase().includes(q)) : items;
  const visible = showAll ? filtered : filtered.slice(0, CAP);

  return (
    <div>
      <h3>
        {title} <span className="muted">({items.length})</span>
      </h3>
      <p className="hint">{hint}</p>
      {items.length > CAP && (
        <input
          className="search"
          placeholder={`Search ${items.length}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowAll(false);
          }}
        />
      )}
      {items.length === 0 ? (
        <p className="muted">None declared.</p>
      ) : (
        <ul>{visible.map((item) => <li key={keyOf(item)}>{render(item)}</li>)}</ul>
      )}
      {filtered.length > visible.length && (
        <button className="link" onClick={() => setShowAll(true)}>
          Show all {filtered.length}
        </button>
      )}
      {q && filtered.length === 0 && items.length > 0 && (
        <p className="muted">No matches for “{query}”.</p>
      )}
    </div>
  );
}

function ManifestPanel({ manifest }: { manifest: AppManifest }) {
  return (
    <div className="manifest">
      <ManifestSection
        title="Style properties"
        hint="Colors, spacing, and type users may restyle (your design tokens)."
        items={manifest.designTokens}
        keyOf={(t) => t.name}
        searchText={(t) => `${t.name} ${t.value} ${t.description ?? ""}`}
        render={(t) => (
          <>
            {t.kind === "color" && <span className="swatch" style={{ background: t.value }} />}
            <code>{t.name}</code>{" "}
            <span className="muted">{t.description ?? t.value}</span>
          </>
        )}
      />
      <ManifestSection
        title="UI areas"
        hint="Marked spots in your interface users may fill with their own content. 🔒 = off-limits."
        items={manifest.components}
        keyOf={(c) => c.id}
        searchText={(c) => `${c.name} ${c.id} ${c.slots.map((s) => s.name).join(" ")}`}
        render={(c) => (
          <>
            <code>{c.name}</code>{" "}
            <span className="muted">
              {c.slots.map((s) => s.name + (s.overridable ? "" : " 🔒")).join(", ") || "no slots"}
            </span>
          </>
        )}
      />
      <ManifestSection
        title="API endpoints"
        hint="The requests and responses user hooks may transform — per user, in a sandbox."
        items={manifest.endpoints}
        keyOf={(e) => e.id}
        searchText={(e) => `${e.method} ${e.path} ${e.id} ${e.description ?? ""}`}
        render={(e) => (
          <>
            <code>
              {e.method} {e.path}
            </code>{" "}
            <span className="muted">{e.description ?? e.id}</span>
          </>
        )}
      />
      <ManifestSection
        title="Guardrails"
        hint="Your invariants: rules no mod may break, checked before signing and again at runtime."
        items={manifest.policies}
        keyOf={(p) => p.id}
        searchText={(p) => `${p.id} ${p.description ?? ""} ${describePolicy(p)}`}
        render={(p) => (
          <>
            <code>{p.id}</code> <span className="muted">{p.description ?? describePolicy(p)}</span>
          </>
        )}
      />
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
        c.immutable ? "can never be changed" : null,
        c.min !== undefined ? `min ${c.min}` : null,
        c.max !== undefined ? `max ${c.max}` : null,
        c.enum ? `one of {${c.enum.join(", ")}}` : null,
        c.pattern ? `matches /${c.pattern}/` : null,
      ].filter(Boolean);
      return `${policy.endpointId} · ${policy.fieldPath}: ${rules.join(", ")}`;
    }
    case "budget-limit":
      return `hooks limited to ${policy.maxCpuMsPerHook}ms CPU, ${policy.maxMemMbPerHook}MB memory`;
  }
}
