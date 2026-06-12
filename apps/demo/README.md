# Nebula demo

The reference app for Invariance v6: a Netflix-style UI made customizable by
natural language, with developer-defined invariants the model can never violate.

```sh
pnpm dev   # http://localhost:4321
```

By default the customization panel's agents call the Anthropic API through the
app's own `/api/llm` proxy route — set `ANTHROPIC_API_KEY` in `.env.local`
(copy from `.env.example`). The key is server-only: it never reaches the
browser, so the demo is safe to deploy and share.

## Developer dashboard (`/dev`)

`http://localhost:4321/dev` is the developer's side of Invariance. Every edit a
user makes — vibe prompt, slot edit, F2–F4 change, one-tap pack — lands
server-side as a new version with the prompt that produced it, a source badge,
a themed mini-Nebula preview, and a token diff against the previous version.
Older versions roll back with one click (append-only: a rollback is a new
version whose provenance says so).

The Invariants card is the lock/unlock surface: per-page customization levels
(0–4), a brand-accent lock (themes compile *around* a locked token — change the
whole vibe and the accent stays byte-identical), and locked sections users
cannot hide. Changes apply to the live app on the next edit; other sessions
pick them up on their next request.

Storage is file-backed under `apps/demo/.data/` (gitignored): theme version
history at `theme-history.json`, the lock overlay at `dev-config.json`. The
SDK talks to it through the stock `storage="api"` backend at `/api/themes`.

## Local LLM (Ollama)

For free local iteration you can point every agent at a local Ollama model instead
of Anthropic — no code change, only env. The agents already `JSON.parse` + zod-
revalidate + retry every structured call, so a weaker local model that returns
JSON-ish text works through the existing revalidation path.

1. Install and pull a model:

   ```sh
   brew install ollama
   ollama pull qwen2.5
   ```

2. Serve it with CORS open so the browser at `:4321` can reach `:11434`:

   ```sh
   OLLAMA_ORIGINS=* ollama serve
   ```

3. Set the env vars in `.env.local`:

   ```sh
   NEXT_PUBLIC_LLM_PROVIDER=openai-compatible
   NEXT_PUBLIC_LLM_BASE_URL=http://localhost:11434/v1
   NEXT_PUBLIC_LLM_MODEL=qwen2.5
   # optional: NEXT_PUBLIC_LLM_STRUCTURED_MODE=json_object   # if the server rejects json_schema
   ```

4. Run the demo:

   ```sh
   pnpm dev
   ```

Open the customization panel and type a vibe ("make it retro"). To swap back to
Claude, unset `NEXT_PUBLIC_LLM_PROVIDER` (and set the Anthropic key). If the local
model's themes feel weak, bump the model id (e.g. `qwen2.5:14b`) — no code change.

## Vibe wall (`/showcase`)

`http://localhost:4321/showcase` renders all ten theme packs at once, each on a
scaled-down Nebula card themed independently. The mechanism is wrapper-scoped
custom properties: each card sets the compiled `--inv-*` role tokens on its own
wrapper element (not `:root`), and because CSS custom properties cascade, the
card's subtree themes from those vars while its neighbours stay on theirs. It is
the "ten coherent vibes at a glance" shot for decks and screen recordings — no
LLM is involved, every card is `compileTheme(pack.spec)`.

## Designer smoke proof (`designer-smoke`)

`pnpm --filter @invariance/demo designer-smoke` runs the ten canonical vibe
prompts through the **real Designer against a live Ollama** and asserts each
returns a zod-valid StyleSpec that compiles to an AA-clean theme. It is the proof
that the OSS model produces coherent themes, not just that the compiler is sound.

This is a **manual proof, not part of `pnpm test`** — it is standalone, imported
by nothing, and skips cleanly (exit 0) when Ollama is unreachable. To run it,
have Ollama serving with the model pulled (see the Local LLM section), then:

```sh
pnpm --filter @invariance/demo designer-smoke
```

It reads `LLM_BASE_URL` (default `http://localhost:11434/v1`), `LLM_MODEL`
(default `qwen2.5`), `LLM_PROVIDER` (default `openai-compatible`), and
`LLM_STRUCTURED_MODE` (default `json_schema`). It prints a per-vibe table and
exits non-zero only if a vibe actually failed while Ollama was up.
