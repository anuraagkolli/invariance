import type { AppManifest, OnboardingPatch, UiOp } from "@invariance/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type AnalyticsSummary,
  type DesignConfig,
  type ModContents,
  type ModRow,
  type OnboardingSession,
  type RecentEvent,
  type SubjectOverview,
  type ThemeTimeline,
  type ThemeVersionEntry,
} from "./api";
import { eventToHuman, GUARDRAIL_TESTS, type GuardrailTest } from "./guardrails";
import { LockControls } from "./lock-controls";
import { VersionTimeline } from "./version-timeline";

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

/** Hash routing: "" = dashboard, "#/invariants", "#/guardrails", "#/u/<id>" = drill-down. */
function subjectFromHash(): string | null {
  const match = /^#\/u\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

function isGuardrailsHash(): boolean {
  return window.location.hash === "#/guardrails";
}

function isInvariantsHash(): boolean {
  return window.location.hash === "#/invariants";
}

function isThemesHash(): boolean {
  return window.location.hash === "#/themes" || window.location.hash.startsWith("#/themes/");
}

function isOnboardingHash(): boolean {
  return window.location.hash === "#/onboarding";
}

/** Origin of the running customer app embedded in the onboarding preview. */
const PREVIEW_ORIGIN =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PREVIEW_ORIGIN ??
  "http://localhost:4321";

/** "#/themes/<userId>" focuses the Themes view on one user; "#/themes" shows all. */
function themeUserFromHash(): string | null {
  const match = /^#\/themes\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

export default function App() {
  const [appId, setAppId] = useState(DEFAULT_APP);
  const [subject, setSubject] = useState<string | null>(() => subjectFromHash());
  const [guardrails, setGuardrails] = useState<boolean>(() => isGuardrailsHash());
  const [invariants, setInvariants] = useState<boolean>(() => isInvariantsHash());
  const [themes, setThemes] = useState<boolean>(() => isThemesHash());
  const [themeUser, setThemeUser] = useState<string | null>(() => themeUserFromHash());
  const [onboarding, setOnboarding] = useState<boolean>(() => isOnboardingHash());

  useEffect(() => {
    const onHash = () => {
      setSubject(subjectFromHash());
      setGuardrails(isGuardrailsHash());
      setInvariants(isInvariantsHash());
      setThemes(isThemesHash());
      setThemeUser(themeUserFromHash());
      setOnboarding(isOnboardingHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openSubject = (subjectId: string) => {
    window.location.hash = `#/u/${encodeURIComponent(subjectId)}`;
  };
  const openThemeUser = (userId: string) => {
    window.location.hash = `#/themes/${encodeURIComponent(userId)}`;
  };
  const closeSubject = () => {
    window.location.hash = "";
  };

  const onDashboard = !subject && !guardrails && !invariants && !themes && !onboarding;

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
            {invariants && <p className="mt-1 font-mono text-xs text-white/50">invariants</p>}
            {guardrails && <p className="mt-1 font-mono text-xs text-white/50">guardrails</p>}
            {themes && <p className="mt-1 font-mono text-xs text-white/50">themes</p>}
            {onboarding && <p className="mt-1 font-mono text-xs text-white/50">onboarding</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className={`${BTN_SECONDARY} ${onDashboard ? "text-white" : ""}`}
              href="#"
            >
              Dashboard
            </a>
            <a
              className={`${BTN_SECONDARY} ${onboarding ? "text-white" : ""}`}
              href="#/onboarding"
            >
              Onboarding
            </a>
            <a
              className={`${BTN_SECONDARY} ${invariants ? "text-white" : ""}`}
              href="#/invariants"
            >
              Invariants
            </a>
            <a
              className={`${BTN_SECONDARY} ${themes ? "text-white" : ""}`}
              href="#/themes"
            >
              Themes
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

        {onboarding ? (
          <OnboardingView appId={appId} />
        ) : invariants ? (
          <InvariantsView appId={appId} />
        ) : themes ? (
          <ThemesView appId={appId} initialUser={themeUser} />
        ) : guardrails ? (
          <GuardrailsView appId={appId} />
        ) : subject ? (
          <SubjectView appId={appId} subjectId={subject} onBack={closeSubject} />
        ) : (
          <Dashboard appId={appId} onOpenSubject={openSubject} onOpenThemeUser={openThemeUser} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding — scan a repo, review the governable surface, finalize    */
/* into a published manifest + design-config. Live preview of the       */
/* running app with section/color/font highlighting via the bridge.     */
/* ------------------------------------------------------------------ */

const LEVELS = ["locked", "theme", "+ content", "+ layout", "+ components"];
const LEVEL_HELP =
  "0 locked · 1 theme/style · 2 + content · 3 + layout · 4 + components";

function OnboardingView({ appId }: { appId: string }) {
  const [phase, setPhase] = useState<"connect" | "review" | "done">("connect");
  const [useUrl, setUseUrl] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [path, setPath] = useState("apps/nebula");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [archIdx, setArchIdx] = useState(0);
  const [selSection, setSelSection] = useState<string | null>(null);
  const [tab, setTab] = useState<"sections" | "palette" | "api">("sections");
  const [finalizing, setFinalizing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const plan = session?.plan ?? null;
  const arch = plan?.archetypes[archIdx] ?? null;

  const post = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "inv-onboard", ...msg },
      PREVIEW_ORIGIN,
    );
  }, []);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const s = await api.onboardingScan(appId, useUrl ? { repoUrl } : { path });
      setSession(s);
      setPhase("review");
      setArchIdx(0);
      setTab("sections");
      setSelSection(s.plan.archetypes[0]?.sections[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  const patch = useCallback(
    async (p: OnboardingPatch) => {
      if (!session) return;
      try {
        setSession(await api.onboardingPatch(session.sessionId, p));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [session],
  );

  async function finalize() {
    if (!session) return;
    setFinalizing(true);
    setError(null);
    try {
      const s = await api.onboardingFinalize(session.sessionId);
      setSession(s);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  }

  // Highlight the selected section whenever it (or the page) changes.
  const selected = arch?.sections.find((s) => s.id === selSection) ?? null;
  useEffect(() => {
    if (phase !== "review" || tab !== "sections" || !selected) return;
    post({ type: "highlight-section", domIndex: selected.domIndex, name: selected.name });
  }, [selected, phase, tab, post]);

  const previewSrc = `${PREVIEW_ORIGIN}${arch?.route ?? "/"}?inv-onboard=1`;

  if (phase === "connect") {
    return (
      <section className="flex flex-col gap-5">
        <div className={CARD}>
          <h2 className={H2}>Connect a repository</h2>
          <p className={`${HINT} mt-1`}>
            Scan a React + file-routed app into its <strong>governable surface</strong>: page
            archetypes, the sections end users may customize, a role-token palette seeded from
            its own colors, and the API endpoints behind it. You review and adjust everything
            before it's published.
          </p>
          <div className="mt-4 flex gap-2 text-xs">
            <button
              className={`${BTN_SECONDARY} ${!useUrl ? "text-white ring-1 ring-emerald-400/40" : ""}`}
              onClick={() => setUseUrl(false)}
            >
              Local path
            </button>
            <button
              className={`${BTN_SECONDARY} ${useUrl ? "text-white ring-1 ring-emerald-400/40" : ""}`}
              onClick={() => setUseUrl(true)}
            >
              GitHub URL
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {useUrl ? (
              <input
                className={`${INPUT} min-w-[22rem] flex-1`}
                placeholder="https://github.com/acme/app"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <input
                className={`${INPUT} min-w-[22rem] flex-1`}
                placeholder="apps/nebula"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                spellCheck={false}
              />
            )}
            <button
              className={BTN_PRIMARY}
              onClick={runScan}
              disabled={scanning || (useUrl ? !repoUrl : !path)}
            >
              {scanning ? "Scanning…" : "Scan repository"}
            </button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-white/40">
            target app · <span className="text-white/60">{appId}</span> · a URL is shallow-cloned;
            a path resolves against the monorepo root.
          </p>
        </div>
        {error && <div className={ERROR}>{error}</div>}
      </section>
    );
  }

  if (phase === "done" && session) {
    const fin = session.finalized;
    return (
      <section className="flex flex-col gap-5">
        <div className={CARD}>
          <h2 className={H2}>Onboarding complete</h2>
          <p className={`${HINT} mt-1`}>
            Published manifest <span className={CODE}>v{fin?.manifestVersion}</span> and the
            design-config for <span className="text-white/80">{appId}</span>. The look and
            business-logic pipelines can now drive this app.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-white/70">
            <li>· {plan?.archetypes.length} page archetypes wired</li>
            <li>
              · {plan?.archetypes.reduce((n, a) => n + a.sections.length, 0)} customizable sections
            </li>
            <li>· {Object.keys(plan?.roles ?? {}).length} role tokens declared</li>
            <li>· {plan?.endpoints.length} API endpoints registered (logic plane)</li>
            {fin?.staleMods ? <li>· {fin.staleMods} existing mods marked stale for re-check</li> : null}
          </ul>
          <div className="mt-4 flex gap-2">
            <a className={BTN_SECONDARY} href="#/invariants">
              View invariants →
            </a>
            <a className={BTN_SECONDARY} href="#/themes">
              View themes →
            </a>
            <button
              className={BTN_SECONDARY}
              onClick={() => {
                setSession(null);
                setPhase("connect");
              }}
            >
              Onboard another
            </button>
          </div>
        </div>
      </section>
    );
  }

  // review
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {plan?.archetypes.map((a, i) => (
            <button
              key={a.key}
              className={`${BTN_SECONDARY} ${i === archIdx ? "text-white ring-1 ring-emerald-400/40" : ""}`}
              onClick={() => {
                setArchIdx(i);
                setTab("sections");
                setSelSection(a.sections[0]?.id ?? null);
              }}
              title={a.pageFile}
            >
              {a.key}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/40">{session?.plan.repo.ref}</span>
          <button className={BTN_PRIMARY} onClick={finalize} disabled={finalizing}>
            {finalizing ? "Publishing…" : "Finalize & publish"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        {/* live preview */}
        <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
            <span className="font-mono text-[11px] text-white/50">{previewSrc}</span>
            <span className="text-[11px] text-white/40">live preview</span>
          </div>
          <iframe
            key={arch?.key}
            ref={iframeRef}
            src={previewSrc}
            title="app preview"
            className="h-[640px] w-full bg-white"
            onLoad={() => {
              if (selected) {
                window.setTimeout(
                  () =>
                    post({
                      type: "highlight-section",
                      domIndex: selected.domIndex,
                      name: selected.name,
                    }),
                  500,
                );
              }
            }}
          />
        </div>

        {/* controls */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 text-xs">
            {(["sections", "palette", "api"] as const).map((t) => (
              <button
                key={t}
                className={`${BTN_SECONDARY} ${tab === t ? "text-white ring-1 ring-emerald-400/40" : ""}`}
                onClick={() => {
                  setTab(t);
                  post({ type: "clear" });
                }}
              >
                {t === "sections" ? "Sections" : t === "palette" ? "Palette" : "API"}
              </button>
            ))}
          </div>

          {tab === "sections" && arch && (
            <div className={`${CARD} flex flex-col gap-2`}>
              <p className={SUBHEAD} title={LEVEL_HELP}>
                {arch.key} · {arch.sections.length} sections
              </p>
              {arch.sections.length === 0 && (
                <p className={HINT}>No sections segmented for this page.</p>
              )}
              {arch.sections.map((s) => {
                const active = s.id === selSection;
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg p-2.5 ring-1 transition-colors ${
                      active ? "bg-emerald-500/10 ring-emerald-400/40" : "bg-white/[0.03] ring-white/10"
                    }`}
                    onMouseEnter={() => {
                      setSelSection(s.id);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        className={`${INPUT} flex-1`}
                        value={s.name}
                        onChange={(e) => patch({ sections: [{ id: s.id, name: e.target.value }] })}
                        spellCheck={false}
                      />
                      <span className="font-mono text-[10px] text-white/30">&lt;{s.tagName}&gt;</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-white/40">level</span>
                      <select
                        className={`${INPUT} flex-1`}
                        value={s.level}
                        onChange={(e) =>
                          patch({ sections: [{ id: s.id, level: Number(e.target.value) }] })
                        }
                      >
                        {LEVELS.map((label, lv) => (
                          <option key={lv} value={lv}>
                            {lv} · {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {s.colors.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {s.colors.slice(0, 6).map((c) => (
                          <span
                            key={c}
                            className="h-3.5 w-3.5 rounded ring-1 ring-white/20"
                            style={{ background: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "palette" && plan && (
            <div className={`${CARD} flex flex-col gap-2`}>
              <p className={SUBHEAD}>Role tokens · seeded from observed colors</p>
              {plan.tokens
                .filter((t) => t.salient)
                .map((t) => (
                  <div
                    key={t.role}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/10"
                    onMouseEnter={() => post({ type: "highlight-color", value: t.value })}
                    onMouseLeave={() => post({ type: "clear" })}
                  >
                    <span
                      className="h-6 w-6 rounded ring-1 ring-white/20"
                      style={{ background: t.value }}
                    />
                    <div className="flex-1">
                      <p className="font-mono text-[11px] text-white/70">{t.role}</p>
                      <p className="font-mono text-[10px] text-white/30">{t.value}</p>
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-white/50">
                      <input
                        type="checkbox"
                        checked={t.locked}
                        onChange={(e) => patch({ tokens: [{ role: t.role, locked: e.target.checked }] })}
                      />
                      lock
                    </label>
                  </div>
                ))}
              {plan.fonts.length > 0 && (
                <>
                  <p className={`${SUBHEAD} mt-2`}>Fonts</p>
                  {plan.fonts.map((f) => (
                    <div
                      key={f.family}
                      className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2 text-xs ring-1 ring-white/10"
                      onMouseEnter={() => post({ type: "highlight-font", family: f.family })}
                      onMouseLeave={() => post({ type: "clear" })}
                    >
                      <span style={{ fontFamily: f.family }} className="text-white/80">
                        {f.family}
                      </span>
                      <span className="font-mono text-[10px] text-white/30">{f.role}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "api" && plan && (
            <div className={`${CARD} flex flex-col gap-1.5`}>
              <p className={SUBHEAD}>Detected endpoints · logic plane (read-only)</p>
              {plan.endpoints.length === 0 && <p className={HINT}>No API endpoints detected.</p>}
              {plan.endpoints.map((e) => (
                <div
                  key={`${e.method} ${e.path}`}
                  className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2 text-xs ring-1 ring-white/10"
                >
                  <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-emerald-300">
                    {e.method}
                  </span>
                  <span className="font-mono text-[11px] text-white/70">{e.path}</span>
                </div>
              ))}
              <p className="mt-1 text-[11px] text-white/40">
                Endpoints are registered in the manifest now; field-level invariants and
                business-logic mods are configured later in Invariants / authoring.
              </p>
            </div>
          )}

          {plan && plan.warnings.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-200 ring-1 ring-amber-500/30">
              {plan.warnings.map((w, i) => (
                <p key={i}>· {w}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <div className={ERROR}>{error}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Invariants — code-defined data contracts (read-only) + editable     */
/* look-invariants (the design-config the design plane merges)          */
/* ------------------------------------------------------------------ */

function InvariantsView({ appId }: { appId: string }) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [designConfig, setDesignConfig] = useState<DesignConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, dc] = await Promise.all([
        api.manifest(appId).catch(() => null),
        api.designConfig(appId),
      ]);
      setManifest(m);
      setDesignConfig(dc);
      setError(null);
    } catch (err) {
      setError(`Cannot reach the control plane (${(err as Error).message})`);
    }
  }, [appId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const policies = manifest?.policies ?? [];
  const baseLevels: Record<string, number> = Object.fromEntries(
    (manifest?.designSurface?.pages ?? []).map((p) => [p.route, p.defaultLevel])
  );
  const sections = manifest?.designSurface?.sections ?? [];

  return (
    <div className="flex flex-col gap-6">
      {error && <div className={ERROR}>{error}</div>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        <section className={CARD}>
          <h2 className={H2}>Code-defined contracts</h2>
          <p className={`mt-1 ${HINT}`}>
            Declared in your codebase and enforced by the verifier and runtime —{" "}
            <span className="text-white/80">not editable here</span>. Want to prove they hold?{" "}
            <a className={BTN_LINK} href="#/guardrails">
              Test that these hold →
            </a>
          </p>
          {manifest ? (
            policies.length === 0 ? (
              <p className={`mt-3 ${HINT}`}>No policies declared in the manifest.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2 text-sm text-white/70">
                {policies.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5">
                    <code className={CODE}>{p.id}</code>
                    <span className="text-white/60">{p.description ?? describePolicy(p)}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className={`mt-3 ${HINT}`}>No manifest published for this app yet.</p>
          )}
        </section>

        <div className="flex flex-col gap-3">
          <p className={SUBHEAD}>Editable look-invariants</p>
          {designConfig ? (
            <LockControls
              overlay={designConfig}
              baseLevels={baseLevels}
              currentAccent={null}
              sections={sections}
              onSave={(c) => api.putDesignConfig(appId, c).then(() => refresh())}
            />
          ) : (
            <div className={CARD}>
              <p className={HINT}>Loading look-invariants…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Themes — per-user theme version history + append-only rollback       */
/* (ported from Nebula's /dev, app-agnostic: no design-plane runtime)   */
/* ------------------------------------------------------------------ */

function ThemesView({ appId, initialUser }: { appId: string; initialUser?: string | null }) {
  const [timelines, setTimelines] = useState<ThemeTimeline[]>([]);
  const [selectedUser, setSelectedUser] = useState(initialUser ?? "");
  const [entries, setEntries] = useState<ThemeVersionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);

  // Timelines + the user selector. The chosen user self-heals: keep it if it's
  // still a valid timeline (survives a nonce-bump refresh), else prefer the
  // deep-linked user (#/themes/<id>), else default to the first (covers initial
  // load and an appId switch to a different app's users).
  useEffect(() => {
    let active = true;
    api
      .themeTimelines(appId)
      .then((tls) => {
        if (!active) return;
        setTimelines(tls);
        setSelectedUser((prev) => {
          if (tls.some((t) => t.userId === prev)) return prev;
          if (initialUser && tls.some((t) => t.userId === initialUser)) return initialUser;
          return tls[0]?.userId ?? "";
        });
        setError(null);
      })
      .catch((err) => {
        if (active) setError(`Cannot reach the control plane (${(err as Error).message})`);
      });
    return () => {
      active = false;
    };
  }, [appId, nonce, initialUser]);

  // Entries for the selected user. Empty selection → no fetch, just clear.
  useEffect(() => {
    if (!selectedUser) {
      setEntries([]);
      return;
    }
    let active = true;
    api
      .themeHistory(appId, selectedUser)
      .then((ents) => {
        if (active) setEntries(ents);
      })
      .catch((err) => {
        if (active) setError(`Cannot reach the control plane (${(err as Error).message})`);
      });
    return () => {
      active = false;
    };
  }, [appId, selectedUser, nonce]);

  // Append-only: a rollback writes a NEW version. The Console does not apply the
  // theme live (no design-plane runtime here) — Nebula picks it up on its next
  // load. We record it, then bump the nonce to refetch timelines + entries.
  const handleRollback = async (entry: ThemeVersionEntry) => {
    try {
      await api.rollbackTheme(appId, selectedUser, entry.seq);
      setNonce((n) => n + 1);
      setError(null);
    } catch (err) {
      setError(`Rollback failed (${(err as Error).message})`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <div className={ERROR}>{error}</div>}

      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={H2}>Theme history</h2>
            <p className={`mt-1 ${HINT}`}>
              Every theme your users apply, versioned with the prompt that produced it.
              Roll back to restore a prior version on their next load.
            </p>
          </div>
          {timelines.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-white/50">
                User
                <select
                  className={INPUT}
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  {timelines.map((t) => (
                    <option key={t.userId} value={t.userId}>
                      {t.userId} ({t.count}) · {new Date(t.latestAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
              <button className={BTN_SECONDARY} onClick={() => setNonce((n) => n + 1)}>
                Refresh
              </button>
            </div>
          )}
        </div>

        {timelines.length === 0 ? (
          <p className={`mt-4 ${HINT}`}>No themed users yet for this app.</p>
        ) : (
          <div className="mt-4">
            <VersionTimeline entries={entries} onRollback={handleRollback} />
          </div>
        )}
      </section>
    </div>
  );
}

function Dashboard({
  appId,
  onOpenSubject,
  onOpenThemeUser,
}: {
  appId: string;
  onOpenSubject: (s: string) => void;
  onOpenThemeUser: (s: string) => void;
}) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [themes, setThemes] = useState<ThemeTimeline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [modsQuery, setModsQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [m, s, list, tls] = await Promise.all([
        api.manifest(appId).catch(() => null),
        api.summary(appId),
        api.mods(appId),
        // Theme restyles live in their own (design-plane) store, not the mod
        // registry — fetch them so the dashboard shows them too. Fail-soft: a
        // themes-store hiccup must not blank the whole dashboard.
        api.themeTimelines(appId).catch(() => [] as ThemeTimeline[]),
      ]);
      setManifest(m);
      setSummary(s);
      setMods(list);
      setThemes(tls);
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
            <SummaryPanel summary={summary} onFilter={setModsQuery} themedUsers={themes.length} />
          ) : (
            <p className={`mt-3 ${HINT}`}>No data yet.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={H2}>
            Your users&rsquo; customizations{" "}
            <span className="text-white/40">({mods.length + themes.length})</span>
          </h2>
          <p className={`mt-1 ${HINT}`}>
            Every change a user has made — logic mods and look &amp; feel restyles — newest first.
            Click a user for the full story, or kill anything that shouldn&rsquo;t be live.
          </p>
          <CustomizationsTable
            mods={mods}
            themes={themes}
            query={modsQuery}
            onQuery={setModsQuery}
            onAct={act}
            onOpenSubject={onOpenSubject}
            onOpenThemeUser={onOpenThemeUser}
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
  themedUsers,
}: {
  summary: AnalyticsSummary;
  onFilter: (query: string) => void;
  themedUsers: number;
}) {
  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="customizations" value={summary.mods.total} />
        <Stat label="live now" value={summary.mods.byStatus["active"] ?? 0} />
        <Stat
          label="themed users"
          value={themedUsers}
          help="Users who have restyled the look & feel through the design plane."
        />
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

function themeMatches(t: ThemeTimeline, q: string): boolean {
  return (
    t.userId.toLowerCase().includes(q) ||
    (t.latestPrompt?.toLowerCase().includes(q) ?? false) ||
    (t.latestSource?.includes(q) ?? false) ||
    "theme".includes(q) ||
    "look & feel".includes(q)
  );
}

/**
 * A customization is either a registry mod (logic/UI bundle) or a design-plane
 * theme restyle. They live in different stores but are one thing to a developer
 * — "what did this user change?" — so the dashboard merges them into one table,
 * newest-first, tagged by kind. `at` is the common sort key (ISO timestamps).
 */
type CustomizationRow =
  | { kind: "mod"; at: string; mod: ModRow }
  | { kind: "theme"; at: string; theme: ThemeTimeline };

function CustomizationsTable({
  mods,
  themes,
  query,
  onQuery,
  onAct,
  onOpenSubject,
  onOpenThemeUser,
}: {
  mods: ModRow[];
  themes: ThemeTimeline[];
  query: string;
  onQuery: (q: string) => void;
  onAct: (action: "kill" | "restore", modId: string) => Promise<void>;
  onOpenSubject: (subjectId: string) => void;
  onOpenThemeUser: (userId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = useMemo<CustomizationRow[]>(() => {
    const q = query.trim().toLowerCase();
    // showHistory is mod-only (superseded revisions); themes always show latest.
    const modRows: CustomizationRow[] = (
      showHistory ? mods : mods.filter((m) => m.status !== "superseded")
    )
      .filter((m) => !q || modMatches(m, q))
      .map((m) => ({ kind: "mod", at: m.createdAt, mod: m }));
    const themeRows: CustomizationRow[] = themes
      .filter((t) => !q || themeMatches(t, q))
      .map((t) => ({ kind: "theme", at: t.latestAt, theme: t }));
    return [...modRows, ...themeRows].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [mods, themes, query, showHistory]);

  if (mods.length === 0 && themes.length === 0) {
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
        {mods.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            include replaced revisions
          </label>
        )}
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
                title="Each new request replaces the previous revision (mods) / appends a new version (themes)."
              >
                rev
              </th>
              <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40">
                status
              </th>
              <th
                className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40"
                title="What this customization touches: style properties, CSS rules, UI areas, API hooks, or a whole-theme restyle."
              >
                what it changes
              </th>
              <th
                className="border-b border-white/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-white/40"
                title="The app version this mod was verified against. Themes aren't manifest-bound."
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
            {visible.map((row) =>
              row.kind === "mod" ? (
                <ModRowView
                  key={row.mod.modId}
                  mod={row.mod}
                  onAct={onAct}
                  onOpenSubject={onOpenSubject}
                />
              ) : (
                <ThemeRowView
                  key={`theme:${row.theme.userId}`}
                  theme={row.theme}
                  onOpenThemeUser={onOpenThemeUser}
                />
              ),
            )}
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
          No customizations match “{query}”.{" "}
          <button className={BTN_LINK} onClick={() => onQuery("")}>
            Clear
          </button>
        </p>
      )}
    </div>
  );
}

const TD = "border-b border-white/5 px-3 py-3 align-top text-sm text-white/70";

function ModRowView({
  mod,
  onAct,
  onOpenSubject,
}: {
  mod: ModRow;
  onAct: (action: "kill" | "restore", modId: string) => Promise<void>;
  onOpenSubject: (subjectId: string) => void;
}) {
  return (
    <tr
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
      <td className={TD}>{mod.revision}</td>
      <td className="border-b border-white/5 px-3 py-3 align-top">
        <StatusChip status={mod.status} />
        {mod.status === "degraded" && mod.reasons.length > 0 && (
          <div className="mt-1 text-xs text-red-300">{mod.reasons.join("; ")}</div>
        )}
      </td>
      <td className={TD}>{mod.classification ? surfacesLabel(mod.classification.surfaces) : "—"}</td>
      <td className={TD}>v{mod.boundManifestVersion}</td>
      <td className={`max-w-[260px] ${TD}`}>
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
  );
}

function ThemeRowView({
  theme,
  onOpenThemeUser,
}: {
  theme: ThemeTimeline;
  onOpenThemeUser: (userId: string) => void;
}) {
  return (
    <tr className="transition-colors hover:bg-white/[0.02]">
      <td className="border-b border-white/5 px-3 py-3 align-top">
        <button
          className={BTN_LINK}
          title="Open this user's theme history"
          onClick={() => onOpenThemeUser(theme.userId)}
        >
          {theme.userId}
        </button>
      </td>
      <td className={TD}>{theme.count}</td>
      <td className="border-b border-white/5 px-3 py-3 align-top">
        <span
          className="inline-block whitespace-nowrap rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs text-violet-300 ring-1 ring-violet-500/30"
          title="A look & feel restyle (design plane). Applied on the user's next load; roll back from the Themes view."
        >
          theme
        </span>
      </td>
      <td className={TD}>look &amp; feel</td>
      <td className={`${TD} text-white/40`} title="Themes aren't bound to a manifest version.">
        —
      </td>
      <td className={`max-w-[260px] ${TD}`}>{themeRequestLabel(theme)}</td>
      <td className="border-b border-white/5 px-3 py-3 align-top">
        <button className={BTN_SECONDARY} onClick={() => onOpenThemeUser(theme.userId)}>
          History
        </button>
      </td>
    </tr>
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

/** A pack/rollback version carries no prompt; describe it from its source instead. */
function themeRequestLabel(t: ThemeTimeline): React.ReactNode {
  if (t.latestPrompt) return `“${t.latestPrompt}”`;
  if (t.latestSource === "pack") return <span className="text-white/40">applied a preset theme</span>;
  if (t.latestSource === "rollback") return <span className="text-white/40">rolled back to a prior version</span>;
  return <span className="text-white/40">restyled the look &amp; feel</span>;
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
