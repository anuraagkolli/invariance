// apps/control-plane/src/theming/delivery/bootstrap-mode.ts
//
// Client bootstrap (spec §7.2): the cookie carries a RESOLVED mode. On first paint for a "system"
// user the server rendered manifest.modes.default; this resolves prefers-color-scheme to a concrete
// Mode, and if it differs from the server default, persists the cookie + swaps. The flash is bounded
// to a single light↔dark swap of an already-tenant-themed page. No-op when nothing differs or when
// matchMedia is unavailable.

import type { Mode } from "@invariance/theming";

export const MODE_COOKIE = "iv-theme-mode";

// Minimal structural DOM surface this file needs. Declaring locally keeps DOM types file-scoped —
// no program-global DOM lib leak. A real browser Document/Window is structurally assignable.
interface MediaQueryResult {
  matches: boolean;
}
interface BootstrapView {
  matchMedia?: (query: string) => MediaQueryResult;
}
interface BootstrapDocument {
  defaultView: BootstrapView | null;
  cookie: string;
}

export function bootstrapMode(args: { doc: BootstrapDocument; defaultMode: Mode }): void {
  const { doc, defaultMode } = args;
  const view = doc.defaultView;
  if (!view || typeof view.matchMedia !== "function") return; // cannot resolve system → concrete

  const prefersDark = view.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved: Mode = prefersDark ? "dark" : "light";
  if (resolved === defaultMode) return; // already correct — no swap, no write

  // Persist the resolved mode so subsequent SSR renders are deterministic and flash-free.
  doc.cookie = `${MODE_COOKIE}=${resolved}; path=/; max-age=31536000; samesite=lax`;
}
