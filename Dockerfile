# Control-plane image. Build from the repo root (workspace context):
#   docker build -t invariance-control-plane .
# Workspace packages ship TS source directly (no build step), so the image
# runs src/main.ts under tsx — same as `pnpm dev`, minus the dev deps.
FROM node:22-slim

WORKDIR /repo
RUN corepack enable

# Manifests first so dependency layers cache across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/control-plane/package.json apps/control-plane/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile --prod --filter @invariance/control-plane...

COPY packages/schema packages/schema
COPY apps/control-plane apps/control-plane

ENV NODE_ENV=production
ENV PORT=4400
EXPOSE 4400

# Config comes from the environment:
#   DATABASE_URL                          postgres registry (omit -> in-memory)
#   INVARIANCE_SIGNING_{PRIVATE_KEY,PUBLIC_KEY,KEY_ID}   persistent keypair
#   INVARIANCE_LLM_BASE_URL / _MODEL / _API_KEY          OpenAI-compat authoring
#   ANTHROPIC_API_KEY                                    or Anthropic authoring
#   INVARIANCE_AUTHORING_MAX_ATTEMPTS                    repair-loop budget
CMD ["pnpm", "--filter", "@invariance/control-plane", "start"]
