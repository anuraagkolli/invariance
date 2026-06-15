# SP2 (theme history + rollback → Console, delete /dev) + generalize look-invariant vocab — Plan

> **For agentic workers (NEW SESSION):** run this via superpowers:writing-plans → subagent-driven-development (or execute directly with TDD). It's concrete but intentionally lighter than a full task-by-task plan — flesh each task into red/green/commit steps as you go. Two independent parts; do **Part 1 first** (small), then **Part 2**.

**Goal:** Finish unifying the developer surface: (1) make the Console's look-invariant editor app-agnostic (drop the Nebula hardcode), and (2) move Nebula's theme version-history + rollback into the control plane + Console, then **delete Nebula's `/dev` page entirely**.

**Prior context (so a cold session has it):** The combined product has two customization planes — `@invariance/design` (look/theme, client-side) and `@invariance/client`+`@invariance/server`+control-plane (signed-bundle business-logic + invariants). SP1 (done, on `combined`) made the **Console the single invariants surface** (Tailwind `/dev` look; `#/invariants` view = read-only manifest policies + editable look-invariants stored in a control-plane **design-config** `GET/PUT /v1/apps/:appId/design-config`; Nebula reads it via `layout.tsx`). What's left: the two items below. See `docs/superpowers/specs/2026-06-14-console-invariants-unify-design.md`.

**Setup for a new session:**
```bash
git checkout combined && git pull && git checkout -b feat/console-sp2-vocab
# stack: control plane :4400 (qwen env), seed, nebula :4321, console :4600
INVARIANCE_LLM_BASE_URL=http://localhost:11434/v1 INVARIANCE_LLM_MODEL=qwen2.5:latest PORT=4400 pnpm -F @invariance/control-plane dev &
pnpm -F @invariance/nebula seed
INVARIANCE_REGISTRY=http://localhost:4400 pnpm -F @invariance/nebula dev &     # :4321
CONSOLE_PORT=4600 INVARIANCE_REGISTRY=http://localhost:4400 DEMO_API_URL=http://localhost:4321 pnpm -F @invariance/console dev &  # :4600
```

---

## Part 1 — Generalize the look-invariant vocabulary (drop the hardcode)

**Why:** the Console's `InvariantsView` hardcodes `NEBULA_ROUTES`/`NEBULA_SECTIONS` because the `AppManifest` doesn't model an app's customizable routes/sections. Declare them in the manifest so the Console renders lock controls for any app.

- **Task 1.1 — extend the manifest schema.** `packages/schema/src/manifest.ts`: add an optional
  ```ts
  designSurface: z.object({
    pages: z.array(z.object({ route: z.string().min(1), defaultLevel: z.number().int().min(0).max(4) })).default([]),
    sections: z.array(z.string().min(1)).default([]),
  }).optional(),
  ```
  to `AppManifestSchema`. Export the inferred type. Add a `packages/schema/test` case (parses with/without it). (TDD.)
- **Task 1.2 — Nebula declares its surface.** Add `designSurface` to `apps/nebula/invariance.manifest.json` (and keep `apps/nebula/scripts/seed.mjs` publishing the file): `pages: [{route:"/",defaultLevel:4},{route:"/series",defaultLevel:4}]`, `sections: ["hero","row-trending","row-continue","row-originals","row-new","row-acclaimed"]` (mirrors Nebula's `frontend.pages` + home `m.slot` names).
- **Task 1.3 — Console reads it.** `apps/console/src/App.tsx` `InvariantsView`: build `baseLevels` from `manifest.designSurface?.pages` (`{[route]: defaultLevel}`) and `sections` from `manifest.designSurface?.sections`; remove `NEBULA_ROUTES`/`NEBULA_SECTIONS`. If `designSurface` is absent, pass `{}`/`[]` (LockControls already hides those rows gracefully).
- **Verify:** Console `#/invariants` (App: nebula) renders the page-level + locked-section controls from the manifest (not the constants); editing still round-trips (set a value, confirm Nebula's merged SSR config reflects it). `pnpm -w build && pnpm -w test` green.

---

## Part 2 — SP2: theme history + rollback in the control plane + Console; delete `/dev`

**Storage contract to satisfy (from `@invariance/design`, do not change it):** `createApiStorage(baseUrl)` does
`GET ${baseUrl}?userId=<u>&appId=<a>` → latest theme JSON (object with a `version` field, or null), and
`PUT ${baseUrl}` body `{ userId, appId, theme, meta? }` (meta = `{prompt?, source?: 'pipeline'|'pack'|'rollback', description?}`).
Nebula additionally keeps an append-only timeline (`ThemeVersionEntry { seq, at, theme, meta }`, cap 50 per `appId:userId`) and a rollback (PUT a prior theme with `meta.source='rollback'`). We move all of that into the control plane.

- **Task 2.1 — control-plane theme store.** Add to `apps/control-plane/src/store.ts` `Store` (+ MemoryStore, + `pg/pg-store.ts` PgStore + a `theme_versions` table in `pg/schema.sql.ts`):
  - `getLatestTheme(appId, userId): Promise<unknown | null>`
  - `appendThemeVersion(appId, userId, theme, meta?): Promise<ThemeVersionEntry>` (monotonic `seq`, ISO `at`, cap ~50)
  - `listThemeVersions(appId, userId): Promise<ThemeVersionEntry[]>` (newest-first)
  - `listThemeTimelines(appId): Promise<{ userId; count; latestAt }[]>`
  Define `ThemeVersionEntry` (theme kept opaque: `z.record(z.unknown())` / `unknown` — do NOT couple `@invariance/schema` to `@invariance/design-schema`). Cover in `test/store-conformance.test.ts` (both Memory + PGlite).
- **Task 2.2 — control-plane routes** (`apps/control-plane/src/app.ts`):
  - `GET /v1/apps/:appId/themes?userId=<u>` → `getLatestTheme` (matches `createApiStorage.loadTheme`).
  - `PUT /v1/apps/:appId/themes` (body `{userId, theme, meta?}`) → `appendThemeVersion` + it becomes latest (matches `saveTheme`).
  - `GET /v1/apps/:appId/themes/history?userId=<u>` → `listThemeVersions`; without `userId` → `listThemeTimelines`.
  - `POST /v1/apps/:appId/themes/rollback` (body `{userId, seq}`) → look up that seq's theme, `appendThemeVersion(... meta {source:'rollback', description:'Rollback to v<seq>'})`.
  Route tests (round-trip save→latest→history→rollback).
- **Task 2.3 — Nebula points storage at the control plane.** `apps/nebula/src/app/providers.tsx`: change `storage="api"` `storageUrl` from `/api/themes` to `${registry}/v1/apps/nebula/themes` where `registry = process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY ?? 'http://localhost:4400'` (client-side; CORS is enabled control-plane-side). Add that public env alongside `llmProviderProps` in `apps/nebula/src/lib/invariance-config.ts`. (SSR cookie path in `layout.tsx` is unchanged — the cookie mirror still drives first paint; only durable load/save move.)
- **Task 2.4 — Console themes/history view.** Port `version-timeline.tsx`, `version-card.tsx`, `token-diff.tsx`, and `lib/theme-diff.ts` from `apps/nebula` into `apps/console/src/`; add `api.themeHistory(appId, userId?)` + `api.rollbackTheme(appId, userId, seq)` to `apps/console/src/api.ts`; add a `#/themes` (or fold into a subject drill-down) view: a user selector (from the timelines summary) + the timeline + a rollback button. Style is already the `/dev` Tailwind language. Add a nav link.
- **Task 2.5 — delete `/dev` + Nebula theme storage.** `git rm -r apps/nebula/src/app/dev`; `git rm apps/nebula/src/app/api/themes apps/nebula/src/app/api/themes/history` (the route files), `apps/nebula/src/lib/server/theme-history-store.ts(.test)`, `apps/nebula/src/lib/theme-diff.ts(.test)` (now in console), `apps/nebula/src/components/dev/*`, and `lib/server/json-file-store.ts` **iff** nothing else imports it (grep first). Remove the `/dev` link from the header. Keep `lib/dev-config.ts` (`mergeInvarianceConfig`) and the `layout.tsx` design-config fetch.
- **Verify (end-to-end):** in Nebula, apply a theme (pack chip or qwen prompt) → it persists to the control plane → the Console themes view shows the new version with its prompt provenance → click **Rollback** on an older version → Nebula's next load renders the rolled-back theme. `/dev` 404s. `pnpm -w build && pnpm -w test` green; Streamline + business-logic plane untouched.

---

## Risks / notes
- `createApiStorage` passes `userId`/`appId` via query (GET) + body (PUT); the control-plane route reads `userId` from query/body and `appId` from the path (redundant body `appId` ignored).
- Keep the theme JSON **opaque** in the platform schema (`unknown`/`z.record`) — don't pull `@invariance/design-schema` into `@invariance/schema`.
- Client-side `storageUrl` needs a `NEXT_PUBLIC_*` env for prod; dev defaults to `:4400`. CORS already enabled in the control plane (`cors()` in `app.ts`).
- Rollback is append-only (a new version), matching the current `/dev` semantics — history stays immutable.
- After Part 2, the design plane's theme persistence is control-plane-backed; the in-memory control plane loses themes on restart (fine for dev; `DATABASE_URL` + `INVARIANCE_SIGNING_*` for durability, same caveat as the rest of the platform).
- Suggested PR/commit grouping: Part 1 = one short series; Part 2 = store → routes → Nebula repoint → console view → deletions, each its own commit.

## Exit criteria
- Console renders look-invariant controls from the manifest's `designSurface` (no hardcode).
- Theme history + rollback live in the control plane and the Console; Nebula reads/writes themes there; **`/dev` is deleted**; full `-w build`/`test` green.
