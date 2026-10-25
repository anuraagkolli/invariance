# Console = the single invariants surface (+ /dev-style redesign) — design

- **Date:** 2026-06-14
- **Status:** Approved (brainstorming) → SP1 plan
- **Branch:** `feat/console-invariants-unify` (off `combined`)

## Problem

Invariants are managed across **two developer surfaces**: the **Console** (`apps/console`) for
data/behavior invariants (manifest policies + Guardrails) and **Nebula's `/dev`** page for
look invariants (lock accent, lock sections, chroma cap, contrast floor, page levels). The dev
has to go to two places, and the Console "looks like shit" while `/dev` is clean. Goal: **one
surface — the Console — for all invariants**, looking like `/dev`.

## Honest framing (ratified)

Two **enforcement engines** stay (they do different jobs and can't sensibly merge): the design
compiler (OKLCH color math, token compile, customization levels) for *look*, and the
control-plane verifier + sandbox (field-diff, capabilities, sandboxed JS) for *data/behavior*.
What unifies is the **developer control surface (Console) + the home for invariant definitions
(control plane)**. A useful split:

- **Data/behavior invariants** = hard contracts declared in code (the AppManifest). The Console
  **views + Guardrails-tests** them (read-only).
- **Look invariants** = runtime-tunable guardrails. They move from Nebula's local `/dev` overlay
  into a **control-plane design-config** the **Console edits**; Nebula reads it from there.

## Decisions (ratified)

- **Model:** look-invariants live in a **control-plane design-config** (new endpoint), edited in
  the Console; Nebula's design plane reads them from the control plane (not its local overlay).
- **`/dev` fate:** move **everything** off `/dev` and delete it — but this splits by data location:
  - **SP1 (this spec/plan):** unify the **invariants** into the Console + redesign the Console to
    the `/dev` look. Removes `/dev`'s lock-controls + its dev-config store/route.
  - **SP2 (separate, later):** migrate **theme history** persistence into the control plane, port
    the version-timeline + a **rollback** endpoint to the Console, then delete `/dev` entirely.
    (Theme history currently lives only in Nebula's file store, so this is a real storage move.)
- **Redesign:** add **Tailwind** to the Console and rebuild its views in `/dev`'s exact Tailwind
  language (fidelity by using the same system; ported `/dev` components render natively).

## SP1 architecture

**`/dev` design language to adopt** (from `apps/nebula/.../dev`): fixed-neutral dark
`bg-[#0a0b0d]`; white-opacity hierarchy (`text-white`, `/80`, `/60`, `/50`, `/40`, `/35`);
glassy surfaces `bg-white/[0.04]` + `ring-1 ring-white/10`; `rounded-lg/xl`; mono uppercase
eyebrow labels (`font-mono text-xs uppercase tracking-[0.34em] text-white/50`); Space Grotesk
headings; **emerald** accent (`bg-emerald-500/90 text-black` primary). Generous spacing.

**Control plane** (new):
- `DesignConfigSchema` (zod) in `@invariance/schema`: `{ pageLevels?, accentLock?, lockedSections?,
  chromaCap?, contrastFloor? }` (the existing `DevConfigOverlay` shape).
- `Store.getDesignConfig(appId)` / `putDesignConfig(appId, config)` (MemoryStore + PgStore).
- `GET/PUT /v1/apps/:appId/design-config`.

**Console** (`apps/console`):
- Add Tailwind (config mirrors the `/dev` palette + Space Grotesk + emerald).
- Rebuild existing views (dashboard, summary, mods table, manifest, subject, Guardrails) in the
  `/dev` Tailwind language — clean and smooth.
- New **Invariants** view: read-only manifest policies (the code contracts, via `describePolicy`)
  + the **editable look-invariant controls** (port `LockControls`, `onSave` → `api.putDesignConfig`)
  + a link to Guardrails (which tests *all* invariants' enforcement). `LOCKABLE_SECTIONS` /
  `baseLevels` come from the app's manifest (component slots + endpoints) instead of Nebula hardcode.
- `api.ts`: add `getDesignConfig` / `putDesignConfig`.

**Nebula** (`apps/nebula`):
- `layout.tsx` reads the overlay from the control plane (`GET /v1/apps/nebula/design-config`)
  instead of `readDevConfig()`; `mergeInvarianceConfig` unchanged.
- Remove `LockControls` from `/dev`, `app/api/dev-config`, and `lib/server/dev-config-store`.
  (`/dev` keeps theme history until SP2.)

**Result:** the Console is the single place to **define/tune** (look invariants) and **view/test**
(data invariants via Guardrails) every invariant, with the clean `/dev` aesthetic. Two
enforcement engines still run underneath, both reading invariant definitions from the control plane.

## Scope / non-goals (SP1)

- **In:** control-plane design-config + endpoints; Console Tailwind redesign; Console invariants
  editor; Nebula reads design-config from control plane + drops its local lock controls/store.
- **Out (SP2):** theme-history migration, version-timeline in Console, rollback endpoint, full
  `/dev` deletion. Streamline untouched. No change to the two enforcement engines themselves.

## Risks

- Big Console restyle (App.tsx ~1084 lines) — mechanical Tailwind conversion, done view-by-view.
- `baseLevels`/`LOCKABLE_SECTIONS` must derive from the manifest (per-app), not Nebula's hardcode.
- Nebula reading design-config over HTTP per request — cache briefly; fail open to base config.
- The manifest `design-constraint` (contrast/chroma) and the design-config overlap; the Console
  shows the manifest value as the code default and the design-config as the editable override.
