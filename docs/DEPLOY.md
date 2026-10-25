# Deploying the control plane

The data plane (client/server SDKs) runs in the customer's infrastructure;
only the control plane deploys here. Stack: Render (free plan, Docker) +
Neon Postgres + any OpenAI-compatible LLM endpoint for authoring.

## 1. Database (Neon)

Create a project at https://neon.tech, copy the **pooled** connection string
(`...-pooler.<region>.aws.neon.tech`). Schema migrations run automatically at
boot, so the database needs nothing besides existing.

Avoid Render's free Postgres: free databases are deleted after 90 days.

## 2. Signing keypair

With a durable registry the platform keypair must survive restarts, or
persisted bundles would fail signature verification after a redeploy:

```sh
pnpm -F @invariance/control-plane exec tsx -e "
  import { generateSigningKeyPair } from '@invariance/schema/signing';
  console.log(JSON.stringify(generateSigningKeyPair(), null, 2));
"
```

Map the output to `INVARIANCE_SIGNING_PRIVATE_KEY` (`privateKeyPem`),
`INVARIANCE_SIGNING_PUBLIC_KEY` (`publicKeyPem`), `INVARIANCE_SIGNING_KEY_ID`
(`keyId`). Keep the private key out of the repo.

## 3. Authoring backend

Any OpenAI-compatible endpoint works (`INVARIANCE_LLM_BASE_URL`,
`INVARIANCE_LLM_MODEL`, optional `INVARIANCE_LLM_API_KEY`), or set
`ANTHROPIC_API_KEY` instead.

**Temporary: tunnel to a locally running Ollama.** The deployed control
plane cannot reach `localhost`, so expose Ollama through a tunnel:

```sh
OLLAMA_CONTEXT_LENGTH=16384 ollama serve   # large ctx: the manifest is in-prompt
cloudflared tunnel --url http://localhost:11434
```

Use the printed URL as `INVARIANCE_LLM_BASE_URL=https://<tunnel>/v1` with
`INVARIANCE_LLM_MODEL=qwen2.5-coder:3b`. Caveats: the laptop must stay awake;
quick tunnels get a fresh URL on every restart (update the env var); anyone
with the URL can use the model, so treat it as throwaway. For something
durable without local hardware, point the same vars at OpenRouter.

## 4. Deploy (Render)

`render.yaml` at the repo root is a Blueprint: in the Render dashboard,
**New → Blueprint**, connect the repo, and fill in the `sync: false` env vars
when prompted. Deploys build the root `Dockerfile` on Render's builders — no
local Docker needed. Health checks hit `/healthz`.

Free-plan behavior: the instance spins down after ~15 idle minutes; the next
request cold-starts in ~30–60s. SDK runtimes fail open to base app behavior,
so a sleeping control plane never breaks the host app.

## 5. Smoke test

```sh
curl https://<service>.onrender.com/healthz
pnpm -F @invariance/demo seed   # with INVARIANCE_REGISTRY=https://<service>.onrender.com
curl -X POST https://<service>.onrender.com/v1/apps/streamline/subjects/demo-user/prompts \
  -H 'content-type: application/json' -d '{"prompt":"make the accent color teal"}'
```
