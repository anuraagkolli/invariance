#!/usr/bin/env node
// Post-build step: restore the shebang on compiled CLI files and make them
// executable. tsc strips leading `#!/usr/bin/env node` comments when it emits
// JS. Without this, `npx invariance` tries to run JS with /bin/sh and fails.

import { chmodSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BIN_DIR = resolve(__dirname, '..', 'dist', 'bin')

const SHEBANG = '#!/usr/bin/env node\n'

function listJs(dir) {
  let out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out = out.concat(listJs(full))
    } else if (entry.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

let patched = 0
try {
  for (const file of listJs(BIN_DIR)) {
    const src = readFileSync(file, 'utf-8')
    if (!src.startsWith(SHEBANG)) {
      writeFileSync(file, SHEBANG + src, 'utf-8')
    }
    chmodSync(file, 0o755)
    patched++
  }
} catch (err) {
  if (err.code === 'ENOENT') {
    // no bin/ output — nothing to do
    process.exit(0)
  }
  throw err
}

console.log(`finalize-bin: processed ${patched} file(s) in ${BIN_DIR}`)
