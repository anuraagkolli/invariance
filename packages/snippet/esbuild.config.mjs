import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

// Bundles the Trial Mode snippet to a single IIFE that runs on any page with no
// build step. metafile:true lets the boundary check (and us) inspect whether
// React leaked in — the snippet must pull ONLY the pure core surface, never the
// React primitives/provider the core barrel also exports. After build we gzip
// the output and report raw + gz bytes.
//
// BUNDLE SIZE HONESTY (measured 2026-06-12): ~75KB gz, well over the 35KB target.
// The target is aspirational, not a hard gate. Two deps dominate and neither is
// removable without losing the snippet's defining property — same brain as the SDK:
//   - culori (~44% raw): the OKLCH colour math compileTheme/clusterColors run on.
//   - zod    (~28% raw, 69.6KB): pulled INDEPENDENTLY by compileTheme's StyleSpecSchema
//     AND the Gatekeeper's reply schema. We DID trim the snippet's own persist/export
//     off zod (hand-rolled isValidV2Theme reusing isSafeCssTokenValue — see
//     src/validate.ts), but that frees only the ~1KB theme-schemas module: zod's
//     LIBRARY stays because compileTheme (the load-bearing pack path) validates a
//     StyleSpec with it. Removing zod would mean reimplementing the compiler's
//     validation, defeating the "one brain" guarantee. So: honest 75KB, not 35KB.
const result = await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/invariance.js',
  bundle: true,
  format: 'iife',
  // Lowercase 'invariance' so a page can call invariance.mountTrial({}) — this is
  // the documented global name the static-demo fixture and the README snippet use.
  globalName: 'invariance',
  minify: true,
  target: 'es2019',
  metafile: true,
  logLevel: 'info',
})

writeFileSync('dist/meta.json', JSON.stringify(result.metafile, null, 2))

const raw = readFileSync('dist/invariance.js')
const gz = gzipSync(raw)
const kb = (n) => `${(n / 1024).toFixed(1)}KB`

// Surface react in the dependency graph if it leaked — the inputs map keys are
// the resolved module paths esbuild walked.
const inputs = Object.keys(result.metafile.inputs)
const reactInputs = inputs.filter((p) => /[/\\]react(-dom)?[/\\]/.test(p) || /[/\\]react(-dom)?\.js$/.test(p))

console.log('')
console.log(`snippet bundle  raw ${kb(raw.length)}  gz ${kb(gz.length)}`)
console.log(reactInputs.length === 0 ? 'react leaked: NO' : `react leaked: YES (${reactInputs.length} inputs)`)
if (reactInputs.length > 0) {
  for (const p of reactInputs.slice(0, 10)) console.log(`  ${p}`)
}
