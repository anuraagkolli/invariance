# Invariance — Demo Runbook

One command brings up the whole stack; this is the script to run it by.

## Prerequisites (one-time)

- **pnpm** (this repo is pnpm-only) and Node ≥ 20, deps installed (`pnpm install`).
- **Ollama** for the "type a vibe" path: `ollama serve` running, with `ollama pull qwen2.5`.
  (Theme **pack chips** work without it; only *typed* vibes need the model.)

## Start / stop

```bash
pnpm demo        # builds @invariance/design, then starts CP → seed → Nebula → Console
pnpm demo:stop   # tears the whole stack down
```

`pnpm demo` is safe to re-run: it stops any old stack and starts clean. It prints the
URLs and the model in use; logs land in `.demo/logs/`.

| Surface | URL | What it is |
|---|---|---|
| Showcase (end user) | http://localhost:4321 | Nebula — the app that re-themes itself |
| Console (developer) | http://localhost:4600 | invariants · themes · guardrails |
| Control plane API | http://localhost:4400 | registry / authoring / verification |

> ⚠️ **Don't restart the control plane mid-demo.** Its store is in-memory, so a restart
> drops every applied theme/mod (and re-rolls its signing key). If anything looks off,
> just `pnpm demo` again for a clean slate.

---

## The demo (≈ 5 minutes)

### Act 1 — Users customize the look; the app stays coherent (design plane)

1. Open the **Showcase** (http://localhost:4321). Click the **✨** panel.
2. Either tap a **theme pack** chip (instant, no LLM) **or** type a vibe — e.g.
   *"make it a warm sunset — deep orange and magenta"*. The whole UI re-themes;
   **AA contrast and palette harmony are compiled in**, never asked of the model.
   A theme **restyles *and* relayouts**: a blocky vibe — *"make it retro"* / brutalist /
   terminal (sharp corners, tight density) — resolves to the *grid* layout profile and turns
   the home carousels into grids; soft or roomy vibes keep the scroll-snap carousels. (The
   StyleSpec→profile map is deterministic; the row swap is the live F4 `CarouselRow→GridRow`.)
3. Open the **Console → Themes** (http://localhost:4600/#/themes). The edit shows up as a
   new version **with the exact prompt that produced it** (a `pipeline` / `pack` badge).
4. Click **Roll back** on an earlier version → reload the Showcase → it renders the
   rolled-back theme. (Rollback is append-only — history stays intact.)

### Act 2 — Developers set look-invariants the model can't cross (design plane)

5. **Console → Invariants** (http://localhost:4600/#/invariants). The controls (page
   customization levels, lockable sections, brand-accent lock, chroma cap, contrast floor)
   are rendered from the app's **manifest `designSurface`** — not hardcoded.
6. Lock the accent or raise the contrast floor → **Apply**. Future themes recompile within
   those bounds; a conflicting stored theme drops to base styling on the user's next load.

### Act 3 — Business-logic invariants the model can't violate (logic plane)

7. **Console → Guardrails** (http://localhost:4600/#/guardrails). Each **"Test:"** button
   fires a *real* violation attempt against the running governed API:
   - **Authoring** cheats are rejected before signing (verifier 422 with a precise reason).
   - **Runtime** cheats are signed but **rolled back in the sandbox** at execution — and
     show up in the live enforcement feed as `hook_policy_violation`.
8. Point out the split: two enforcement engines (design compiler for *look*; verifier +
   QuickJS sandbox for *logic*), one developer surface (the Console).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Typed vibes do nothing; pack chips work | Ollama not running / model not pulled. `ollama serve` + `ollama pull qwen2.5`. |
| A guardrail / theme behaves oddly after you restarted the CP | Re-run `pnpm demo` (clean slate). Never restart the CP alone mid-demo. |
| Port already in use | `pnpm demo:stop`, then `pnpm demo`. |
| Want to watch a server | `tail -f .demo/logs/{control-plane,nebula,console}.log` |

## Notes / known edges (not demo-blocking)

- **Don't demo authoring a *logic* mod from a natural-language prompt.** Weak local models
  can mis-declare a hook's write capability (passes the static verifier, discarded at
  runtime → silent no-op). The demo drives logic invariants via the Console Guardrails
  (vetted drafts), which is reliable. The *theme* prompt path is demo-reliable.
- For durability across CP restarts (not needed for a live demo) set a persistent store
  (`DATABASE_URL`) **and** persistent signing keys (`INVARIANCE_SIGNING_*`) — otherwise an
  ephemeral key per CP process invalidates previously-signed bundles.
