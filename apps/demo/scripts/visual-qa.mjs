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
const deltaE = differenceEuclidean('oklab')

// Read the role values + the document's font <link> hrefs from a loaded page.
async function readScene(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (l) => l.getAttribute('href') ?? '',
    )
    return {
      accent: cs.getPropertyValue('--inv-accent').trim(),
      textPrimary: cs.getPropertyValue('--inv-text-primary').trim(),
      surface1: cs.getPropertyValue('--inv-surface-1').trim(),
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

// localStorage key used by the demo's createLocalStorage backend.
// Key structure: invariance:${appId}:${userId} (from local-storage.ts).
// The demo provider sets appId='nebula-demo', userId='demo-user'.
const THEME_STORAGE_KEY = 'invariance:nebula-demo:demo-user'

// Verify a stored v2 theme has a roles map with at least one --inv-* token.
function isStoredV2ThemeWithRoles(raw) {
  try {
    const parsed = JSON.parse(raw)
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      parsed.version === 2 &&
      parsed.theme &&
      typeof parsed.theme.roles === 'object' &&
      Object.keys(parsed.theme.roles).length > 0
    )
  } catch {
    return false
  }
}

// Click a pack chip in the customization panel and assert:
//   (a) --inv-accent on :root changed from the baseAccent before the click
//   (b) localStorage for the demo key holds a valid v2 theme with roles
async function clickPackChipAndAssert(page, packId, packName, baseAccent, outputDir) {
  // Chips are identified by data-inv-pack={packId} (set in customization-overlay.tsx)
  const chipSelector = `[data-inv-pack="${packId}"]`
  const chip = await page.$(chipSelector)
  if (!chip) {
    throw new Error(`Panel chip for pack "${packId}" (${chipSelector}) not found — check availablePacks filter or panel markup`)
  }
  await chip.click()

  // applyPack is async (compile → verify → persist); wait up to 8s for the
  // in-progress state to resolve (chip will re-enable once isThinking goes false).
  // The most reliable signal is the chip becoming enabled again.
  await page.waitForFunction(
    (sel) => {
      const btn = document.querySelector(sel)
      return btn && !btn.disabled
    },
    chipSelector,
    { timeout: 8000 },
  ).catch(() => {
    // Log so a stuck chip surfaces in CI output; assertions below will fail if
    // the pack was never actually applied.
    console.warn('[visual-qa] chip re-enable wait timed out for', packId)
  })

  // (a) --inv-accent must have changed from the default (applyPack calls applyAnyTheme)
  const newAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-accent').trim(),
  )

  // (b) localStorage holds a valid v2 theme with roles
  const storedRaw = await page.evaluate((k) => localStorage.getItem(k), THEME_STORAGE_KEY)
  const storedOk = storedRaw !== null && isStoredV2ThemeWithRoles(storedRaw)

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

  // Open the panel. Trigger button has aria-label="Open customization panel"
  // (trigger-button.tsx) and also data-inv-trigger="true" — use the aria-label
  // via getByRole for a robust selector that isn't markup-coupled.
  const trigger = page.getByRole('button', { name: 'Open customization panel' })
  await trigger.click()

  // Wait for the panel dialog to appear (role=dialog, aria-label="Customization panel")
  await page.waitForSelector('[role="dialog"][aria-label="Customization panel"]', { timeout: 5000 })

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

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })

  const rows = []
  const accentByPack = {}

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
  // (b) persists a valid v2 theme to localStorage. The purpose is proving the
  // applyPack code path runs end-to-end in the panel — not merely that the
  // compiler produces correct tokens (the gauntlet already covers that).
  await runPanelPackScene(browser, OUTPUT_DIR, rows)

  await browser.close()

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

  const rowFailures = rows.filter((r) => !r.pass)
  for (const r of rowFailures) {
    if (r.contrastOk === false) console.log(`  - ${r.scene}: contrast ${r.contrast} < ${AA_CONTRAST}`)
    if (r.fontOk === false) console.log(`  - ${r.scene}: font link for ${r.font} missing`)
    // Panel-pack specific failure details
    if (r.scene.startsWith('panel:') && r.accentChanged === false) {
      console.log(`  - ${r.scene}: --inv-accent did not change after applying pack`)
    }
    if (r.scene.startsWith('panel:') && r.storedOk === false) {
      console.log(`  - ${r.scene}: localStorage did not contain a valid v2 theme with roles after applying pack`)
    }
  }

  const failures = rowFailures.length + accentViolations.length
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error('visual-qa harness crashed:', err)
  process.exit(1)
})
