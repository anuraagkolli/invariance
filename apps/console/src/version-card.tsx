import { useMemo, useState } from "react";

import type { ThemeVersionEntry } from "./api";
import { COLOR_RE, diffTokenMaps, sectionsChanged, tokenMap } from "./theme-diff";
import { TokenDiff } from "./token-diff";
import { styleSpecOf, summarizeStyleSpec } from "./style-summary";

// One entry on the theme timeline: a provenance header, an app-agnostic palette
// strip (the version's color tokens as swatches — no app coupling), the token
// diff vs the previous version, and a rollback action. Fixed-neutral styling on
// purpose — the Console must not repaint with user themes.

const SOURCE_BADGE: Record<string, string> = {
  pipeline: "bg-sky-500/15 text-sky-300",
  pack: "bg-violet-500/15 text-violet-300",
  rollback: "bg-amber-500/15 text-amber-300",
};

interface VersionCardProps {
  entry: ThemeVersionEntry;
  previous: ThemeVersionEntry | null;
  isLatest: boolean;
  onRollback: (entry: ThemeVersionEntry) => Promise<void>;
}

export function VersionCard({ entry, previous, isLatest, onRollback }: VersionCardProps) {
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const diff = useMemo(
    () => diffTokenMaps(previous?.theme ?? null, entry.theme),
    [previous, entry.theme],
  );
  const sections = useMemo(
    () => sectionsChanged(previous?.theme ?? null, entry.theme),
    [previous, entry.theme],
  );

  // App-agnostic preview: de-duplicated color tokens, capped, rendered as a
  // swatch strip — no app-specific live render here.
  const palette = useMemo(() => {
    const vars = tokenMap(entry.theme);
    const seen = new Set<string>();
    const colors: string[] = [];
    for (const value of Object.values(vars)) {
      if (!COLOR_RE.test(value) || seen.has(value)) continue;
      seen.add(value);
      colors.push(value);
      if (colors.length >= 10) break;
    }
    return colors;
  }, [entry.theme]);

  // The theme's design intent (mode/accent/contrast/…) read from its StyleSpec —
  // what the user asked for, not the compiled token values.
  const intent = useMemo(() => {
    const spec = styleSpecOf(entry.theme);
    return spec ? summarizeStyleSpec(spec) : null;
  }, [entry.theme]);

  const source = entry.meta?.source;
  // A first entry diffs against nothing — collapse the wall of "added" rows.
  const collapseAsInitial = previous === null && diff.length > 6;

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {entry.meta?.prompt ? `“${entry.meta.prompt}”` : "(no prompt recorded)"}
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {entry.meta?.description ?? "—"}
          </p>
          {intent && (
            <p className="mt-1 truncate text-[11px] text-emerald-300/80" title={intent}>
              {intent}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {source ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[source] ?? "bg-white/10 text-white/60"}`}>
              {source}
            </span>
          ) : null}
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
            v{entry.seq}
          </span>
        </div>
      </header>

      {palette.length > 0 ? (
        <div className="flex gap-1 overflow-hidden rounded-lg ring-1 ring-white/10">
          {palette.map((value) => (
            <span
              key={value}
              aria-hidden
              title={value}
              className="h-6 flex-1 rounded"
              style={{ backgroundColor: value }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/30">no color palette in this version</p>
      )}

      <div className="min-w-0">
        {sections.length > 0 ? (
          <p className="mb-1.5 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
            {sections.join(" + ")} changed
          </p>
        ) : null}
        {collapseAsInitial && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
          >
            {diff.length} tokens set — show all
          </button>
        ) : (
          <TokenDiff entries={diff} />
        )}
      </div>

      <footer className="flex items-center justify-between text-xs text-white/40">
        <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>
        {!isLatest ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onRollback(entry).finally(() => setBusy(false));
            }}
            className="rounded-md bg-white/10 px-2.5 py-1 font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            {busy ? "Rolling back…" : `Roll back to v${entry.seq}`}
          </button>
        ) : (
          <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">live</span>
        )}
      </footer>
    </article>
  );
}
