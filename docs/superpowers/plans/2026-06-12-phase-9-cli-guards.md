# Phase 9: `invariance check` + `migrate-theme` CLIs

> Executed via subagent-driven-development. Decisions here; task prompt carries detail.

**Goal:** two CLI commands in the scanner package (which already hosts `invariance-scan` / `invariance-unlock` bins with hand-rolled arg parsing — match that style, no new dep):

1. **`invariance-check`** — a CI guard. Compares the current source against the committed `invariance.config` registry and fails (exit 1) when a wrapped slot/token/section that the config knows about has vanished from source without a migration entry, or when a hardcoded style value reappears inside a wrapped slot (the scanner can already detect literal design values via its extraction — reuse `discoverApp` + extraction). Output: human-readable list of violations + a summary; exit 0 clean, 1 on any violation. Flags: `[appPath]`, `--json` (machine output for CI), `--help`.

2. **`invariance-migrate-theme`** — version bump carry-forward. Given a stored theme.json (v1 or v2) and the current registry, produces a migrated theme: same-named tokens/slots keep their user values; tokens/slots absent from the current registry are dropped (reported); renamed via an optional `--renames <file>` (JSON map old→new). Operates on the theme.json v2 shape; uses core's `upgradeThemeJson` for v1 input. Output the migrated theme (stdout or `--write <path>`), plus a report of carried/dropped/renamed. Flags: `[themePath]`, `--renames <file>`, `--write <path>`, `--json`, `--help`.

**Reuse, don't rebuild:** `discoverApp`, the AST extraction, and `analyze` from `src/migrate.ts` for check; core's `upgradeThemeJson`, `ThemeJsonV2Schema`, and the role/slot vocabulary for migrate-theme. Logic lives in `src/check/` and `src/migrate-theme/` (pure, tested); bins are thin arg-parse + call + format, mirroring the existing two bins.

**Exit (CLAUDE.md phase 9):** `invariance check` blocks a removed slot in CI — proven by a test that scans a fixture, removes a slot from its source, and asserts the check exits non-zero with the slot named.
