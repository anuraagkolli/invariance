import { serve } from "@hono/node-server";
import { createControlPlane } from "./app";

const port = Number(process.env.PORT ?? 4400);
const { app, keys } = createControlPlane();

serve({ fetch: app.fetch, port }, () => {
  console.log(`invariance control plane listening on :${port} (keyId ${keys.keyId})`);
});
