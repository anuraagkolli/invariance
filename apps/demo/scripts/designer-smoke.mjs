// designer-smoke.mjs — OSS-model proof gate (MANUAL, never a CI gate).
//
// Proves the open-source model produces COHERENT themes through the REAL
// Designer: it runs the ten canonical vibe prompts against a live Ollama,
// asserts each returns a zod-valid StyleSpec, compiles it, and checks the
// compiled roles pass AA contrast. This is the evidence that the OSS path
// produces real themes — not just that the compiler is sound.
//
// It NEVER blocks `pnpm test`: it is not imported by any test or the build,
// and it exits 0 (skip) whenever Ollama is unreachable. Run it by hand with
// Ollama running and the model pulled:
//
//   ollama serve            # (or `brew services start ollama`)
//   ollama pull qwen2.5
//   pnpm --filter @invariance/demo designer-smoke
//
// Env (all optional, sensible defaults):
//   LLM_BASE_URL          default http://localhost:11434/v1
//   LLM_MODEL             default qwen2.5
//   LLM_PROVIDER          default openai-compatible
//   LLM_STRUCTURED_MODE   default json_schema  (falls to json_object on weak models)

import { wcagContrast } from 'culori'

// The package builds to CommonJS (dist/index.js). Default-import + destructure
// is the interop form that works regardless of whether Node's cjs-module-lexer
// detects the chained `exports.a = exports.b = ...` named exports.
import invariance from 'invariance'

const { callDesigner, compileTheme } = invariance

// --- config ---------------------------------------------------------------

const BASE_URL = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1'
const MODEL = process.env.LLM_MODEL ?? 'qwen2.5'
const PROVIDER = process.env.LLM_PROVIDER ?? 'openai-compatible'
const STRUCTURED_MODE = process.env.LLM_STRUCTURED_MODE ?? 'json_schema'

// Minimal relational constraints: the smoke run must allow every pairing and
// both modes. deriveConstraints() takes a full InvarianceConfig, so we build the
// floors directly (same shape the gauntlet/showcase pass to compileTheme).
const CONSTRAINTS = { contrast: 4.5, accent_chroma_max: 0.25 }

// The ten canonical vibes, phrased naturally so the Designer has to interpret
// intent rather than echo a pack name.
const VIBES = [
  { key: 'retro', prompt: 'make it retro arcade' },
  { key: 'brutalist', prompt: 'stark brutalist, loud and heavy' },
  { key: 'pastel', prompt: 'soft calm pastel' },
  { key: 'terminal', prompt: 'green phosphor hacker terminal' },
  { key: 'glassy', prompt: 'dark glassy modern tech' },
  { key: 'editorial', prompt: 'quiet editorial print magazine' },
  { key: 'ocean', prompt: 'fresh coastal ocean' },
  { key: 'sunset', prompt: 'warm dramatic sunset poster' },
  { key: 'mono', prompt: 'minimal monochrome grayscale' },
  { key: 'corporate', prompt: 'calm professional corporate' },
]

// --- reachability ping ----------------------------------------------------

// Ping the base URL's /models with a short timeout. Unreachable => SKIP (exit 0):
// this is a manual proof, not something that should fail when Ollama is absent.
async function isReachable(base) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(`${base}/models`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// --- AA check on compiled roles -------------------------------------------

// Reuse culori's wcagContrast (same math the compiler solves against) to verify
// the headline pair the user actually reads: text-primary on surface-1.
function textContrast(roles) {
  const fg = roles['--inv-text-primary']
  const bg = roles['--inv-surface-1']
  if (!fg || !bg) return 0
  return wcagContrast(fg, bg)
}

// --- run ------------------------------------------------------------------

async function main() {
  const reachable = await isReachable(BASE_URL)
  if (!reachable) {
    console.log(`Ollama not reachable at ${BASE_URL} — skipping (this is a manual proof, not a CI gate).`)
    process.exit(0)
  }

  console.log(`Designer smoke: ${MODEL} via ${PROVIDER} @ ${BASE_URL} (structured: ${STRUCTURED_MODE})\n`)

  const rows = []
  let failures = 0

  for (const vibe of VIBES) {
    let status = 'PASS'
    let mode = '-'
    let accentHue = '-'
    let fontPairing = '-'
    let contrastStr = '-'

    try {
      const result = await callDesigner({
        request: vibe.prompt,
        constraints: CONSTRAINTS,
        apiKey: 'ollama',
        provider: 'openai-compatible',
        baseUrl: BASE_URL,
        model: MODEL,
        oaiStructuredMode: STRUCTURED_MODE,
      })

      if (!result.ok) {
        status = 'FAIL'
        contrastStr = `designer: ${result.error.slice(0, 40)}`
      } else {
        const spec = result.spec
        mode = spec.mode
        accentHue = String(spec.accentHue)
        fontPairing = spec.fontPairing

        // The Designer already zod-validated the spec; compiling proves it
        // expands into a complete, AA-clean role set.
        const { roles } = compileTheme(spec, CONSTRAINTS)
        const c = textContrast(roles)
        contrastStr = c.toFixed(2)
        if (c < CONSTRAINTS.contrast) {
          status = 'FAIL'
        }
      }
    } catch (err) {
      status = 'FAIL'
      contrastStr = `error: ${(err?.message ?? String(err)).slice(0, 40)}`
    }

    if (status === 'FAIL') failures += 1
    rows.push({ vibe: vibe.key, mode, accentHue, fontPairing, contrast: contrastStr, status })
  }

  printTable(rows)
  console.log(`\n${rows.length - failures}/${rows.length} vibes passed.`)
  // Exit non-zero ONLY when the run actually executed and had failures. A skip
  // (Ollama down) already returned 0 above.
  process.exit(failures ? 1 : 0)
}

// --- table printer --------------------------------------------------------

function printTable(rows) {
  const cols = [
    { key: 'vibe', label: 'vibe', w: 11 },
    { key: 'mode', label: 'mode', w: 6 },
    { key: 'accentHue', label: 'accentHue', w: 10 },
    { key: 'fontPairing', label: 'fontPairing', w: 22 },
    { key: 'contrast', label: 'text-contrast', w: 26 },
    { key: 'status', label: 'result', w: 6 },
  ]
  const pad = (s, w) => String(s).padEnd(w).slice(0, w)
  const header = cols.map((c) => pad(c.label, c.w)).join('  ')
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const row of rows) {
    console.log(cols.map((c) => pad(row[c.key], c.w)).join('  '))
  }
}

main().catch((err) => {
  // An unexpected harness error after the reachability check is a real failure
  // (the run DID start), so surface it non-zero.
  console.error('designer-smoke crashed:', err)
  process.exit(1)
})
