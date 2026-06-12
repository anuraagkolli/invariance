// Self-contained visual-QA run: boot the demo, wait for it to answer, run the
// harness, then tear the server down — propagating the harness's exit code.
//
// Use `pnpm visual-qa` instead when a dev server is already running (faster
// iteration); this wrapper is the one-command CI/local path that needs no
// pre-running server. Requires a production build first (`pnpm --filter
// @invariance/demo build`) since it serves via `next start`.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(__dirname, '..')
const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`

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
  console.log(`[visual-qa:full] starting next on :${PORT}...`)
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR,
    stdio: 'inherit',
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
  }
  process.exit(exitCode)
}

main().catch((err) => {
  console.error('[visual-qa:full] crashed:', err)
  process.exit(1)
})
