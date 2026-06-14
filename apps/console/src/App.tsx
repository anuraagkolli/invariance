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

/* ------------------------------------------------------------------ */
/* Shared style tokens (the /dev design language)                       */
/* ------------------------------------------------------------------ */

const CARD = "rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/10";
const BTN_PRIMARY =
  "rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40";
const BTN_SECONDARY =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white";
const BTN_DANGER =
  "rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20";
const BTN_LINK =
  "text-xs font-medium text-emerald-300 underline-offset-2 transition-colors hover:text-emerald-200 hover:underline";
const INPUT = "rounded-md border border-white/15 bg-surface px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none";
const H2 = "text-sm font-semibold text-white";
const SUBHEAD = "text-xs font-medium uppercase tracking-wide text-white/40";
const HINT = "text-sm text-white/60";
const CODE = "rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white/90";
const ERROR = "rounded-xl bg-red-500/10 p-4 text-sm text-red-300 ring-1 ring-red-500/30";

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

const STATUS_TINT: Record<string, string> = {
  active: "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10",
  stale: "text-amber-300 ring-amber-500/30 bg-amber-500/10",
  degraded: "text-red-300 ring-red-500/30 bg-red-500/10",
  disabled: "text-white/40 ring-white/10 bg-white/[0.03]",
  superseded: "text-white/40 ring-white/10 bg-white/[0.03]",
  none: "text-white/40 ring-white/10 bg-white/[0.03]",
};

function StatusChip({ status }: { status: string }) {
  const tint = STATUS_TINT[status] ?? "text-white/50 ring-white/10 bg-white/[0.03]";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ring-1 ${tint}`}
      title={STATUS_HELP[status]}
    >
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

  const onDashboard = !subject && !guardrails;

  return (
    <div className="min-h-screen bg-ink px-6 py-10 text-white sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.34em] text-white/50">
              Invariance · Console
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <button
                className="transition-colors hover:text-white/80"
                onClick={closeSubject}
              >
                Invariance Console
              </button>
            </h1>
            {subject && (
              <p className="mt-1 font-mono text-xs text-white/50">
                user · <span className="text-white/70">{subject}</span>
              </p>
            )}
            {guardrails && <p className="mt-1 font-mono text-xs text-white/50">guardrails</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className={`${BTN_SECONDARY} ${onDashboard ? "text-white" : ""}`}
              href="#"
            >
              Dashboard
            </a>
            <a
              className={`${BTN_SECONDARY} ${guardrails ? "text-white" : ""}`}
              href="#/guardrails"
            >
              Guardrails
            </a>
            <label className="flex items-center gap-2 text-xs text-white/50">
              App
              <input
                className={INPUT}
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                spellCheck={false}
              />
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <HelpBanner />
        <span className="flex items-center gap-3">
          <button className={BTN_SECONDARY} onClick={() => void refresh()}>
            Refresh
          </button>
          {loadedAt && <span className="text-xs text-white/40">updated {loadedAt}</span>}
        </span>
      </div>

      {error && <div className={ERROR}>{error}</div>}

      <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
        <section className={`${CARD} lg:row-span-2`}>
          <h2 className={H2}>At a glance</h2>
          {summary ? (
            <SummaryPanel summary={summary} onFilter={setModsQuery} />
          ) : (
            <p className={`mt-3 ${HINT}`}>No data yet.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={H2}>
            Your users&rsquo; customizations <span className="text-white/40">({mods.length})</span>
          </h2>
          <p className={`mt-1 ${HINT}`}>
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

        <section className={CARD}>
          <h2 className={H2}>
            What users are allowed to touch{" "}
            {manifest && (
              <span className="text-white/40">
                (manifest v{manifest.version} · {manifest.appId})
              </span>
            )}
          </h2>
          <p className={`mt-1 ${HINT}`}>
            Published from your codebase with <code className={CODE}>invariance manifest publish</code>.
            Users can only customize what is declared here — anything else is rejected before it is
            ever signed.
          </p>
          {manifest ? (
            <ManifestPanel manifest={manifest} />
          ) : (
            <p className={`mt-3 ${HINT}`}>No manifest published for this app yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function HelpBanner() {
  // Collapsed by default to keep the dashboard calm; one click expands the explainer.
  const [open, setOpen] = useState(() => localStorage.getItem(HELP_DISMISSED_KEY) === "open");
  if (!open) {
    return (
      <button
        className={BTN_LINK}
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
    <div className={`max-w-3xl ${CARD}`}>
      <div className="flex items-center justify-between">
        <strong className="text-sm font-semibold text-white">How Invariance works</strong>
        <button
          className={BTN_LINK}
          onClick={() => {
            localStorage.setItem(HELP_DISMISSED_KEY, "1");
            setOpen(false);
          }}
        >
          Dismiss
        </button>
      </div>
      <p className={`mt-3 ${HINT}`}>
        Your users describe changes to your app in plain language — &ldquo;make the accent color
        teal&rdquo;, &ldquo;sort shows by rating&rdquo;. Each request becomes a{" "}
        <strong className="font-semibold text-white/80">mod</strong>: a small, signed package of
        changes that only applies for that user.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/60">
        <li>
          <strong className="font-semibold text-white/80">You stay in control.</strong> Mods can only
          touch what you declare below — your chosen style properties, UI areas, and API endpoints —
          and must pass your <strong className="font-semibold text-white/80">guardrails</strong> (e.g.
          &ldquo;prices can never be rewritten&rdquo;) before they are signed. There is no way around
          the check: unsigned mods never run.
        </li>
        <li>
          <strong className="font-semibold text-white/80">Nothing breaks.</strong> Mods run sandboxed
          with strict budgets, and any failure falls back to your base app. When you ship an update,
          incompatible mods pause themselves.
        </li>
        <li>
          <strong className="font-semibold text-white/80">You see everything.</strong> This console
          shows what users are changing, and every mod has a kill switch.
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
    <div className="mt-4 flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
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

      <div className="flex flex-col gap-2">
        <h3
          className={SUBHEAD}
          title="Telemetry from the SDKs: applications, rejections, enforcement actions."
        >
          Activity
        </h3>
        <Ranked rows={Object.entries(summary.events.byType).map(([name, count]) => ({ name, count }))} />
      </div>

      <div className="flex flex-col gap-2">
        <h3
          className={SUBHEAD}
          title="Design tokens: the named style properties (colors, spacing, type) users may restyle. Click to filter the mods table."
        >
          Most-restyled properties
        </h3>
        <Ranked rows={summary.topTokens} empty="No restyles yet." onSelect={onFilter} />
      </div>

      <div className="flex flex-col gap-2">
        <h3
          className={SUBHEAD}
          title="API endpoints users have attached behavior-changing hooks to. Click to filter the mods table."
        >
          Most-rewired endpoints
        </h3>
        <Ranked rows={summary.topEndpoints} empty="No behavior changes yet." onSelect={onFilter} />
      </div>

      <div className="flex flex-col gap-2">
        <h3
          className={SUBHEAD}
          title="UI slots users have replaced with their own content. Click to filter the mods table."
        >
          Most-edited UI areas
        </h3>
        <Ranked rows={summary.topComponents} empty="No UI edits yet." onSelect={onFilter} />
      </div>

      <div className="flex flex-col gap-2">
        <h3
          className={SUBHEAD}
          title="The most recent plain-language requests, straight from your users."
        >
          What users are asking for
        </h3>
        {summary.recentPrompts.length === 0 ? (
          <p className="text-sm text-white/50">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm text-white/70">
            {summary.recentPrompts.slice(0, 8).map((p, i) => (
              <li key={i}>
                <span className="text-white/40">{p.subjectId}:</span> “{p.prompt}”
              </li>
            ))}
          </ul>
        )}
      </div>
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
    <div
      className={`rounded-lg p-3 ring-1 ${
        accent
          ? "bg-amber-500/10 ring-amber-500/30"
          : "bg-white/[0.04] ring-white/10"
      }`}
      title={help}
    >
      <div className={`text-2xl font-semibold tracking-tight ${accent ? "text-amber-200" : "text-white"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-white/50">{label}</div>
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
  if (rows.length === 0) return <p className="text-sm text-white/50">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.slice(0, 6).map((row) => (
          <tr
            key={row.name}
            className={onSelect ? "group cursor-pointer" : ""}
            title={onSelect ? `Show mods touching ${row.name}` : undefined}
            onClick={onSelect ? () => onSelect(row.name) : undefined}
          >
            <td
              className={`max-w-[150px] truncate whitespace-nowrap py-1 pr-2 font-mono text-xs ${
                onSelect ? "text-white/70 group-hover:text-emerald-300" : "text-white/70"
              }`}
            >
              {row.name}
            </td>
            <td className="w-full py-1">
              <div
                className="h-1.5 min-w-[2px] rounded bg-emerald-500/40"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </td>
            <td className="py-1 pl-2 text-right text-xs text-white/40">{row.count}</td>
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
      <p className={`mt-4 ${HINT}`}>
        No customizations yet. They will appear here the moment a user submits one.
      </p>
    );
  }

  const visible = showAll ? filtered : filtered.slice(0, MODS_PAGE);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <input
          className={`w-full max-w-sm ${INPUT}`}
          placeholder="Search by user, request, status, or what it touches…"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setShowAll(false);
          }}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />
          include replaced revisions
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40">
                user
              </th>
              <th
                className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40"
                title="Each new request replaces the previous revision of that user's mod."
              >
                rev
              </th>
              <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40">
                status
              </th>
              <th
                className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40"
                title="Which surfaces this mod touches: style properties, CSS rules, UI areas, API hooks."
              >
                what it changes
              </th>
              <th
                className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40"
                title="The app version this mod was verified against."
              >
                app version
              </th>
              <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40">
                user&rsquo;s request
              </th>
              <th className="border-b border-white/10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((mod) => (
              <tr
                key={mod.modId}
                className={`transition-colors hover:bg-white/[0.02] ${
                  mod.status === "superseded" ? "opacity-45" : ""
                }`}
              >
                <td className="border-b border-white/5 px-3 py-3 align-top">
                  <button
                    className={BTN_LINK}
                    title="Open this user's full history"
                    onClick={() => onOpenSubject(mod.subjectId)}
                  >
                    {mod.subjectId}
                  </button>
                </td>
                <td className="border-b border-white/5 px-3 py-3 align-top text-sm text-white/70">
                  {mod.revision}
                </td>
                <td className="border-b border-white/5 px-3 py-3 align-top">
                  <StatusChip status={mod.status} />
                  {mod.status === "degraded" && mod.reasons.length > 0 && (
                    <div className="mt-1 text-xs text-red-300">{mod.reasons.join("; ")}</div>
                  )}
                </td>
                <td className="border-b border-white/5 px-3 py-3 align-top text-sm text-white/70">
                  {mod.classification ? surfacesLabel(mod.classification.surfaces) : "—"}
                </td>
                <td className="border-b border-white/5 px-3 py-3 align-top text-sm text-white/70">
                  v{mod.boundManifestVersion}
                </td>
                <td className="max-w-[260px] border-b border-white/5 px-3 py-3 align-top text-sm text-white/70">
                  {mod.prompts.at(-1) ?? <span className="text-white/40">published by a developer</span>}
                </td>
                <td className="border-b border-white/5 px-3 py-3 align-top">
                  {(mod.status === "active" || mod.status === "stale" || mod.status === "degraded") && (
                    <button
                      className={BTN_DANGER}
                      title="Disable this mod. The user falls back to the base app within seconds."
                      onClick={() => void onAct("kill", mod.modId)}
                    >
                      Kill
                    </button>
                  )}
                  {mod.status === "disabled" && (
                    <button className={BTN_SECONDARY} onClick={() => void onAct("restore", mod.modId)}>
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > visible.length && (
        <button className={BTN_LINK} onClick={() => setShowAll(true)}>
          Show all {filtered.length}
        </button>
      )}
      {filtered.length === 0 && (
        <p className="text-sm text-white/50">
          No mods match “{query}”.{" "}
          <button className={BTN_LINK} onClick={() => onQuery("")}>
            Clear
          </button>
        </p>
      )}
    </div>
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

  if (error) return <div className={ERROR}>{error}</div>;
  if (!overview) return <p className="text-sm text-white/50">Loading…</p>;

  const current = overview.mods.find((m) => m.status !== "superseded");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <button className={BTN_SECONDARY} onClick={onBack}>
          ← All users
        </button>
        <StatusChip status={overview.pointer.status} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className={CARD}>
          <h2 className={H2}>Current customization</h2>
          {current ? (
            <>
              <p className={`mt-1 ${HINT}`}>
                Revision {current.revision}, verified against app v{current.boundManifestVersion}.
                {current.status === "degraded" && current.reasons.length > 0 && (
                  <span className="text-red-300"> Paused: {current.reasons.join("; ")}</span>
                )}
              </p>
              {current.contents ? (
                <ModContentsView contents={current.contents} />
              ) : (
                <p className={`mt-3 ${HINT}`}>Contents unavailable.</p>
              )}
              <div className="mt-4">
                {(current.status === "active" ||
                  current.status === "stale" ||
                  current.status === "degraded") && (
                  <button className={BTN_DANGER} onClick={() => void act("kill", current.modId)}>
                    Kill this user&rsquo;s customization
                  </button>
                )}
                {current.status === "disabled" && (
                  <button className={BTN_SECONDARY} onClick={() => void act("restore", current.modId)}>
                    Restore
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className={`mt-3 ${HINT}`}>This user has no customizations.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={H2}>History</h2>
          <p className={`mt-1 ${HINT}`}>Each request replaces the previous revision.</p>
          {overview.mods.length === 0 ? (
            <p className={`mt-3 ${HINT}`}>Nothing yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {overview.mods.map((mod, i) => (
                <li
                  key={mod.modId}
                  className={`border-l-2 pl-3 ${
                    i === 0 ? "border-emerald-500/60" : "border-white/10"
                  } ${mod.status === "superseded" ? "opacity-45" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold text-white">rev {mod.revision}</strong>
                    <StatusChip status={mod.status} />
                    <span className="text-xs text-white/40">
                      {new Date(mod.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {mod.prompts.at(-1) ? `“${mod.prompts.at(-1)}”` : "published by a developer"}
                  </div>
                  {mod.classification && (
                    <div className="mt-0.5 text-xs text-white/40">
                      {surfacesLabel(mod.classification.surfaces)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <h2 className={`mt-6 ${H2}`}>Recent activity</h2>
          {overview.events.length === 0 ? (
            <p className={`mt-3 ${HINT}`}>No telemetry from this user yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {overview.events.slice(0, 12).map((e, i) => (
                <li key={i} className="text-sm text-white/70">
                  <code className={CODE}>{e.type}</code>{" "}
                  <span className="text-xs text-white/40">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                  {Array.isArray(e.detail?.violations) && (
                    <div className="mt-1 text-xs text-red-300">
                      {(e.detail.violations as string[]).join("; ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ModContentsView({ contents }: { contents: ModContents }) {
  const tokens = contents.uiOps.filter((op): op is Extract<UiOp, { type: "token-override" }> => op.type === "token-override");
  const styles = contents.uiOps.filter((op): op is Extract<UiOp, { type: "style-rule" }> => op.type === "style-rule");
  const slots = contents.uiOps.filter((op): op is Extract<UiOp, { type: "slot-override" }> => op.type === "slot-override");

  return (
    <div className="mt-4 grid gap-6 sm:grid-cols-2">
      {tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={SUBHEAD}>Restyled properties</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-white/70">
            {tokens.map((op) => (
              <li key={op.token} className="flex items-center gap-1.5">
                <code className={CODE}>{op.token}</code> →
                <span
                  className="inline-block h-3 w-3 rounded-sm ring-1 ring-white/15"
                  style={{ background: op.value }}
                />
                <code className={CODE}>{op.value}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {styles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={SUBHEAD}>Custom CSS rules</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-white/70">
            {styles.map((op, i) => (
              <li key={i}>
                <code className={CODE}>
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
        <div className="flex flex-col gap-2">
          <h3 className={SUBHEAD}>Replaced UI areas</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-white/70">
            {slots.map((op, i) => (
              <li key={i}>
                <code className={CODE}>
                  {op.componentId}.{op.slot}
                </code>{" "}
                <span className="text-white/40">{op.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contents.hooks.length > 0 && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <h3 className={SUBHEAD}>API hooks</h3>
          <p className={HINT}>
            Runs in a sandbox ({contents.capabilities.budgets.cpuMs}ms CPU,{" "}
            {contents.capabilities.budgets.memMb}MB), may only write{" "}
            {contents.capabilities.writes
              .map((w) => `${w.endpointId}${w.fields ? ` (${w.fields.join(", ")})` : ""}`)
              .join("; ") || "nothing"}
            .
          </p>
          <ul className="flex flex-col gap-2 text-sm text-white/70">
            {contents.hooks.map((hook) => (
              <li key={hook.id}>
                <details className="group">
                  <summary className="cursor-pointer">
                    <code className={CODE}>{hook.trigger.endpointId}</code>{" "}
                    <span className="text-white/40">({hook.trigger.phase} phase)</span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-ink p-3 font-mono text-[12px] text-white/80 ring-1 ring-white/10">
                    {hook.source}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contents.uiOps.length === 0 && contents.hooks.length === 0 && (
        <p className="text-sm text-white/50">This mod is empty.</p>
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
    <div className="flex flex-col gap-2">
      <h3 className={SUBHEAD}>
        {title} <span className="text-white/30">({items.length})</span>
      </h3>
      <p className="text-xs text-white/50">{hint}</p>
      {items.length > CAP && (
        <input
          className={`w-full ${INPUT}`}
          placeholder={`Search ${items.length}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowAll(false);
          }}
        />
      )}
      {items.length === 0 ? (
        <p className="text-sm text-white/50">None declared.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm text-white/70">
          {visible.map((item) => (
            <li key={keyOf(item)}>{render(item)}</li>
          ))}
        </ul>
      )}
      {filtered.length > visible.length && (
        <button className={BTN_LINK} onClick={() => setShowAll(true)}>
          Show all {filtered.length}
        </button>
      )}
      {q && filtered.length === 0 && items.length > 0 && (
        <p className="text-sm text-white/50">No matches for “{query}”.</p>
      )}
    </div>
  );
}

function ManifestPanel({ manifest }: { manifest: AppManifest }) {
  return (
    <div className="mt-4 grid gap-6 sm:grid-cols-2">
      <ManifestSection
        title="Style properties"
        hint="Colors, spacing, and type users may restyle (your design tokens)."
        items={manifest.designTokens}
        keyOf={(t) => t.name}
        searchText={(t) => `${t.name} ${t.value} ${t.description ?? ""}`}
        render={(t) => (
          <span className="inline-flex items-center gap-1.5">
            {t.kind === "color" && (
              <span
                className="inline-block h-3 w-3 rounded-sm ring-1 ring-white/15"
                style={{ background: t.value }}
              />
            )}
            <code className={CODE}>{t.name}</code>{" "}
            <span className="text-white/40">{t.description ?? t.value}</span>
          </span>
        )}
      />
      <ManifestSection
        title="UI areas"
        hint="Marked spots in your interface users may fill with their own content. 🔒 = off-limits."
        items={manifest.components}
        keyOf={(c) => c.id}
        searchText={(c) => `${c.name} ${c.id} ${c.slots.map((s) => s.name).join(" ")}`}
        render={(c) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <code className={CODE}>{c.name}</code>{" "}
            <span className="text-white/40">
              {c.slots.map((s) => s.name + (s.overridable ? "" : " 🔒")).join(", ") || "no slots"}
            </span>
          </span>
        )}
      />
      <ManifestSection
        title="API endpoints"
        hint="The requests and responses user hooks may transform — per user, in a sandbox."
        items={manifest.endpoints}
        keyOf={(e) => e.id}
        searchText={(e) => `${e.method} ${e.path} ${e.id} ${e.description ?? ""}`}
        render={(e) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <code className={CODE}>
              {e.method} {e.path}
            </code>{" "}
            <span className="text-white/40">{e.description ?? e.id}</span>
          </span>
        )}
      />
      <ManifestSection
        title="Guardrails"
        hint="Your invariants: rules no mod may break, checked before signing and again at runtime."
        items={manifest.policies}
        keyOf={(p) => p.id}
        searchText={(p) => `${p.id} ${p.description ?? ""} ${describePolicy(p)}`}
        render={(p) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <code className={CODE}>{p.id}</code>{" "}
            <span className="text-white/40">{p.description ?? describePolicy(p)}</span>
          </span>
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
    <div className="flex flex-col gap-6">
      <section className={CARD}>
        <h2 className={H2}>Live enforcement</h2>
        <p className={`mt-1 ${HINT}`}>
          Every applied customization, rejection, and runtime block — newest first, updating live.
          Trigger any guardrail below and watch it land here.
        </p>
        {error && <div className={`mt-4 ${ERROR}`}>{error}</div>}
        {events.length === 0 ? (
          <p className={`mt-3 ${HINT}`}>No activity yet. Run a guardrail test below.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1.5">
            {events.map((e, i) => {
              const h = eventToHuman(e);
              const tone =
                h.tone === "block"
                  ? "bg-red-500/10 ring-1 ring-red-500/20"
                  : h.tone === "warn"
                    ? "bg-amber-500/10 ring-1 ring-amber-500/20"
                    : "bg-white/[0.03] ring-1 ring-white/10";
              return (
                <li
                  key={i}
                  className={`grid grid-cols-[24px_1fr_auto] items-baseline gap-2 rounded-lg px-3 py-2 text-sm ${tone}`}
                >
                  <span className="text-base">{h.icon}</span>
                  <span className="text-white/80">{h.text}</span>
                  <span className="whitespace-nowrap text-xs text-white/40">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h2 className={H2}>Your invariants</h2>
        <p className={`mt-1 ${HINT}`}>
          Declared in your manifest. Click “Test it” to fire a real violation attempt and prove the
          guardrail holds — either rejected before signing, or neutralized at runtime.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>
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
      <div className="rounded-lg bg-white/[0.03] p-4 ring-1 ring-white/10">
        <div className="text-sm font-semibold text-white">{title}</div>
        <p className="mt-2 text-sm text-white/50">No test available for this invariant yet.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/[0.03] p-4 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
        {title}
        {held > 0 && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            held ✓ {held}
          </span>
        )}
      </div>
      {tests.map((t) => {
        const res = results[t.id];
        return (
          <div key={t.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button className={BTN_PRIMARY} onClick={() => onRun(t)} disabled={res === "running"}>
                {res === "running" ? "Testing…" : `Test: ${t.label}`}
              </button>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  t.layer === "authoring"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-violet-500/15 text-violet-300"
                }`}
              >
                {t.layer}
              </span>
            </div>
            {res && res !== "running" && (
              <div className={`text-sm ${res.held ? "text-emerald-300" : "font-semibold text-red-300"}`}>
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
