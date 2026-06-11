import { serve } from "@hono/node-server";
import { createControlPlane } from "@invariance/control-plane";
import { AppManifestSchema } from "@invariance/schema";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Tiny flag parser: `--name value` and `--name=value`; no dependencies. */
export function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[arg.slice(2)] = next;
        i++;
      } else {
        flags[arg.slice(2)] = "true";
      }
    }
  }
  return { flags, rest };
}

export class CliError extends Error {}

const DEFAULT_REGISTRY = () => process.env.INVARIANCE_REGISTRY ?? "http://localhost:4400";

export interface PublishResult {
  appId: string;
  version: string;
  staleMods: number;
}

/** `invariance manifest publish --file <path> [--registry <url>] [--app <id>]` */
export async function publishManifest(flags: Record<string, string>): Promise<PublishResult> {
  const file = resolve(flags.file ?? "invariance.manifest.json");
  if (!existsSync(file)) {
    throw new CliError(`manifest file not found: ${file}`);
  }
  let manifest;
  try {
    manifest = AppManifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (err) {
    throw new CliError(`invalid manifest: ${(err as Error).message}`);
  }
  const appId = flags.app ?? manifest.appId;
  if (appId !== manifest.appId) {
    throw new CliError(`--app ${appId} does not match manifest appId ${manifest.appId}`);
  }
  const registry = flags.registry ?? DEFAULT_REGISTRY();
  const res = await fetch(`${registry}/v1/apps/${appId}/manifest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  if (!res.ok) {
    throw new CliError(`publish failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { version: string; staleMods: number };
  return { appId, version: body.version, staleMods: body.staleMods };
}

const MANIFEST_TEMPLATE = {
  appId: "my-app",
  version: "1.0.0",
  designTokens: [
    { name: "--accent", kind: "color", value: "#7c5cff", description: "Primary accent" },
  ],
  components: [],
  endpoints: [],
  policies: [],
};

/** `invariance init [--app <id>]`: scaffold a manifest + integration notes. */
export async function init(flags: Record<string, string>, cwd = process.cwd()): Promise<string> {
  const file = resolve(cwd, "invariance.manifest.json");
  if (existsSync(file)) {
    throw new CliError(`refusing to overwrite existing ${file}`);
  }
  const manifest = {
    ...MANIFEST_TEMPLATE,
    appId: flags.app ?? MANIFEST_TEMPLATE.appId,
    createdAt: new Date().toISOString(),
  };
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

export const INIT_INSTRUCTIONS = `
Next steps:

1. Describe your app in invariance.manifest.json:
   - designTokens: the CSS custom properties users may restyle
   - components/slots: the UI areas users may override
   - endpoints: the API seam hooks may transform
   - policies: the invariants every mod must respect

2. Wire the client SDK (React):
     import { InvarianceProvider, PromptWidget } from "@invariance/client/react";
     <InvarianceProvider config={{ registryUrl, appId, subjectId }}>
       <App />
       <PromptWidget />
     </InvarianceProvider>

3. Wire the server SDK (Express):
     import { createInvarianceMiddleware } from "@invariance/server";
     app.use(createInvarianceMiddleware({ registryUrl, appId }));

4. Publish the manifest on every release:
     invariance manifest publish --file invariance.manifest.json

5. Start a local control plane for development:
     invariance dev
`;

export interface DevServer {
  port: number;
  url: string;
  keyId: string;
  close: () => Promise<void>;
}

/** `invariance dev [--port 4400] [--manifest <file>]`: local control plane. */
export async function dev(flags: Record<string, string>): Promise<DevServer> {
  const requestedPort = Number(flags.port ?? process.env.PORT ?? 4400);
  const { app, keys } = createControlPlane();
  const server = await new Promise<ReturnType<typeof serve>>((resolveServer) => {
    const s = serve({ fetch: app.fetch, port: requestedPort }, () => resolveServer(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://localhost:${port}`;

  const manifestFile = resolve(flags.manifest ?? "invariance.manifest.json");
  if (existsSync(manifestFile)) {
    const result = await publishManifest({ file: manifestFile, registry: url });
    console.log(`published ${result.appId}@${result.version} from ${manifestFile}`);
  }

  return {
    port,
    url,
    keyId: keys.keyId,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

export const USAGE = `invariance — control-plane tooling

Usage:
  invariance init [--app <id>]                          scaffold invariance.manifest.json
  invariance manifest publish [--file <path>]           publish a manifest version
                              [--registry <url>] [--app <id>]
  invariance dev [--port <port>] [--manifest <path>]    run a local control plane

Environment:
  INVARIANCE_REGISTRY   default registry url (http://localhost:4400)
  ANTHROPIC_API_KEY     enables the authoring agent in \`invariance dev\`
`;

export async function run(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const { flags, rest } = parseFlags(args);
  try {
    switch (command) {
      case "init": {
        const file = await init(flags);
        console.log(`created ${file}`);
        console.log(INIT_INSTRUCTIONS);
        return 0;
      }
      case "manifest": {
        if (rest[0] !== "publish") {
          console.error(USAGE);
          return 1;
        }
        const result = await publishManifest(flags);
        console.log(
          `published ${result.appId}@${result.version}` +
            (result.staleMods > 0 ? ` (${result.staleMods} mods marked stale)` : ""),
        );
        return 0;
      }
      case "dev": {
        const server = await dev(flags);
        console.log(`invariance control plane on ${server.url} (keyId ${server.keyId})`);
        console.log(
          process.env.ANTHROPIC_API_KEY
            ? "authoring agent: Anthropic API"
            : "authoring agent: disabled (set ANTHROPIC_API_KEY to enable prompts)",
        );
        return -1; // keep the process alive
      }
      default:
        console.error(USAGE);
        return command === undefined || command === "help" || command === "--help" ? 0 : 1;
    }
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    throw err;
  }
}
