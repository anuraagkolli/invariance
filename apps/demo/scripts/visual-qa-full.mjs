// Self-contained visual-QA run: boot the demo, wait for it to answer, run the
// harness, then tear the server down — propagating the harness's exit code.
//
// Use `pnpm visual-qa` instead when a dev server is already running (faster
// iteration); this wrapper is the one-command CI/local path that needs no
// pre-running server. Requires a production build first (`pnpm --filter
// @invariance/demo build`) since it serves via `next start`.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(__dirname, '..')
const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`

// Pin the file-backed store (theme history + dev-config) to ONE fresh dir for
// this run. Two reasons: (1) under output:'standalone', `next start`'s SSR
// layout and the /api/* routes can resolve process.cwd() differently, so an
// unpinned data dir splits across two files and the page never sees the
// dev-config the harness PUTs — breaking the live-recompile scenes; pinning an
// absolute path makes every createJsonFileStore() call hit the same file. (2) a
// fresh dir means no stale theme/lock from a prior run can skew the gauntlet.
const DATA_DIR = mkdtempSync(join(tmpdir(), 'inv-visual-qa-'))

function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url)
        if (res.ok || res.status < 500) return resolve()
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return reject(new Error(`server did not start within ${timeoutMs}ms`))
      setTimeout(tick, 500)
    }
    tick()
  })
}

async function main() {
  console.log(`[visual-qa:full] starting next on :${PORT}... (data dir: ${DATA_DIR})`)
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: { ...process.env, INVARIANCE_DATA_DIR: DATA_DIR },
  })

  let exitCode = 1
  try {
    await waitForServer(`${BASE_URL}/gauntlet?pack=default`)
    console.log('[visual-qa:full] server up, running harness...')
    await new Promise((resolve) => {
      const harness = spawn('node', [join(__dirname, 'visual-qa.mjs'), BASE_URL], {
        cwd: APP_DIR,
        stdio: 'inherit',
      })
      harness.on('exit', (code) => {
        exitCode = code ?? 1
        resolve()
      })
    })
  } finally {
    server.kill('SIGTERM')
    // Drop the throwaway data dir so no run leaves a stored theme/lock behind.
    try {
      rmSync(DATA_DIR, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
  process.exit(exitCode)
}

main().catch((err) => {
  console.error('[visual-qa:full] crashed:', err)
  process.exit(1)
})
