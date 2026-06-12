# Nebula demo

The reference app for Invariance v6: a Netflix-style UI made customizable by
natural language, with developer-defined invariants the model can never violate.

```sh
pnpm dev   # http://localhost:4321
```

By default the customization panel's agents call the Anthropic API — set
`NEXT_PUBLIC_ANTHROPIC_API_KEY` in `.env.local` (copy from `.env.example`).

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
