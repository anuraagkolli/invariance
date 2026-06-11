import { serve, type ServerType } from "@hono/node-server";
import { createControlPlane, type ControlPlane } from "@invariance/control-plane";
import type { AddressInfo } from "node:net";
import manifest from "../invariance.manifest.json";

export interface TestControlPlane extends ControlPlane {
  url: string;
  server: ServerType;
  close: () => Promise<void>;
}

/** Boots an in-process control plane on an ephemeral port. */
export async function startControlPlane(): Promise<TestControlPlane> {
  const cp = createControlPlane();
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: cp.app.fetch, port: 0 }, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    ...cp,
    server,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function publishDemoManifest(cpUrl: string, overrides: object = {}) {
  const res = await fetch(`${cpUrl}/v1/apps/streamline/manifest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...manifest, ...overrides }),
  });
  if (!res.ok) throw new Error(`manifest publish failed: ${res.status} ${await res.text()}`);
  return res.json();
}
