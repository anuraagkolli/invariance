import { promises as fs } from 'fs'
import path from 'path'

// Tiny file-backed JSON store shared by the theme-history and dev-config
// stores. The FILE is the source of truth, never module state: Next dev
// compiles each route as its own entry, so a module-level singleton would be
// duplicated across /api/themes, /api/dev-config, and layout.tsx. The in-memory
// cache is only an I/O saver, validated by mtime on every read.
//
// No file locking — single-process dev/demo tradeoff. update() serializes
// writers within this instance via a promise queue, and the tmp-file + rename
// write keeps concurrent readers from ever seeing a torn file.

export interface JsonFileStore<T> {
  read(): Promise<T>
  update(fn: (current: T) => T): Promise<T>
}

function dataDir(): string {
  return process.env.INVARIANCE_DATA_DIR ?? path.join(process.cwd(), '.data')
}

export function createJsonFileStore<T>(fileName: string, empty: T): JsonFileStore<T> {
  let cache: { mtimeMs: number; value: T } | null = null
  let tail: Promise<unknown> = Promise.resolve()

  // dataDir() is resolved per call, not at construction: tests point
  // INVARIANCE_DATA_DIR at a fresh temp dir after importing the store module.
  const filePath = () => path.join(dataDir(), fileName)

  async function readFresh(): Promise<T> {
    const file = filePath()
    let stat
    try {
      stat = await fs.stat(file)
    } catch {
      cache = null
      return empty
    }
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.value
    const value = JSON.parse(await fs.readFile(file, 'utf8')) as T
    cache = { mtimeMs: stat.mtimeMs, value }
    return value
  }

  async function write(value: T): Promise<void> {
    const file = filePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(tmp, file)
    const stat = await fs.stat(file)
    cache = { mtimeMs: stat.mtimeMs, value }
  }

  return {
    read: readFresh,

    update(fn) {
      const next = tail.then(async () => {
        const updated = fn(await readFresh())
        await write(updated)
        return updated
      })
      // Keep the queue alive past a failed update; the failure still reaches
      // the caller through `next`.
      tail = next.catch(() => undefined)
      return next
    },
  }
}
