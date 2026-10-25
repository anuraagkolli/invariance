import { AppManifestSchema, type AppManifest } from "@invariance/schema";
import type { RepoScan } from "./scan";

/** Calls a model and returns parsed JSON; injected so tests can fake it. */
export type JsonLlm = (system: string, user: string) => Promise<unknown>;

function tokenKind(name: string, value: string): AppManifest["designTokens"][number]["kind"] {
  const n = name.toLowerCase();
  if (/(radius|rounded)/.test(n)) return "radius";
  if (/shadow/.test(n)) return "shadow";
  if (/(font|text|type|leading|tracking)/.test(n)) return "typography";
  if (/(space|spacing|gap|margin|padding|size|width|height)/.test(n)) return "spacing";
  if (/^#|^(rgb|hsl|oklch|color)/.test(value.trim()) || /(color|bg|background|border|accent|primary|secondary)/.test(n)) {
    return "color";
  }
  return "other";
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The no-LLM baseline: exactly what the scan saw, valid by construction. */
export function manifestFromScan(scan: RepoScan, appId: string): AppManifest {
  return AppManifestSchema.parse({
    appId,
    version: "1.0.0",
    designTokens: scan.cssTokens.map((t) => ({
      name: t.name,
      kind: tokenKind(t.name, t.value),
      value: t.value,
      description: `from ${t.file}`,
    })),
    components: scan.components.map((c) => ({
      id: slug(c.name),
      name: c.name,
      description: `from ${c.file}`,
      slots: [],
    })),
    endpoints: scan.routes.map((r) => ({
      id: slug(`${r.method} ${r.path}`),
      method: r.method,
      path: r.path,
      description: `from ${r.file}`,
    })),
    policies: [],
    createdAt: new Date().toISOString(),
  });
}

const SYSTEM_PROMPT = `You draft an Invariance App Manifest: the contract describing what end users may customize in a web app (design tokens, component slots, API endpoints) and what must always hold (policies).

Respond with ONLY a JSON object of this shape:
{
  "appId": "<id>", "version": "1.0.0",
  "designTokens": [{"name":"--x","kind":"color|spacing|typography|radius|shadow|other","value":"<css>","description":"..."}],
  "components": [{"id":"kebab-id","name":"ComponentName","description":"...","slots":[{"name":"slotName","description":"..."}]}],
  "endpoints": [{"id":"kebab-id","method":"GET|POST|PUT|PATCH|DELETE","path":"/api/...","description":"..."}],
  "policies": [],
  "createdAt": "<ISO datetime>"
}

Rules:
- Start from the scan results; keep every discovered token and endpoint, improving names/descriptions. Never invent endpoints or tokens the scan did not find.
- Component slots: propose 1-3 plausible named slots only for clearly UI-shell components (cards, headers, rows); otherwise leave slots [].
- ids must be unique kebab-case; every policy's endpointId must reference a listed endpoint.
- policies: propose at most 2-3 field-constraint policies ONLY when a field is obviously sensitive (price, role, permission, total); use {"type":"field-constraint","id":"...","endpointId":"...","fieldPath":"...","constraint":{"immutable":true}}. When unsure, return [].
- version must be semver; createdAt an ISO datetime.`;

export interface DraftResult {
  manifest: AppManifest;
  source: "ai" | "scan";
  attempts: number;
}

/**
 * Manifest drafting with the same verifier-in-the-loop shape as authoring:
 * the model proposes, zod judges, failures feed back. Falls back to the
 * deterministic scan manifest when no model is configured or every attempt
 * fails.
 */
export async function draftManifest(
  scan: RepoScan,
  appId: string,
  llm: JsonLlm | null,
  maxAttempts = 3,
): Promise<DraftResult> {
  const fallback = manifestFromScan(scan, appId);
  if (!llm) return { manifest: fallback, source: "scan", attempts: 0 };

  let feedback = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const user =
      `appId: ${appId}\n\nRepo scan results:\n${JSON.stringify(
        {
          frameworks: scan.frameworks,
          cssTokens: scan.cssTokens,
          routes: scan.routes,
          components: scan.components.slice(0, 50),
        },
        null,
        2,
      )}` + (feedback ? `\n\nYour previous draft was invalid:\n${feedback}\nReturn a corrected manifest.` : "");

    let raw: unknown;
    try {
      raw = await llm(SYSTEM_PROMPT, user);
    } catch (err) {
      feedback = `request failed: ${(err as Error).message}`;
      continue;
    }
    const parsed = AppManifestSchema.safeParse(
      typeof raw === "object" && raw !== null ? { ...raw, appId } : raw,
    );
    if (parsed.success) return { manifest: parsed.data, source: "ai", attempts: attempt };
    feedback = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
  }
  return { manifest: fallback, source: "scan", attempts: maxAttempts };
}
