// Visual-QA harness: the ten-vibe gauntlet as a runnable regression net.
//
// Assumes the demo is already running (the pnpm `visual-qa:full` wrapper boots
// it; CI starts `next start` first). Pass a base URL as the first arg, default
// http://localhost:4321.
//
// For each scene (default, the ten packs, ?sidebar=blue, ?demo=overrides) it
// navigates, waits for the gauntlet's [data-gauntlet-ready] signal, screenshots
// to visual-qa-output/, then runs deterministic assertions:
//   (a) the ten pack accents (--inv-accent) are mutually distinct (ΔE-OK in
//       OKLab — no two within a small threshold),
//   (b) per pack, --inv-text-primary on --inv-surface-1 meets WCAG AA (>= 4.5),
//   (c) per pack, the font-display pairing's Google Fonts <link> is in the doc.
// Prints a PASS/FAIL table and exits nonzero on ANY violation.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { wcagContrast, differenceEuclidean, converter } from 'culori'

// Pull the canonical pack list + their font pairings straight from the package
// so this harness never drifts from the registry it is meant to guard.
import { THEME_PACKS, getFontPairing } from 'invariance'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'visual-qa-output')

const BASE_URL = process.argv[2] ?? 'http://localhost:4321'

// Canonical gauntlet order (matches gauntlet/page.tsx PACK_IDS).
const PACK_IDS = [
  'retro-arcade',
  'neobrutalist',
  'soft-pastel',
  'terminal-green',
  'glass-dark',
  'editorial',
  'ocean',
  'sunset',
  'mono',
  'corporate-trust',
]

// OKLab ΔE threshold below which two accents count as the SAME color — the
// regression this guards is two packs collapsing onto a near-identical accent,
// not arbitrary maximal spread. The just-noticeable difference in OKLab is
// ~0.02, so 0.03 flags genuine duplication while passing honestly-distinct
// packs. The project's canonical pack-distinctness rule (design-taste skill) is
// "no two packs share BOTH fontPairing AND accentHue within 30°"; the closest
// real pair (glass-dark/ocean, ΔE 0.040) differs in font AND mode, so it is
// distinct by that rule and clears this floor.
const ACCENT_MIN_DELTA_E = 0.03
const AA_CONTRAST = 4.5

const oklab = converter('oklab')
const toOklch = converter('oklch')
const deltaE = differenceEuclidean('oklab')

// OKLCH chroma of a CSS color string (the saturation axis). Used by the
// chroma-cap recompile scene to prove a tightened cap measurably desaturates an
// applied accent. Returns 0 for colors culori can't parse (achromatic fallback).
function chromaOf(color) {
  const c = toOklch(color)
  return c && typeof c.c === 'number' ? c.c : 0
}

// Trim + lowercase so '#1166FF' and ' #1166ff ' compare equal — getComputedStyle
// can echo a token's case/whitespace verbatim.
function normHex(value) {
  return String(value ?? '').trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Dev-config (developer invariant overlay) helpers
// ---------------------------------------------------------------------------

// PUT the overlay to the SAME server the pages load from, so the SSR layout's
// readDevConfig() (which feeds the client provider's reconcile config) sees it.
// Node fetch to BASE_URL is the simplest same-origin write.
async function putDevConfig(overlay) {
  const res = await fetch(`${BASE_URL}/api/dev-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overlay),
  })
  if (!res.ok) throw new Error(`PUT /api/dev-config failed: ${res.status}`)
  return res.json()
}

// Read the role values + the document's font <link> hrefs from a loaded page.
async function readScene(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (l) => l.getAttribute('href') ?? '',
    )
    // The rendered sidebar: the gauntlet draws HomeScreen→Shell→Sidebar, whose
    // <aside> is `hidden lg:flex` — visible at the harness's 1280px viewport, so
    // its measured width proves the demo CONSUMES --inv-sidebar-w (not just that
    // :root holds the token). null if no aside is on the page.
    const aside = document.querySelector('aside')
    return {
      accent: cs.getPropertyValue('--inv-accent').trim(),
      textPrimary: cs.getPropertyValue('--inv-text-primary').trim(),
      surface1: cs.getPropertyValue('--inv-surface-1').trim(),
      // Structural tokens: layout geometry + typography treatment that vary by
      // the pack's framing/typography fields. These changing across packs is the
      // Workstream A proof — themes restructure the layout, not just recolor.
      sidebarW: cs.getPropertyValue('--inv-sidebar-w').trim(),
      displayTransform: cs.getPropertyValue('--inv-display-transform').trim(),
      renderedSidebarW: aside ? aside.getBoundingClientRect().width : null,
      links,
    }
  })
}

async function gotoScene(page, path, name) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
  // The gauntlet sets data-gauntlet-ready="true" once tokens are applied.
  await page.waitForSelector('[data-gauntlet-ready="true"]', { timeout: 15000 })
  await page.screenshot({ path: join(OUTPUT_DIR, `${name}.png`), fullPage: true })
}

// The first Google-Fonts family token from a pairing's display stack, formatted
// the way fonts/loader.ts encodes it into the css2 href (spaces → '+'). Returns
// null for pure-system pairings (no link expected, e.g. a system-only display).
function displayFontParam(pairingId) {
  const pairing = getFontPairing(pairingId)
  if (!pairing) return null
  const match = pairing.display.match(/['"]([^'"]+)['"]/)
  if (!match) return null
  const name = match[1]
  const system = new Set([
    'inter',
    'system-ui',
    'ui-monospace',
    'sf mono',
    'monospace',
    'sans-serif',
    'serif',
  ])
  if (system.has(name.toLowerCase())) return null
  return name.replace(/ /g, '+')
}

// ---------------------------------------------------------------------------
// Panel-pack scene helpers
// ---------------------------------------------------------------------------

// The demo persists themes SERVER-SIDE via storage="api" (storageUrl=/api/themes
// → file-backed theme-history-store), NOT localStorage — so the stored-theme
// check queries the API the provider actually loads from. appId/userId match the
// provider's (appId='nebula-demo', userId='demo-user').
const DEMO_APP_ID = 'nebula-demo'
const DEMO_USER_ID = 'demo-user'
// Legacy localStorage key (provider would use this only under storage:'localStorage').
// Cleared defensively before recompile scenes; harmless under api storage.
const THEME_STORAGE_KEY = `invariance:${DEMO_APP_ID}:${DEMO_USER_ID}`

// Fetch the latest stored theme doc from the demo's server store. 404 → null.
async function loadStoredTheme() {
  const res = await fetch(
    `${BASE_URL}/api/themes?userId=${encodeURIComponent(DEMO_USER_ID)}&appId=${encodeURIComponent(DEMO_APP_ID)}`,
  )
  if (!res.ok) return null
  return res.json()
}

// True when a v2 theme doc has a roles map with at least one token.
function isStoredV2ThemeWithRoles(parsed) {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    parsed.version === 2 &&
    parsed.theme &&
    typeof parsed.theme.roles === 'object' &&
    Object.keys(parsed.theme.roles).length > 0
  )
}

// Open the customization panel and wait for its dialog. Trigger has
// aria-label="Open customization panel"; dialog is role=dialog with that label.
async function openPanel(page) {
  const trigger = page.getByRole('button', { name: 'Open customization panel' })
  await trigger.click()
  await page.waitForSelector('[role="dialog"][aria-label="Customization panel"]', { timeout: 5000 })
}

// Click a pack chip (data-inv-pack={id}) and wait for applyPack to settle (the
// chip re-enables once isThinking clears). Throws if the chip is absent so a
// filtered/missing chip surfaces loudly rather than passing vacuously.
async function clickPackChip(page, packId) {
  const chipSelector = `[data-inv-pack="${packId}"]`
  const chip = await page.$(chipSelector)
  if (!chip) {
    throw new Error(`Panel chip for pack "${packId}" (${chipSelector}) not found — check availablePacks filter or panel markup`)
  }
  await chip.click()
  // applyPack is async (compile → verify → persist). The chip re-enabling is the
  // most reliable settle signal.
  await page
    .waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel)
        return btn && !btn.disabled
      },
      chipSelector,
      { timeout: 8000 },
    )
    .catch(() => {
      console.warn('[visual-qa] chip re-enable wait timed out for', packId)
    })
}

// Open the panel (if needed) and apply a pack via the real applyPack gate. Reads
// the applied --inv-accent after the click. Used by both the panel-pack scene and
// the live-recompile scenes to seed a v2 theme + saturated accent into storage.
async function applyPackViaPanel(page, packId, { panelAlreadyOpen = false } = {}) {
  if (!panelAlreadyOpen) await openPanel(page)
  await clickPackChip(page, packId)
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-accent').trim(),
  )
}

// Click a pack chip in the panel and assert:
//   (a) --inv-accent on :root changed from the baseAccent before the click
//   (b) the server store holds a valid v2 theme with roles (api persistence)
async function clickPackChipAndAssert(page, packId, packName, baseAccent, outputDir) {
  const newAccent = await applyPackViaPanel(page, packId, { panelAlreadyOpen: true })

  // (b) server-side store holds a valid v2 theme with roles (applyPack persists
  // via storageBackend.saveTheme → PUT /api/themes).
  const stored = await loadStoredTheme()
  const storedOk = isStoredV2ThemeWithRoles(stored)

  const accentChanged = newAccent !== '' && newAccent !== baseAccent

  const slug = `panel-pack-${packId}`
  await page.screenshot({ path: `${outputDir}/${slug}.png`, fullPage: true })

  return { packId, packName, accentChanged, newAccent, storedOk, pass: accentChanged && storedOk }
}

// ---------------------------------------------------------------------------
// Panel-pack scene: navigate /, open panel, click 3 chips
// ---------------------------------------------------------------------------

async function runPanelPackScene(browser, outputDir, rows) {
  // Use a fresh page so localStorage is isolated from gauntlet pack scenes
  // (gauntlet uses applyAnyTheme directly, not applyPack; mixing the two would
  // make the "accent changed" assertion ambiguous).
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })

  // Clear any stored theme so the baseline accent is the true default.
  await page.evaluate((k) => localStorage.removeItem(k), THEME_STORAGE_KEY)

  // Reload so the provider starts from no stored theme.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })

  const baseAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-accent').trim(),
  )

  // Open the panel (getByRole on the aria-label — robust, not markup-coupled).
  await openPanel(page)

  // Screenshot panel open state before clicking any chip.
  await page.screenshot({ path: `${outputDir}/panel-open.png`, fullPage: true })

  // Three packs to click (subset of PACK_IDS; must be permitted by the demo's
  // config — font_registry:'default' and allowed_modes:['light','dark'] mean all
  // packs in the registry are available).
  const PANEL_PACKS = [
    { id: 'retro-arcade', name: 'Retro Arcade' },
    { id: 'ocean', name: 'Ocean' },
    { id: 'neobrutalist', name: 'Neobrutalist' },
  ]

  // Compare each pack against baseAccent (the pre-panel default) rather than a
  // rolling currentBase, so two consecutive packs with the same accent don't
  // produce a false negative — each pack only needs to differ from the default.
  for (const pack of PANEL_PACKS) {
    const result = await clickPackChipAndAssert(page, pack.id, pack.name, baseAccent, outputDir)
    rows.push({
      scene: `panel:${pack.id}`,
      accent: result.newAccent,
      contrast: '—',
      font: '—',
      pass: result.pass,
      accentChanged: result.accentChanged,
      storedOk: result.storedOk,
    })
    if (!result.pass) {
      console.error(
        `[panel-pack] FAIL ${pack.id}: accentChanged=${result.accentChanged} storedOk=${result.storedOk}`,
      )
    }
  }

  await page.close()
}

// ---------------------------------------------------------------------------
// Live-invariant recompile scenes (Workstream B proof)
// ---------------------------------------------------------------------------
//
// Prove a DEVELOPER invariant change live-re-themes an already-applied,
// now-violating theme via the provider's reconcile-keep-vibe path: on the next
// load the stored theme fails verifyV2 under the tightened config but carries a
// styleSpec, so it RECOMPILES from that spec under the new constraints (vibe
// kept, invariant honored).
//
// dev-config is a server-wide file. We PUT {} at the start (defensive: a stale
// lock from a crashed prior run would otherwise skew the gauntlet accents) and
// the whole block runs inside try/finally that ALWAYS resets it to {} — leaving
// a lock would corrupt later runs and the live demo.

// Seed a fresh vivid theme through the real panel applyPack gate, returning the
// applied accent. Resets dev-config to {} first so the seed compiles under the
// demo's TRUE base config (no lingering lock/cap from a prior sub-scene skewing
// the saturated seed the recompile then has to violate). Clears legacy
// localStorage (no-op under api storage) and reloads so the provider starts
// clean; the vivid pack becomes the latest stored theme the next reconcile loads.
async function seedVividTheme(page, packId) {
  await putDevConfig({})
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await page.evaluate((k) => localStorage.removeItem(k), THEME_STORAGE_KEY)
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  return applyPackViaPanel(page, packId)
}

// Sub-scene A — accent lock (the headline): lock the brand accent to a hex the
// applied theme doesn't use → reconcile recompiles → applied --inv-accent
// becomes the lock, vibe (styleSpec) preserved.
async function runAccentLockScene(browser, outputDir) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })
  const LOCK = '#1166ff'
  try {
    const before = await seedVividTheme(page, 'sunset')

    await putDevConfig({ accentLock: LOCK })

    // Reload: provider mount-load reconciles the stored vivid theme against the
    // now-locked config → recompiles → applied accent becomes the lock.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })

    let timedOut = false
    await page
      .waitForFunction(
        (lock) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--inv-accent')
            .trim()
            .toLowerCase() === lock,
        LOCK,
        { timeout: 10000 },
      )
      .catch(() => {
        timedOut = true
        console.warn('[live-lock] poll for locked accent timed out')
      })

    const after = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--inv-accent').trim(),
    )
    await page.screenshot({ path: `${outputDir}/live-accent-lock.png`, fullPage: true })

    // Vibe kept: stored theme still carries a styleSpec and its accent role is the lock.
    const stored = await loadStoredTheme()
    const styleSpecKept =
      stored && stored.theme && stored.theme.styleSpec !== undefined && stored.theme.styleSpec !== null
    const roleAccent = normHex(stored?.theme?.roles?.['--inv-accent'])

    const accentOk = !timedOut && normHex(after) === normHex(LOCK)
    const pass = accentOk && styleSpecKept && roleAccent === normHex(LOCK)

    return {
      scene: 'live:accent-lock',
      before,
      after,
      pass,
      accentOk,
      styleSpecKept,
      roleAccent,
      lock: LOCK,
    }
  } finally {
    await page.close()
  }
}

// Sub-scene B — chroma cap (constraint clamp): lower the chroma cap below the
// applied accent's saturation → reconcile recompiles under the cap → accent
// measurably desaturates (chromaAfter < chromaBefore − 0.03).
async function runChromaCapScene(browser, outputDir) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })
  const CAP = 0.1
  try {
    const beforeAccent = await seedVividTheme(page, 'retro-arcade')
    const chromaBefore = chromaOf(beforeAccent)

    await putDevConfig({ chromaCap: CAP })

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })

    // Poll until the accent CHANGES from the saturated seed (the recompile under
    // the lower cap desaturates it). Comparing the literal value is robust without
    // running culori inside the page.
    let timedOut = false
    await page
      .waitForFunction(
        (prev) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--inv-accent')
            .trim()
            .toLowerCase() !== prev,
        normHex(beforeAccent),
        { timeout: 10000 },
      )
      .catch(() => {
        timedOut = true
        console.warn('[live-chroma] poll for desaturated accent timed out')
      })

    const afterAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--inv-accent').trim(),
    )
    const chromaAfter = chromaOf(afterAccent)
    await page.screenshot({ path: `${outputDir}/live-chroma-cap.png`, fullPage: true })

    const pass = !timedOut && chromaAfter < chromaBefore - 0.03

    return {
      scene: 'live:chroma-cap',
      before: beforeAccent,
      after: afterAccent,
      chromaBefore,
      chromaAfter,
      cap: CAP,
      pass,
    }
  } finally {
    await page.close()
  }
}

// Run both recompile sub-scenes. ALWAYS resets dev-config to {} afterward (the
// file is server-wide; a lingering lock would corrupt later runs + the live demo).
async function runLiveInvariantScenes(browser, outputDir, rows) {
  let results = []
  try {
    results = [
      await runAccentLockScene(browser, outputDir),
      await runChromaCapScene(browser, outputDir),
    ]
  } finally {
    try {
      await putDevConfig({})
    } catch (e) {
      console.error('[visual-qa] FAILED to reset dev-config to {} —', e)
    }
  }

  for (const r of results) {
    if (r.scene === 'live:accent-lock') {
      rows.push({
        scene: r.scene,
        accent: r.after,
        contrast: '—',
        font: r.pass ? 'lock honored' : '—',
        pass: r.pass,
        diag: r,
      })
      if (!r.pass) {
        if (!r.accentOk) console.error(`[live-lock] --inv-accent is ${r.after}, expected ${r.lock}`)
        if (!r.styleSpecKept) console.error('[live-lock] stored theme lost its styleSpec (vibe not kept)')
        if (r.roleAccent !== normHex(r.lock))
          console.error(`[live-lock] stored roles['--inv-accent'] is ${r.roleAccent}, expected ${normHex(r.lock)}`)
      }
    } else {
      rows.push({
        scene: r.scene,
        accent: r.after,
        contrast: `c ${r.chromaAfter.toFixed(3)}`,
        font: `was ${r.chromaBefore.toFixed(3)}`,
        pass: r.pass,
        diag: r,
      })
      if (!r.pass) {
        console.error(
          `[live-chroma] chromaAfter=${r.chromaAfter.toFixed(3)} not < chromaBefore−0.03 (chromaBefore=${r.chromaBefore.toFixed(3)}, cap=${r.cap})`,
        )
      }
    }
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  // Defensive: clear any dev-config lock left by a crashed prior run BEFORE the
  // gauntlet, so a stale accent-lock/chroma-cap can't skew the pack accents the
  // distinctness assertion measures.
  try {
    await putDevConfig({})
  } catch (e) {
    console.warn('[visual-qa] could not reset dev-config at start:', e?.message ?? e)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })

  const rows = []
  const accentByPack = {}
  // Per-pack structural readings for the Workstream-A distinctness assertions.
  const structuralByPack = {}

  // --- non-pack scenes: capture-only (no per-pack assertion, but they must load) ---
  await gotoScene(page, '/gauntlet?pack=default', 'default')
  rows.push({ scene: 'default', accent: '—', contrast: '—', font: '—', pass: true })

  await gotoScene(page, '/gauntlet?sidebar=blue', 'sidebar-blue')
  rows.push({ scene: 'sidebar=blue', accent: '—', contrast: '—', font: '—', pass: true })

  await gotoScene(page, '/gauntlet?demo=overrides', 'demo-overrides')
  rows.push({ scene: 'demo=overrides', accent: '—', contrast: '—', font: '—', pass: true })

  // --- ten pack scenes: full assertions ---
  for (const id of PACK_IDS) {
    await gotoScene(page, `/gauntlet?pack=${id}`, id)
    const scene = await readScene(page)
    accentByPack[id] = scene.accent
    structuralByPack[id] = {
      sidebarW: scene.sidebarW,
      displayTransform: scene.displayTransform,
      renderedSidebarW: scene.renderedSidebarW,
    }

    // (b) AA contrast of text-primary on surface-1.
    const ratio = wcagContrast(scene.textPrimary, scene.surface1)
    const contrastOk = ratio !== undefined && ratio >= AA_CONTRAST

    // (c) font-display link present (skip the assertion only for system-only displays).
    const fontParam = displayFontParam(THEME_PACKS.find((p) => p.id === id).spec.fontPairing)
    const fontOk =
      fontParam === null || scene.links.some((href) => href.includes(`family=${fontParam}`))

    rows.push({
      scene: id,
      accent: scene.accent,
      contrast: ratio === undefined ? 'n/a' : ratio.toFixed(2),
      font: fontParam === null ? 'system' : fontParam,
      pass: contrastOk && fontOk,
      contrastOk,
      fontOk,
    })
  }

  // --- panel-pack scene: exercises the real applyPack gate (compile→verify→persist) ---
  // This scene navigates /, opens the CustomizationPanel, and clicks 3 pack
  // chips, asserting each application (a) changes --inv-accent on :root and
  // (b) persists a valid v2 theme to the server store (/api/themes). The purpose
  // is proving the applyPack code path runs end-to-end in the panel — not merely
  // that the compiler produces correct tokens (the gauntlet already covers that).
  await runPanelPackScene(browser, OUTPUT_DIR, rows)

  // --- live-invariant recompile scenes (run LAST): prove a developer invariant
  // change live-re-themes a violating applied theme via recompile-keep-vibe.
  // Self-contained: resets dev-config to {} in its own finally.
  await runLiveInvariantScenes(browser, OUTPUT_DIR, rows)

  await browser.close()

  // --- structural distinctness (Workstream A): themes change LAYOUT, not just color ---
  const sidebarWValues = new Set(PACK_IDS.map((id) => structuralByPack[id]?.sidebarW).filter(Boolean))
  const transformValues = new Set(
    PACK_IDS.map((id) => structuralByPack[id]?.displayTransform).filter(Boolean),
  )
  // Concrete consumption check: terminal-green is compact framing (--inv-sidebar-w
  // 200px), editorial is spacious (264px); the RENDERED aside width must reflect
  // that ordering, proving the demo consumes the token — not just :root holding it.
  const renderedTerminal = structuralByPack['terminal-green']?.renderedSidebarW
  const renderedEditorial = structuralByPack['editorial']?.renderedSidebarW
  const renderedOk =
    typeof renderedTerminal === 'number' &&
    typeof renderedEditorial === 'number' &&
    renderedTerminal < renderedEditorial

  const sidebarGeometryOk = sidebarWValues.size >= 2 && renderedOk
  const typographyOk = transformValues.size >= 2

  const structuralFailures = []
  if (!sidebarGeometryOk) {
    if (sidebarWValues.size < 2)
      structuralFailures.push(
        `sidebar geometry: only ${sidebarWValues.size} distinct --inv-sidebar-w value(s) across packs (need ≥ 2)`,
      )
    if (!renderedOk)
      structuralFailures.push(
        `sidebar geometry: rendered aside width terminal-green (${renderedTerminal}) not < editorial (${renderedEditorial})`,
      )
  }
  if (!typographyOk) {
    structuralFailures.push(
      `typography: only ${transformValues.size} distinct --inv-display-transform value(s) across packs (need ≥ 2)`,
    )
  }

  // (a) mutual-distinctness of the ten accents.
  const accentViolations = []
  for (let i = 0; i < PACK_IDS.length; i++) {
    for (let j = i + 1; j < PACK_IDS.length; j++) {
      const a = accentByPack[PACK_IDS[i]]
      const b = accentByPack[PACK_IDS[j]]
      if (!a || !b) continue
      const d = deltaE(oklab(a), oklab(b))
      if (d < ACCENT_MIN_DELTA_E) {
        accentViolations.push(
          `${PACK_IDS[i]} (${a}) ≈ ${PACK_IDS[j]} (${b}) — ΔE ${d.toFixed(3)} < ${ACCENT_MIN_DELTA_E}`,
        )
      }
    }
  }

  // --- report ---
  console.log('\nVisual-QA gauntlet — base:', BASE_URL)
  console.log('─'.repeat(78))
  console.log(
    'scene'.padEnd(18) +
      'accent'.padEnd(11) +
      'contrast'.padEnd(11) +
      'font'.padEnd(22) +
      'result',
  )
  console.log('─'.repeat(78))
  for (const r of rows) {
    console.log(
      r.scene.padEnd(18) +
        String(r.accent).padEnd(11) +
        String(r.contrast).padEnd(11) +
        String(r.font).padEnd(22) +
        (r.pass ? 'PASS' : 'FAIL'),
    )
  }
  console.log('─'.repeat(78))
  console.log(`accents mutually distinct (ΔE ≥ ${ACCENT_MIN_DELTA_E}): ${accentViolations.length === 0 ? 'PASS' : 'FAIL'}`)
  if (accentViolations.length > 0) {
    for (const v of accentViolations) console.log('  -', v)
  }

  // --- structural-distinctness report (Workstream A) ---
  console.log(
    `sidebar geometry differs (${[...sidebarWValues].join('/')}; rendered terminal-green ${renderedTerminal}px < editorial ${renderedEditorial}px): ${sidebarGeometryOk ? 'PASS' : 'FAIL'}`,
  )
  console.log(
    `typography treatment differs (--inv-display-transform: ${[...transformValues].join('/')}): ${typographyOk ? 'PASS' : 'FAIL'}`,
  )
  for (const f of structuralFailures) console.log('  -', f)

  const rowFailures = rows.filter((r) => !r.pass)
  for (const r of rowFailures) {
    if (r.contrastOk === false) console.log(`  - ${r.scene}: contrast ${r.contrast} < ${AA_CONTRAST}`)
    if (r.fontOk === false) console.log(`  - ${r.scene}: font link for ${r.font} missing`)
    // Panel-pack specific failure details
    if (r.scene.startsWith('panel:') && r.accentChanged === false) {
      console.log(`  - ${r.scene}: --inv-accent did not change after applying pack`)
    }
    if (r.scene.startsWith('panel:') && r.storedOk === false) {
      console.log(`  - ${r.scene}: server store did not contain a valid v2 theme with roles after applying pack`)
    }
    // Live-recompile specific failure details
    if (r.scene === 'live:accent-lock' && r.diag) {
      const d = r.diag
      if (!d.accentOk) console.log(`  - ${r.scene}: --inv-accent is ${d.after}, expected ${d.lock}`)
      if (!d.styleSpecKept) console.log(`  - ${r.scene}: stored theme lost its styleSpec (vibe not kept)`)
      if (d.roleAccent !== normHex(d.lock))
        console.log(`  - ${r.scene}: stored roles['--inv-accent'] is ${d.roleAccent}, expected ${normHex(d.lock)}`)
    }
    if (r.scene === 'live:chroma-cap' && r.diag) {
      const d = r.diag
      console.log(
        `  - ${r.scene}: chromaAfter ${d.chromaAfter.toFixed(3)} not < chromaBefore−0.03 (chromaBefore ${d.chromaBefore.toFixed(3)}, cap ${d.cap})`,
      )
    }
  }

  const failures = rowFailures.length + accentViolations.length + structuralFailures.length
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error('visual-qa harness crashed:', err)
  process.exit(1)
})
