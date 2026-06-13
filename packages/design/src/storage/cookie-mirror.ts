import type { AnyThemeJson } from '../config/types'
import { canonicalStringify } from '../utils/canonical-json'

// ~4KB is the per-cookie byte ceiling across browsers. Stay well under it so the
// theme cookie can coexist with the app's own cookies without eviction.
const MAX_COOKIE_BYTES = 3800

// Mirror the current theme into a cookie so the SSR helper can render a themed
// :root block on first paint. The cookie is a MIRROR, not the source of truth:
// the storage backend (localStorage / api) remains canonical, and the client
// re-applies from it after load. If the encoded doc would blow the cookie size
// budget we skip the mirror entirely — first paint falls back to base styling,
// and the client applies the full theme a frame later (no error, no flash of
// a partial theme).
export function mirrorThemeCookie(appId: string, theme: AnyThemeJson): void {
  // SSR-guarded: document is undefined on the server, where there is no cookie
  // jar to write to (the server READS the request's cookie via themeFromCookieHeader).
  if (typeof document === 'undefined') return

  const encoded = encodeURIComponent(canonicalStringify(theme))
  const name = `invariance-theme-${appId}`
  // Budget the name=value pair, the part that actually counts against the limit.
  const byteLength = new TextEncoder().encode(`${name}=${encoded}`).length
  if (byteLength > MAX_COOKIE_BYTES) {
    console.warn(
      `[invariance] theme cookie (${byteLength} bytes) exceeds ${MAX_COOKIE_BYTES}; ` +
        'skipping SSR mirror — first paint falls back to base styling, client applies after load.',
    )
    return
  }

  // max-age one year; path=/ so every route sees it; SameSite=Lax is enough for
  // a same-site first-paint mirror and avoids the third-party cookie warnings.
  document.cookie = `${name}=${encoded}; path=/; max-age=31536000; SameSite=Lax`
}
