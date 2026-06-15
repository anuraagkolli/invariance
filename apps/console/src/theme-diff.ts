// Pure diff helpers for the theme version timeline: which tokens a version
// changed relative to its predecessor, and which page-keyed sections moved.
//
// App-agnostic on purpose — these operate on a structural view of the theme
// doc (its .theme.roles/.theme.slots, .content, .layout, .components) without
// importing the design plane.

export type ThemeDoc = Record<string, unknown>;

export const COLOR_RE = /^(#|oklch|rgb|hsl)/;

export interface TokenDiffEntry {
  token: string;
  before: string | null;
  after: string | null;
}

// Flat token view of a doc: roles with slots layered on top, mirroring the
// runtime cascade (slot literals override role values on :root). v1 docs (or
// anything without flat string values) contribute nothing.
export function tokenMap(theme: ThemeDoc | null): Record<string, string> {
  if (!theme || !theme.theme) return {};
  const section = theme.theme as { roles?: unknown; slots?: unknown };
  const out: Record<string, string> = {};
  for (const part of [section.roles, section.slots]) {
    if (!part || typeof part !== "object") continue;
    for (const [token, value] of Object.entries(part as Record<string, unknown>)) {
      if (typeof value === "string") out[token] = value;
    }
  }
  return out;
}

export function diffTokenMaps(prev: ThemeDoc | null, next: ThemeDoc | null): TokenDiffEntry[] {
  const before = tokenMap(prev);
  const after = tokenMap(next);
  const tokens = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return tokens
    .filter((t) => before[t] !== after[t])
    .map((t) => ({ token: t, before: before[t] ?? null, after: after[t] ?? null }));
}

// Which of the page-keyed sections (F2/F3/F4 output) differ between versions.
export function sectionsChanged(prev: ThemeDoc | null, next: ThemeDoc | null): string[] {
  const sections = ["content", "layout", "components"] as const;
  return sections.filter(
    (key) => JSON.stringify(prev?.[key]) !== JSON.stringify(next?.[key]),
  );
}
