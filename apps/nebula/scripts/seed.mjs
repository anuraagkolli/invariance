import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const registry = process.env.INVARIANCE_REGISTRY ?? 'http://localhost:4400'
const manifest = JSON.parse(await readFile(join(here, '..', 'invariance.manifest.json'), 'utf8'))

const res = await fetch(`${registry}/v1/apps/nebula/manifest`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(manifest),
})
console.log('manifest publish:', res.status, await res.json())
if (!res.ok) process.exit(1)
