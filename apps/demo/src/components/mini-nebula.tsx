'use client'

// A PRESENTATIONAL, compact slice of the Nebula app for the /showcase vibe-wall.
//
// Why token-only (no m.slot/m.text/Invariance primitives): the showcase themes
// each card by setting --inv-* custom properties on a WRAPPER element, not on
// :root. The primitives couple to the single global theme context (one store,
// one :root), so they cannot render ten independent themes on one page. Plain
// JSX that reads the role tokens via Tailwind utilities (bg-surface1, text-accent,
// font-display, ...) inherits whatever --inv-* the ancestor wrapper sets — which
// is exactly the cascade the showcase relies on.

// Three poster hues, fixed so each card's content is identical and only the
// THEME differs between cards (the whole point of the wall).
const POSTER_HUES = [28, 205, 320, 96] as const
// One fixed hero hue so the hero backdrop is constant across cards too.
const HERO_HUE = 252

// Diagonal gradient poster from a hue, mirroring TitleCard.posterStyle but
// compact. Alpha must live INSIDE hsl() — `hsl(...)55` is invalid CSS and the
// browser drops the whole backgroundImage.
function miniPosterStyle(hue: number): React.CSSProperties {
  const top = `hsl(${hue} 55% 38%)`
  const bottom = `hsl(${(hue + 40) % 360} 60% 18%)`
  const glow = `hsl(${hue} 70% 62% / 0.33)`
  return {
    backgroundImage: [
      `radial-gradient(120% 80% at 75% 12%, ${glow} 0%, transparent 55%)`,
      `linear-gradient(160deg, ${top}, ${bottom})`,
    ].join(', '),
  }
}

// Hero backdrop washing the hero hue into the themed page surface, mirroring
// Hero.backdropStyle. surface-0 comes from the wrapper's --inv-surface-0, so the
// hero dissolves into whatever neutrals the card's theme compiled.
function miniBackdropStyle(hue: number): React.CSSProperties {
  const wash = `hsl(${hue} 52% 30%)`
  const glow = `hsl(${hue} 68% 55% / 0.25)`
  return {
    backgroundImage: [
      `radial-gradient(90% 120% at 78% 8%, ${glow} 0%, transparent 50%)`,
      `linear-gradient(105deg, ${wash} 0%, var(--inv-surface-0) 64%)`,
    ].join(', '),
  }
}

// A recognizable Nebula slice at ~1/3 scale: sidebar strip + hero + poster row.
// Every color/shape/type reads from the role tokens, so the card themes entirely
// from the --inv-* set on its ancestor.
export function MiniNebula() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-surface0 font-body text-textPrimary">
      {/* Sidebar strip: logo + three nav dots, consuming surface-1 like the real
          sidebar's --inv-sidebar-bg default. */}
      <aside className="flex w-14 shrink-0 flex-col items-center gap-3 bg-surface1 py-3">
        <span className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-textPrimary">
          Neb
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="h-1.5 w-1.5 rounded-full bg-textSecondary" />
        <span className="h-1.5 w-1.5 rounded-full bg-textSecondary" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Hero block: gradient backdrop from a fixed title hue, display title,
            and a Play accent button. */}
        <section
          className="relative flex flex-col gap-2 px-4 py-5"
          style={miniBackdropStyle(HERO_HUE)}
        >
          <span className="font-mono text-[8px] uppercase tracking-[0.28em] text-accent">
            Featured
          </span>
          <h2 className="font-display text-lg font-bold uppercase leading-none tracking-tight text-textPrimary">
            Nebula
          </h2>
          <div>
            <button
              type="button"
              className="rounded-base bg-accent px-3 py-1 text-[10px] font-semibold text-accentContrast shadow-inv1"
            >
              ▶ Play
            </button>
          </div>
        </section>

        {/* One row of compact gradient poster cards. */}
        <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-textPrimary">
            Trending
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {POSTER_HUES.map((hue) => (
              <div
                key={hue}
                className="aspect-[2/3] overflow-hidden rounded-lg2 shadow-inv1 ring-1 ring-inset ring-border/40"
                style={miniPosterStyle(hue)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
