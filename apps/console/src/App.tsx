import type { AppManifest, UiOp } from "@invariance/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type AnalyticsSummary,
  type ModContents,
  type ModRow,
  type RecentEvent,
  type SubjectOverview,
} from "./api";
import { eventToHuman, GUARDRAIL_TESTS, type GuardrailTest } from "./guardrails";

const DEFAULT_APP = "nebula";
const HELP_DISMISSED_KEY = "invariance-console:help-dismissed";

const STATUS_HELP: Record<string, string> = {
  active: "Live: this user sees the customization right now.",
  stale: "Your app shipped an update; this mod is re-checked on the user's next visit.",
  degraded: "Paused: it no longer passes your guardrails after an app update. The user is offered an AI fix.",
  disabled: "Killed by a developer. The user sees the base app.",
  superseded: "Replaced by a newer revision of this user's customizations.",
  none: "This user has no customizations.",
};

function statusLabel(status: string): string {
  return status === "degraded" ? "paused" : status === "disabled" ? "killed" : status;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`} title={STATUS_HELP[status]}>
      {statusLabel(status)}
    </span>
  );
}

/** Hash routing: "" = dashboard, "#/guardrails" = guardrails, "#/u/<id>" = drill-down. */
function subjectFromHash(): string | null {
  const match = /^#\/u\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

function isGuardrailsHash(): boolean {
  return window.location.hash === "#/guardrails";
}

export default function App() {
  const [appId, setAppId] = useState(DEFAULT_APP);
  const [subject, setSubject] = useState<string | null>(() => subjectFromHash());
  const [guardrails, setGuardrails] = useState<boolean>(() => isGuardrailsHash());

  useEffect(() => {
    const onHash = () => {
      setSubject(subjectFromHash());
      setGuardrails(isGuardrailsHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openSubject = (subjectId: string) => {
    window.location.hash = `#/u/${encodeURIComponent(subjectId)}`;
  };
  const closeSubject = () => {
    window.location.hash = "";
  };

  return (
    <div className="console">
      <header>
        <h1>
          <span className="logo">◆</span>{" "}
          <button className="title-link" onClick={closeSubject}>
            Invariance Console
          </button>
          {subject && (
            <span className="crumb">
              {" "}
              / <span className="muted">user</span> {subject}
            </span>
          )}
          {guardrails && <span className="crumb"> / Guardrails</span>}
        </h1>
        <div className="header-right">
          <a className="nav-link" href="#/guardrails">
            Guardrails
          </a>
          <label>
            App{" "}
            <input value={appId} onChange={(e) => setAppId(e.target.value)} spellCheck={false} />
          </label>
        </div>
      </header>

      {guardrails ? (
        <GuardrailsView appId={appId} />
      ) : subject ? (
        <SubjectView appId={appId} subjectId={subject} onBack={closeSubject} />
      ) : (
        <Dashboard appId={appId} onOpenSubject={openSubject} />
      )}
    </div>
  );
}

function Dashboard({ appId, onOpenSubject }: { appId: string; onOpenSubject: (s: string) => void }) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [modsQuery, setModsQuery] = useState("");

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
    <>
      <div className="toolbar">
        <HelpBanner />
        <span>
          <button onClick={() => void refresh()}>Refresh</button>{" "}
          {loadedAt && <span className="muted">updated {loadedAt}</span>}
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      <main>
        <section className="panel">
          <h2>At a glance</h2>
          {summary ? (
            <SummaryPanel summary={summary} onFilter={setModsQuery} />
          ) : (
            <p className="muted">No data yet.</p>
          )}
        </section>

        <section className="panel wide">
          <h2>
            Your users&rsquo; customizations <span className="muted">({mods.length})</span>
          </h2>
          <p className="hint">
            Every change a user has made, newest first. Click a user for the full story, or kill
            anything that shouldn&rsquo;t be live — it takes effect within seconds.
          </p>
          <ModsTable
            mods={mods}
            query={modsQuery}
            onQuery={setModsQuery}
            onAct={act}
            onOpenSubject={onOpenSubject}
          />
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
    </>
  );
}

function HelpBanner() {
  // Collapsed by default to keep the dashboard calm; one click expands the explainer.
  const [open, setOpen] = useState(() => localStorage.getItem(HELP_DISMISSED_KEY) === "open");
  if (!open) {
    return (
      <button
        className="link"
        onClick={() => {
          localStorage.setItem(HELP_DISMISSED_KEY, "open");
          setOpen(true);
        }}
      >
        How Invariance works
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

function SummaryPanel({
  summary,
  onFilter,
}: {
  summary: AnalyticsSummary;
  onFilter: (query: string) => void;
}) {
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

      <h3 title="Design tokens: the named style properties (colors, spacing, type) users may restyle. Click to filter the mods table.">
        Most-restyled properties
      </h3>
      <Ranked rows={summary.topTokens} empty="No restyles yet." onSelect={onFilter} />

      <h3 title="API endpoints users have attached behavior-changing hooks to. Click to filter the mods table.">
        Most-rewired endpoints
      </h3>
      <Ranked rows={summary.topEndpoints} empty="No behavior changes yet." onSelect={onFilter} />

      <h3 title="UI slots users have replaced with their own content. Click to filter the mods table.">
        Most-edited UI areas
      </h3>
      <Ranked rows={summary.topComponents} empty="No UI edits yet." onSelect={onFilter} />

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
  onSelect,
}: {
  rows: Array<{ name: string; count: number }>;
  empty?: string;
  onSelect?: (name: string) => void;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="ranked">
      <tbody>
        {rows.slice(0, 6).map((row) => (
          <tr
            key={row.name}
            className={onSelect ? "clickable" : ""}
            title={onSelect ? `Show mods touching ${row.name}` : undefined}
            onClick={onSelect ? () => onSelect(row.name) : undefined}
          >
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

function modMatches(mod: ModRow, q: string): boolean {
  if (mod.subjectId.toLowerCase().includes(q)) return true;
  if (mod.status.includes(q) || statusLabel(mod.status).includes(q)) return true;
  if (mod.prompts.some((p) => p.toLowerCase().includes(q))) return true;
  const c = mod.classification;
  if (!c) return false;
  return (
    c.tokensTouched.some((t) => t.toLowerCase().includes(q)) ||
    c.endpointsHooked.some((e) => e.toLowerCase().includes(q)) ||
    c.componentsTouched.some((s) => s.toLowerCase().includes(q))
  );
}

function ModsTable({
  mods,
  query,
  onQuery,
  onAct,
  onOpenSubject,
}: {
  mods: ModRow[];
  query: string;
  onQuery: (q: string) => void;
  onAct: (action: "kill" | "restore", modId: string) => Promise<void>;
  onOpenSubject: (subjectId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = useMemo(() => {
    const ordered = [...mods].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const live = showHistory ? ordered : ordered.filter((m) => m.status !== "superseded");
    const q = query.trim().toLowerCase();
    return q ? live.filter((m) => modMatches(m, q)) : live;
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
          placeholder="Search by user, request, status, or what it touches…"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
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
              <td>
                <button
                  className="link"
                  title="Open this user's full history"
                  onClick={() => onOpenSubject(mod.subjectId)}
                >
                  {mod.subjectId}
                </button>
              </td>
              <td>{mod.revision}</td>
              <td>
                <StatusChip status={mod.status} />
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
      {filtered.length === 0 && (
        <p className="muted">
          No mods match “{query}”.{" "}
          <button className="link" onClick={() => onQuery("")}>
            Clear
          </button>
        </p>
      )}
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

/* ------------------------------------------------------------------ */
/* Per-user drill-down                                                  */
/* ------------------------------------------------------------------ */

function SubjectView({
  appId,
  subjectId,
  onBack,
}: {
  appId: string;
  subjectId: string;
  onBack: () => void;
}) {
  const [overview, setOverview] = useState<SubjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.overview(appId, subjectId));
      setError(null);
    } catch (err) {
      setError(`Cannot load this user (${(err as Error).message})`);
    }
  }, [appId, subjectId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (action: "kill" | "restore", modId: string) => {
    await (action === "kill" ? api.kill(appId, modId) : api.restore(appId, modId));
    await refresh();
  };

  if (error) return <div className="error">{error}</div>;
  if (!overview) return <p className="muted">Loading…</p>;

  const current = overview.mods.find((m) => m.status !== "superseded");

  return (
    <>
      <div className="toolbar">
        <button className="link" onClick={onBack}>
          ← All users
        </button>
        <span>
          <StatusChip status={overview.pointer.status} />
        </span>
      </div>

      <main>
        <section className="panel wide">
          <h2>Current customization</h2>
          {current ? (
            <>
              <p className="hint">
                Revision {current.revision}, verified against app v{current.boundManifestVersion}.
                {current.status === "degraded" && current.reasons.length > 0 && (
                  <span className="reasons"> Paused: {current.reasons.join("; ")}</span>
                )}
              </p>
              {current.contents ? (
                <ModContentsView contents={current.contents} />
              ) : (
                <p className="muted">Contents unavailable.</p>
              )}
              <div className="actions">
                {(current.status === "active" ||
                  current.status === "stale" ||
                  current.status === "degraded") && (
                  <button className="danger" onClick={() => void act("kill", current.modId)}>
                    Kill this user&rsquo;s customization
                  </button>
                )}
                {current.status === "disabled" && (
                  <button onClick={() => void act("restore", current.modId)}>Restore</button>
                )}
              </div>
            </>
          ) : (
            <p className="muted">This user has no customizations.</p>
          )}
        </section>

        <section className="panel">
          <h2>History</h2>
          <p className="hint">Each request replaces the previous revision.</p>
          {overview.mods.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            <ol className="timeline">
              {overview.mods.map((mod) => (
                <li key={mod.modId} className={mod.status === "superseded" ? "dim" : ""}>
                  <div>
                    <strong>rev {mod.revision}</strong> <StatusChip status={mod.status} />{" "}
                    <span className="muted">{new Date(mod.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="timeline-prompt">
                    {mod.prompts.at(-1) ? `“${mod.prompts.at(-1)}”` : "published by a developer"}
                  </div>
                  {mod.classification && (
                    <div className="muted">{surfacesLabel(mod.classification.surfaces)}</div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <h2 className="spaced">Recent activity</h2>
          {overview.events.length === 0 ? (
            <p className="muted">No telemetry from this user yet.</p>
          ) : (
            <ul className="events">
              {overview.events.slice(0, 12).map((e, i) => (
                <li key={i}>
                  <code>{e.type}</code>{" "}
                  <span className="muted">{new Date(e.at).toLocaleTimeString()}</span>
                  {Array.isArray(e.detail?.violations) && (
                    <div className="reasons">{(e.detail.violations as string[]).join("; ")}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function ModContentsView({ contents }: { contents: ModContents }) {
  const tokens = contents.uiOps.filter((op): op is Extract<UiOp, { type: "token-override" }> => op.type === "token-override");
  const styles = contents.uiOps.filter((op): op is Extract<UiOp, { type: "style-rule" }> => op.type === "style-rule");
  const slots = contents.uiOps.filter((op): op is Extract<UiOp, { type: "slot-override" }> => op.type === "slot-override");

  return (
    <div className="contents">
      {tokens.length > 0 && (
        <div>
          <h3>Restyled properties</h3>
          <ul>
            {tokens.map((op) => (
              <li key={op.token}>
                <code>{op.token}</code> → <span className="swatch" style={{ background: op.value }} />
                <code>{op.value}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {styles.length > 0 && (
        <div>
          <h3>Custom CSS rules</h3>
          <ul>
            {styles.map((op, i) => (
              <li key={i}>
                <code>
                  {op.selector} {"{ "}
                  {Object.entries(op.declarations)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("; ")}
                  {" }"}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {slots.length > 0 && (
        <div>
          <h3>Replaced UI areas</h3>
          <ul>
            {slots.map((op, i) => (
              <li key={i}>
                <code>
                  {op.componentId}.{op.slot}
                </code>{" "}
                <span className="muted">{op.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contents.hooks.length > 0 && (
        <div>
          <h3>API hooks</h3>
          <p className="hint">
            Runs in a sandbox ({contents.capabilities.budgets.cpuMs}ms CPU,{" "}
            {contents.capabilities.budgets.memMb}MB), may only write{" "}
            {contents.capabilities.writes
              .map((w) => `${w.endpointId}${w.fields ? ` (${w.fields.join(", ")})` : ""}`)
              .join("; ") || "nothing"}
            .
          </p>
          <ul>
            {contents.hooks.map((hook) => (
              <li key={hook.id}>
                <details>
                  <summary>
                    <code>{hook.trigger.endpointId}</code>{" "}
                    <span className="muted">({hook.trigger.phase} phase)</span>
                  </summary>
                  <pre>{hook.source}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contents.uiOps.length === 0 && contents.hooks.length === 0 && (
        <p className="muted">This mod is empty.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manifest                                                             */
/* ------------------------------------------------------------------ */

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
    case "design-constraint": {
      const parts = [
        policy.contrast !== undefined ? `min contrast ${policy.contrast}:1` : null,
        policy.accentChromaMax !== undefined ? `accent chroma ≤ ${policy.accentChromaMax}` : null,
      ].filter(Boolean);
      return `theme quality: ${parts.length ? parts.join(", ") : "compiler defaults"}`;
    }
  }
}

interface GuardrailResult {
  held: boolean;
  text: string;
}

async function runGuardrailTest(appId: string, t: GuardrailTest): Promise<GuardrailResult> {
  const sid = `__guardrail_${t.id}_${Date.now()}`;
  if (t.layer === "authoring") {
    const r = await api.postBundle(appId, sid, t.draft);
    return r.status === 422
      ? { held: true, text: `Rejected at authoring — ${r.reasons.join("; ")}` }
      : { held: false, text: `Unexpected ${r.status}: it was NOT rejected` };
  }
  const reg = await api.postBundle(appId, sid, t.draft);
  if (reg.status !== 201) {
    return { held: false, text: `cheat failed to register (${reg.status})` };
  }
  try {
    const json = await api.fetchDemo(
      t.runtime!.path,
      sid,
      t.runtime!.method === "POST" ? { method: "POST", body: t.runtime!.body } : undefined,
    );
    return t.runtime!.check(json)
      ? { held: true, text: "Neutralized at runtime — the app served canonical data" }
      : { held: false, text: "Runtime did NOT roll back the cheat!" };
  } catch (err) {
    return { held: false, text: `demo API unreachable (${(err as Error).message}) — is :4500 up?` };
  }
}

function GuardrailsView({ appId }: { appId: string }) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [results, setResults] = useState<Record<string, GuardrailResult | "running">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const ev = await api.events(appId, 30);
        if (active) {
          setEvents(ev);
          setError(null);
        }
      } catch (err) {
        if (active) setError(`Cannot reach the control plane (${(err as Error).message})`);
      }
    };
    void api
      .manifest(appId)
      .then((m) => active && setManifest(m))
      .catch(() => undefined);
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [appId]);

  const runTest = async (t: GuardrailTest) => {
    setResults((r) => ({ ...r, [t.id]: "running" }));
    const result = await runGuardrailTest(appId, t);
    setResults((r) => ({ ...r, [t.id]: result }));
  };

  // "held N times" per policy, derived from the live feed.
  const heldByPolicy = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (e.type === "hook_policy_violation" || e.type === "hook_capability_violation") {
        const sid = e.subjectId ?? "";
        const t = GUARDRAIL_TESTS.find((x) => sid.startsWith(`__guardrail_${x.id}_`));
        if (t) counts[t.policyId] = (counts[t.policyId] ?? 0) + 1;
      }
    }
    return counts;
  }, [events]);

  const policies = manifest?.policies ?? [];
  const platformTests = GUARDRAIL_TESTS.filter((t) => t.policyId === "platform-safety");

  return (
    <main>
      <section className="panel wide">
        <h2>Live enforcement</h2>
        <p className="hint">
          Every applied customization, rejection, and runtime block — newest first, updating live.
          Trigger any guardrail below and watch it land here.
        </p>
        {error && <div className="error">{error}</div>}
        {events.length === 0 ? (
          <p className="muted">No activity yet. Run a guardrail test below.</p>
        ) : (
          <ul className="feed">
            {events.map((e, i) => {
              const h = eventToHuman(e);
              return (
                <li key={i} className={`feed-${h.tone}`}>
                  <span className="feed-icon">{h.icon}</span>
                  <span className="feed-text">{h.text}</span>
                  <span className="muted feed-time">{new Date(e.at).toLocaleTimeString()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel wide">
        <h2>Your invariants</h2>
        <p className="hint">
          Declared in your manifest. Click “Test it” to fire a real violation attempt and prove the
          guardrail holds — either rejected before signing, or neutralized at runtime.
        </p>
        <div className="guardrails">
          {policies.map((p) => (
            <GuardrailCard
              key={p.id}
              title={describePolicy(p)}
              held={heldByPolicy[p.id] ?? 0}
              tests={GUARDRAIL_TESTS.filter((t) => t.policyId === p.id)}
              results={results}
              onRun={runTest}
            />
          ))}
          {platformTests.length > 0 && (
            <GuardrailCard
              title="Platform safety (built-in: XSS, locked slots, unknown tokens)"
              held={0}
              tests={platformTests}
              results={results}
              onRun={runTest}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function GuardrailCard({
  title,
  held,
  tests,
  results,
  onRun,
}: {
  title: string;
  held: number;
  tests: GuardrailTest[];
  results: Record<string, GuardrailResult | "running">;
  onRun: (t: GuardrailTest) => void;
}) {
  if (tests.length === 0) {
    return (
      <div className="guardrail-card">
        <div className="guardrail-title">{title}</div>
        <p className="muted">No test available for this invariant yet.</p>
      </div>
    );
  }
  return (
    <div className="guardrail-card">
      <div className="guardrail-title">
        {title} {held > 0 && <span className="held">held ✓ {held}</span>}
      </div>
      {tests.map((t) => {
        const res = results[t.id];
        return (
          <div key={t.id} className="guardrail-test">
            <button onClick={() => onRun(t)} disabled={res === "running"}>
              {res === "running" ? "Testing…" : `Test: ${t.label}`}
            </button>
            <span className={`tag tag-${t.layer}`}>{t.layer}</span>
            {res && res !== "running" && (
              <div className={res.held ? "verdict-held" : "verdict-fail"}>
                {res.held ? "🛡️ " : "❌ "}
                {res.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
