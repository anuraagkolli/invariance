import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createControlPlane } from "./app";
import { migrate, PgStore } from "./pg/pg-store";
import type { Store } from "./store";

const port = Number(process.env.PORT ?? 4400);

async function buildStore(): Promise<Store | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined; // createControlPlane falls back to MemoryStore
  const pool = new Pool({ connectionString: url });
  await migrate(pool);
  if (!process.env.INVARIANCE_SIGNING_PRIVATE_KEY) {
    console.warn(
      "DATABASE_URL is set but signing keys are per-process: bundles persisted now " +
        "will fail verification after a restart. Set INVARIANCE_SIGNING_* for durable deployments.",
    );
  }
  console.log("control plane store: postgres");
  return new PgStore(pool);
}

const store = await buildStore();
const { app, keys } = createControlPlane({ store });

serve({ fetch: app.fetch, port }, () => {
  console.log(`invariance control plane listening on :${port} (keyId ${keys.keyId})`);
});
