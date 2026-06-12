import { serve } from "@hono/node-server";
import { createControlPlane } from "@invariance/control-plane";
import { AppManifestSchema } from "@invariance/schema";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { draftManifest, type JsonLlm } from "./draft";
import { renderGuide } from "./guide";
import { llmFromEnv } from "./llm";
import { scanRepo } from "./scan";

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

export interface InitOutcome {
  manifestFile: string;
  guideFile: string;
  source: "ai" | "scan";
  counts: { tokens: number; endpoints: number; components: number };
}

/**
 * `invariance init [--app <id>] [--no-ai]`: scan the repo, draft the App
 * Manifest (model-refined when one is configured, deterministic otherwise),
 * and emit INVARIANCE.md with framework-specific SDK wiring. Files are
 * written for review/commit — init never edits existing source.
 */
export async function init(flags: Record<string, string>, cwd = process.cwd()): Promise<string> {
  return (await initDetailed(flags, cwd)).manifestFile;
}

export async function initDetailed(
  flags: Record<string, string>,
  cwd = process.cwd(),
  llmOverride?: JsonLlm | null,
): Promise<InitOutcome> {
  const manifestFile = resolve(cwd, "invariance.manifest.json");
  if (existsSync(manifestFile)) {
    throw new CliError(`refusing to overwrite existing ${manifestFile}`);
  }

  const scan = scanRepo(cwd);
  const appId = flags.app ?? scan.packageName ?? "my-app";
  const llm = flags["no-ai"] === "true" ? null : (llmOverride !== undefined ? llmOverride : llmFromEnv());
  const draft = await draftManifest(scan, appId, llm);

  await writeFile(manifestFile, `${JSON.stringify(draft.manifest, null, 2)}\n`);
  const guideFile = resolve(cwd, "INVARIANCE.md");
  await writeFile(guideFile, renderGuide(scan, draft.manifest));

  return {
    manifestFile,
    guideFile,
    source: draft.source,
    counts: {
      tokens: draft.manifest.designTokens.length,
      endpoints: draft.manifest.endpoints.length,
      components: draft.manifest.components.length,
    },
  };
}

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
  invariance init [--app <id>] [--no-ai]                scan the repo, draft the manifest,
                                                        and emit INVARIANCE.md wiring guide
  invariance manifest publish [--file <path>]           publish a manifest version
                              [--registry <url>] [--app <id>]
  invariance dev [--port <port>] [--manifest <path>]    run a local control plane

Environment:
  INVARIANCE_REGISTRY        default registry url (http://localhost:4400)
  INVARIANCE_LLM_BASE_URL    OpenAI-compatible endpoint for init drafting + dev authoring
  INVARIANCE_LLM_MODEL       model id for the endpoint above
  ANTHROPIC_API_KEY          alternative model backend
`;

export async function run(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const { flags, rest } = parseFlags(args);
  try {
    switch (command) {
      case "init": {
        const outcome = await initDetailed(flags);
        console.log(`created ${outcome.manifestFile}`);
        console.log(`created ${outcome.guideFile}`);
        console.log(
          `manifest drafted from ${outcome.source === "ai" ? "repo scan + model refinement" : "repo scan"}: ` +
            `${outcome.counts.tokens} tokens, ${outcome.counts.endpoints} endpoints, ${outcome.counts.components} components`,
        );
        if (outcome.source === "scan" && flags["no-ai"] !== "true") {
          console.log(
            "tip: set INVARIANCE_LLM_BASE_URL (or ANTHROPIC_API_KEY) and re-run for a model-refined draft",
          );
        }
        console.log("\nnext: review both files, then follow INVARIANCE.md");
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
          process.env.INVARIANCE_LLM_BASE_URL
            ? `authoring agent: ${process.env.INVARIANCE_LLM_BASE_URL} (${process.env.INVARIANCE_LLM_MODEL ?? "default model"})`
            : process.env.ANTHROPIC_API_KEY
              ? "authoring agent: Anthropic API"
              : "authoring agent: disabled (set INVARIANCE_LLM_BASE_URL or ANTHROPIC_API_KEY to enable prompts)",
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
