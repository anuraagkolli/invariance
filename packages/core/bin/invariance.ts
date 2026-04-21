#!/usr/bin/env node
import { dispatch } from '../src/scanner/cli/dispatch'

dispatch(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invariance: ${msg}\n`)
    process.exit(1)
  },
)
