# Console "Guardrails" panel — design

- **Date:** 2026-06-13
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Branch:** `feat/console-guardrails`

## Context & problem

Invariance's differentiator is the **invariants** layer: end users customize an app
through prompts, but developer-declared invariants always hold. Verification of the
current `combined` branch confirmed this works at both layers —

- **Authoring-time verifier** (deterministic, control plane): rejects bad mods with a
  precise reason (`422`). Verified 8/8 (unknown token, unsafe CSS, locked slot,
  write-to-immutable, hook-on-denied-endpoint, over-budget, + legal accepts).
- **Runtime enforcement** (defense-in-depth, server SDK): a *signed, verified* mod that
  cheats at execution is neutralized — capability-exceeding writes discarded, immutable
  fields / out-of-range values rolled back to the canonical payload, every block emitted
  as `hook_policy_violation` telemetry.

But this is **invisible** in the product UI — it's only observable via `curl`/telemetry.
For a live demo it needs to be a *watchable, repeatable* moment that does not depend on
what the LLM happens to generate.

## Goal / non-goals

**Goal:** A console **Guardrails** view that (a) shows enforcement happening live in
human terms, and (b) lets the presenter **trigger a real violation per invariant on cue**
and watch it held.

**Non-goals (v1):** the Control-Room split-screen (Approach C); the AA-contrast
(`design-constraint`) test card; websockets; counter persistence across restarts; auth;
any change to the enforcement engine itself (it already works — this only makes it visible).

## Demo narrative

In the console (`:4600`), the new **Guardrails** view:

1. Lists every invariant the developer declared (from the manifest, via the existing
   `describePolicy`): *titles canonical*, *maturity can't be altered/hidden*, *priority
   1–5*, *no hooks on deletes*, *hook budgets*.
2. Each invariant has a **"Test it"** button.
3. Clicking fires a *real* violation attempt. A **live Enforcement feed** lights up:
   **🛡️ BLOCKED · a mod tried to rewrite immutable show titles → app served canonical
   data**, tagged with the layer (authoring vs runtime) and the policy id.
4. For runtime tests the card shows **proof**: it fetches the real demo API and shows the
   data came back unchanged.
5. The invariant's **"held ✓ N"** counter ticks up.

Punchline: *"Users can ask for anything; the developer's invariants always hold — here's
the receipt."*

## Architecture

### Components

- **Console Guardrails view** — new section in `apps/console/src/App.tsx`, plus a new
  `apps/console/src/guardrails.ts` (declarative test catalog) and an `eventToHuman()`
  mapper. The only significant new UI.
- **New control-plane route** `GET /v1/apps/:appId/events?limit=N` — recent activity feed,
  newest-first, including `detail`. Reuses the existing `store.listEvents(appId,{limit})`.
  Today events are reachable only per-subject (`/subjects/:id/overview`) or as aggregate
  counts (`/analytics/summary`); the live global feed needs this route.
- **Console vite proxy** entry `/demo-api → http://localhost:4500` in
  `apps/console/vite.config.ts`, so the browser hits the real demo API same-origin (no CORS,
  no demo-app change).
- **Reused as-is:** `describePolicy` (invariant rendering), `POST /v1/.../bundles` (verifier
  `422` path), the `/events` ingestion + runtime telemetry already emitted, kill/restore.

### Two test flows (each exercises a real enforcement path — no fakes)

**Authoring-time (verifier):**
1. Console `POST`s a crafted bad draft → `/v1/apps/streamline/subjects/<sid>/bundles`.
2. Response is `422 { reasons }`.
3. Card shows "🛡️ Rejected at authoring: <reason>"; feed shows the rejection.

**Runtime (defense-in-depth):**
1. Console `POST`s a *signed cheat* draft (passes verification, cheats at execution) →
   `/v1/.../subjects/<sid>/bundles` → `201`.
2. Console `GET`s `/demo-api/api/shows` (or `/api/featured`, `/api/watchlist`) with header
   `x-demo-user: <sid>`.
3. Demo runtime executes the hook, detects the violation, **rolls back** → returns canonical
   data; emits `hook_policy_violation`.
4. Card diffs the response against canonical and shows "🛡️ Neutralized at runtime — titles
   served canonical"; feed shows the policy-violation event.

### Throwaway subjects

Tests use namespaced subject ids `__guardrail_<testId>_<nonce>` with a fresh nonce per click
so each run is snappy (avoids the 5 s pointer-cache lag of reusing one subject) and clearly
labeled in the feed. No cleanup needed for a demo; they simply populate the feed (that's the
point).

## Invariant test catalog

`apps/console/src/guardrails.ts` exports an array of entries:

```ts
type GuardrailLayer = "authoring" | "runtime";
interface GuardrailTest {
  id: string;                 // stable, e.g. "titles-runtime"
  label: string;             // button text, e.g. "Rewrite show titles"
  policyId: string;          // ties to a manifest policy / "platform-safety"
  layer: GuardrailLayer;
  draft: ModDraft;           // posted to /bundles (uiOps?/hooks?/capabilities?)
  runtime?: {                // present iff layer === "runtime"
    endpointPath: string;    // "/demo-api/api/shows"
    method?: "GET" | "POST";
    body?: unknown;          // for POST request-phase tests (add-watchlist)
    assertCanonical: (resp, canonical) => boolean; // proof the data held
  };
  expect: { contains: string }; // authoring: substring expected in 422 reasons
}
```

| id | policyId | layer | attempt → proven |
|---|---|---|---|
| `titles-runtime` | `titles-immutable` | runtime | hook uppercases titles → rolled back |
| `titles-authoring` | `titles-immutable` | authoring | write cap on `shows.*.title` → 422 |
| `maturity-runtime` | `maturity-immutable` | runtime | hook strips `maturity` → rolled back |
| `featured-runtime` | `featured-title-immutable` | runtime | hook rewrites billboard title → rolled back |
| `priority-runtime` | `priority-range` | runtime | request hook sets `priority:99` → rolled back |
| `deletes-authoring` | `no-hooking-deletes` | authoring | hook on `remove-watchlist` → 422 |
| `budget-authoring` | `hook-budgets` | authoring | hook declares 200ms → 422 |
| `xss-authoring` | `platform-safety` | authoring | `url(javascript:)` CSS → 422 |
| `slot-authoring` | `platform-safety` | authoring | override locked `billboard.meta` → 422 |

Invariants with both an authoring and a runtime entry (titles) render both buttons — the
"two independent layers" teaching moment.

*Deferred:* `design-constraint` AA-contrast card (needs a hand-built low-contrast theme
bundle with design provenance).

## Panel UI

New top-level **Guardrails** view (hash route, nav alongside Dashboard / Manifest):

- **Live Enforcement feed** (top): polls `GET /v1/apps/streamline/events?limit=30` every
  ~2 s, newest-first. Each line: icon + humanized text via `eventToHuman(event)` —
  `hook_policy_violation` + `detail.violations` → "🛡️ BLOCKED · tried to rewrite immutable
  show titles → served canonical data." Blocks styled prominently; `mod_authored` /
  `hook_capability_violation` / `mod_killed` shown muted for context.
- **Invariant cards** (below): one per declared invariant — `describePolicy` text, a
  **"held ✓ N"** counter (counted from feed events matching that `policyId`), and the Test
  button(s). On click, fire the attempt and flash the verdict inline; the feed also updates.

`eventToHuman()` maps `(type, detail)` → `{ icon, severity, text }`, keyed by policy id for
friendly verbs. Lives next to the catalog so both stay in sync.

## Testing

- **Demo-honesty integration test** in `apps/demo/test` (already has the e2e harness that
  boots control plane + demo server): for every catalog entry, assert the expected verdict —
  authoring → `422` whose reasons contain `expect.contains`; runtime → `201` then a
  demo-API response that satisfies `assertCanonical`. This is the guard against the demo
  silently rotting (e.g., a manifest change that makes a "cheat" actually legal).
- **`/events` route unit test** in `apps/control-plane/test`: seed events → route returns
  them newest-first, respects `limit`, includes `detail`.
- Console React UI stays untested (matches repo convention — console has no test runner).

## Scope summary

**In v1:** Guardrails view; `/events` route; `/demo-api` proxy; catalog (6 manifest policies
+ 3 platform-safety bonus cards); live feed; runtime proof-by-fetch; held-counters; the two
tests above.

**Out / deferred:** Approach-C split-screen; contrast card; websockets; counter persistence;
auth; any enforcement-engine change.

## Risks

- The Guardrails runtime tests require the demo API (`:4500`) to be running. Acceptable for a
  live demo; surfaced in the view (a clear "demo API unreachable" state on those cards).
- Fresh-nonce subjects accumulate in the feed during a long session — cosmetic; the feed is
  `limit`-capped.

## File-touch list

- `apps/control-plane/src/app.ts` — add `GET /v1/apps/:appId/events`.
- `apps/control-plane/test/*` — route test.
- `apps/console/vite.config.ts` — add `/demo-api` proxy.
- `apps/console/src/api.ts` — add `events()` + `registerBundle()`/`fetchDemo()` helpers.
- `apps/console/src/guardrails.ts` — **new** catalog + `eventToHuman()`.
- `apps/console/src/App.tsx` — **new** Guardrails view + nav entry.
- `apps/console/src/styles.css` — feed + card styles.
- `apps/demo/test/guardrails-catalog.e2e.test.ts` — **new** demo-honesty test.
