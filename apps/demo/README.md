# Nebula demo

The reference app for Invariance v6: a Netflix-style UI made customizable by
natural language, with developer-defined invariants the model can never violate.

```sh
pnpm dev   # http://localhost:4321
```

By default the customization panel's agents run an **open-source model —
`qwen2.5` via Ollama** — through the app's own `/api/llm` proxy route. No API
key, no cloud calls:

```sh
brew install ollama
ollama pull qwen2.5
ollama serve      # leave running; no OLLAMA_ORIGINS needed (the proxy is server-side)
pnpm dev
```

The agents `JSON.parse` + zod-revalidate + retry every structured call, so a
local model that returns JSON-ish text works through the existing revalidation
path. If themes feel weak, bump the model (`ollama pull qwen2.5:14b`, set
`LLM_MODEL=qwen2.5:14b`) — no code change.

## Deploying

The repo root has a `Dockerfile` that builds the demo as a self-contained image
(Next standalone output, traced across the monorepo). Any Docker host with a
persistent disk works — Render, Railway, Fly, a VPS. **Not serverless**: the
`/api` stores are file-backed and need a real filesystem.

1. Point the host at the repo root (it auto-detects the Dockerfile).
2. Make the model reachable from the container: run Ollama on the same host (or
   as a sidecar) and set `LLM_BASE_URL` to its OpenAI endpoint, e.g.
   `http://host.docker.internal:11434/v1` or the sidecar's address. Optionally
   `LLM_MODEL` (default `qwen2.5`). Prompts fail gracefully and packs still
   work if the model is unreachable.
3. Set `NEXT_PUBLIC_SITE_URL=https://your-domain` (absolute OG-image links).
4. Mount a volume at `/data` so theme history and dev-config survive restarts.

Local check of the exact image behavior (with Ollama running on the host):

```sh
docker build -t nebula-demo .
docker run -p 4321:4321 -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -v nebula-data:/data nebula-demo
```

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

## LLM providers

Three modes, swappable by env alone (`.env.example` documents every knob):

- **Default — open-source via the proxy.** The browser calls `/api/llm`; the
  server forwards to an OpenAI-compatible endpoint (`LLM_BASE_URL`, default
  `http://localhost:11434/v1`) and **pins the model server-side**
  (`LLM_MODEL`, default `qwen2.5`). No CORS setup, nothing exposed to the
  browser, deployable as-is. `LLM_API_KEY` covers hosted OpenAI-compatible
  endpoints; Ollama ignores it.
- **Claude (opt-in).** `NEXT_PUBLIC_LLM_PROVIDER=anthropic` plus server-side
  `ANTHROPIC_API_KEY`. Same proxy route, Anthropic wire shape, model allowlist;
  the key never reaches the browser.
- **Browser-direct (legacy local mode).**
  `NEXT_PUBLIC_LLM_PROVIDER=openai-compatible` with
  `NEXT_PUBLIC_LLM_BASE_URL`/`NEXT_PUBLIC_LLM_MODEL` talks to the model server
  straight from the browser — requires `OLLAMA_ORIGINS=* ollama serve` for
  CORS. Kept for poking at the transport without the proxy in between.

If a server/model rejects native `json_schema` structured outputs, set
`NEXT_PUBLIC_LLM_STRUCTURED_MODE=json_object` — the schema is embedded in the
prompt instead and the agents' zod revalidation + retry absorb the looser
guarantee.

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
have Ollama serving with the model pulled (see the top of this README), then:

```sh
pnpm --filter @invariance/demo designer-smoke
```

It reads `LLM_BASE_URL` (default `http://localhost:11434/v1`), `LLM_MODEL`
(default `qwen2.5`), `LLM_PROVIDER` (default `openai-compatible`), and
`LLM_STRUCTURED_MODE` (default `json_schema`). It prints a per-vibe table and
exits non-zero only if a vibe actually failed while Ollama was up.
