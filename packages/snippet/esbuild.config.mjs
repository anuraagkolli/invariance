import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'

// Bundles the Trial Mode snippet to a single IIFE that runs on any page with no
// build step. metafile:true lets the boundary check (and us) inspect whether
// React leaked in — the snippet must pull ONLY the pure core surface, never the
// React primitives/provider the core barrel also exports. After build we gzip
// the output and report raw + gz bytes (the <35KB gz target is honesty, not a
// hard gate — culori dominates the weight).
const result = await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/invariance.js',
  bundle: true,
  format: 'iife',
  globalName: 'Invariance',
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
