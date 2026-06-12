# Nebula demo (apps/demo) — single-instance deploy image for Render / Railway /
# Fly / any Docker host. The demo's /api stores are file-backed, so it needs a
# real persistent filesystem (mount a volume at /data), NOT serverless lambdas.
#
#   docker build -t nebula-demo .
#   docker run -p 4321:4321 -e ANTHROPIC_API_KEY=sk-... -v nebula-data:/data nebula-demo

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4321
ENV HOSTNAME=0.0.0.0
# File-backed stores (theme history, dev-config) live here — mount a volume.
ENV INVARIANCE_DATA_DIR=/data

# Standalone output is traced from the monorepo root, so it carries the
# repo-relative layout: the server entry is apps/demo/server.js.
COPY --from=builder /repo/apps/demo/.next/standalone ./
COPY --from=builder /repo/apps/demo/.next/static ./apps/demo/.next/static
COPY --from=builder /repo/apps/demo/public ./apps/demo/public

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4321
CMD ["node", "apps/demo/server.js"]
