import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AppManifestSchema,
  OnboardingPlanSchema,
  type AppManifest,
  type DesignConfig,
  type DesignToken,
  type OnboardingPlan,
  type OnboardingPatch,
  type OnboardingSession,
} from "@invariance/schema";
import type { ColorObservation } from "@invariance/design/server";
import type { Store } from "../../store";
import { publishManifest } from "../registry";
import { prepareRepo, type PrepareInput } from "./prepare";
import {
  discoverArchetypes,
  discoverEndpoints,
  extractSections,
  loadProject,
  observeCssColors,
} from "./scan";
import { nameSections, suggestArchetypeLevel } from "./name";
import { buildFonts, buildTokens, seedRoles } from "./palette";

// --- Plan construction -----------------------------------------------------

interface PkgInfo {
  packageName: string | null;
  frameworks: { react: boolean; next: boolean; express: boolean };
}

function readPkg(root: string): PkgInfo {
  const p = join(root, "package.json");
  if (!existsSync(p)) {
    return { packageName: null, frameworks: { react: false, next: false, express: false } };
  }
  try {
    const pkg = JSON.parse(readFileSync(p, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return {
      packageName: pkg.name ?? null,
      frameworks: { react: "react" in deps, next: "next" in deps, express: "express" in deps },
    };
  } catch {
    return { packageName: null, frameworks: { react: false, next: false, express: false } };
  }
}

/** Scan a prepared repo into a reviewable OnboardingPlan (deterministic). */
export function buildPlan(
  appId: string,
  root: string,
  repo: { source: "url" | "path"; ref: string },
): OnboardingPlan {
  const { packageName, frameworks } = readPkg(root);
  const project = loadProject(root);
  const discovered = discoverArchetypes(root);
  const endpoints = discoverEndpoints(root);

  const cssColors = observeCssColors(root);
  const observations: ColorObservation[] = [...cssColors];
  const usageByHex = new Map<string, number>();
  for (const obs of cssColors) {
    usageByHex.set(obs.hex.toLowerCase(), (usageByHex.get(obs.hex.toLowerCase()) ?? 0) + 1);
  }
  const fonts = new Set<string>();
  const warnings: string[] = [];

  const archetypes = discovered.map((a) => {
    const { sections: raws, fonts: pageFonts } = extractSections(project, root, a.pageFile);
    pageFonts.forEach((f) => fonts.add(f));
    for (const raw of raws) {
      for (const hex of raw.colors) {
        observations.push({ hex, kind: "bg" });
        usageByHex.set(hex.toLowerCase(), (usageByHex.get(hex.toLowerCase()) ?? 0) + 1);
      }
    }
    const sections = nameSections(a.key, a.pageFile, raws);
    if (sections.length === 0) {
      warnings.push(`No sections segmented for ${a.key} (${a.pageFile}).`);
    }
    return {
      key: a.key,
      route: a.route,
      pageFile: a.pageFile,
      defaultLevel: suggestArchetypeLevel(sections),
      sections,
    };
  });

  const { roles } = seedRoles(observations);
  const tokens = buildTokens(roles, usageByHex);

  if (archetypes.length === 0) {
    warnings.push("No page archetypes found — is this a React + file-routed app?");
  }

  return OnboardingPlanSchema.parse({
    appId,
    repo,
    packageName,
    frameworks,
    archetypes,
    tokens,
    roles,
    fonts: buildFonts(fonts),
    endpoints,
    warnings,
  });
}

// --- Sessions --------------------------------------------------------------

/**
 * Ephemeral onboarding sessions. Kept in-process (the plan is reviewed in one
 * sitting and persisted only at finalize) so the durable Store stays focused on
 * the runtime entities.
 */
export class OnboardingSessions {
  private sessions = new Map<string, OnboardingSession>();

  constructor(private readonly monorepoRoot: string) {}

  async scan(appId: string, input: PrepareInput): Promise<OnboardingSession> {
    const prepared = await prepareRepo(input, this.monorepoRoot);
    try {
      const plan = buildPlan(appId, prepared.root, {
        source: prepared.source,
        ref: prepared.ref,
      });
      const now = new Date().toISOString();
      const session: OnboardingSession = {
        sessionId: randomUUID(),
        appId,
        status: "ready",
        plan,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(session.sessionId, session);
      return session;
    } finally {
      await prepared.cleanup();
    }
  }

  get(sessionId: string): OnboardingSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /** Apply developer edits (names, levels, token locks) to a session's plan. */
  patch(sessionId: string, patch: OnboardingPatch): OnboardingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const plan = session.plan;
    if (patch.sections) {
      const byId = new Map(patch.sections.map((s) => [s.id, s]));
      for (const arch of plan.archetypes) {
        for (const sec of arch.sections) {
          const edit = byId.get(sec.id);
          if (!edit) continue;
          if (edit.name !== undefined) sec.name = edit.name;
          if (edit.level !== undefined) sec.level = edit.level;
          if (edit.aliases !== undefined) sec.aliases = edit.aliases;
        }
        arch.defaultLevel = suggestArchetypeLevel(arch.sections);
      }
    }
    if (patch.archetypes) {
      const byKey = new Map(patch.archetypes.map((a) => [a.key, a]));
      for (const arch of plan.archetypes) {
        const edit = byKey.get(arch.key);
        if (edit?.defaultLevel !== undefined) arch.defaultLevel = edit.defaultLevel;
      }
    }
    if (patch.tokens) {
      const byRole = new Map(patch.tokens.map((t) => [t.role, t]));
      for (const tok of plan.tokens) {
        const edit = byRole.get(tok.role);
        if (!edit) continue;
        if (edit.locked !== undefined) tok.locked = edit.locked;
        if (edit.value !== undefined) {
          tok.value = edit.value;
          plan.roles[tok.role] = edit.value;
        }
      }
    }

    session.plan = OnboardingPlanSchema.parse(plan);
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /** Turn the reviewed plan into a published manifest + design-config. */
  async finalize(sessionId: string, store: Store): Promise<OnboardingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = "finalizing";
    try {
      const { manifest, designConfig } = planToArtifacts(session.plan, undefined);
      const current = await store.currentManifest(session.appId);
      const versioned = { ...manifest, version: nextVersion(current?.version) };
      const { staleCount } = await publishManifest(store, session.appId, versioned);
      await store.putDesignConfig(session.appId, designConfig);
      session.status = "finalized";
      session.finalized = { manifestVersion: versioned.version, staleMods: staleCount };
      session.updatedAt = new Date().toISOString();
      return session;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
}

function nextVersion(current: string | undefined): string {
  if (!current) return "1.0.0";
  const [maj, min, patch] = current.split(".").map((n) => Number(n) || 0);
  return `${maj}.${(min ?? 0) + 1}.0`;
}

function tokenKind(name: string): DesignToken["kind"] {
  if (/font/.test(name)) return "typography";
  if (/radius/.test(name)) return "radius";
  if (/shadow/.test(name)) return "shadow";
  if (/space|sidebar-w|card-w|card-aspect|hero|section-gap|density|gap/.test(name)) return "spacing";
  if (/surface|text|accent|border|ring/.test(name)) return "color";
  return "other";
}

/**
 * The Stage-4 artifact generator (manifest + design-config). Pure: the same
 * plan always produces the same artifacts, so the output is reviewable.
 */
export function planToArtifacts(
  plan: OnboardingPlan,
  version = "1.0.0",
): { manifest: AppManifest; designConfig: DesignConfig } {
  const designTokens: DesignToken[] = Object.entries(plan.roles).map(([name, value]) => ({
    name,
    kind: tokenKind(name),
    value,
    description: "invariance role token (compiler-managed)",
  }));

  const endpoints = plan.endpoints.map((e) => ({
    id: `${e.method} ${e.path}`,
    method: e.method,
    path: e.path,
  }));

  const sectionNames = [
    ...new Set(plan.archetypes.flatMap((a) => a.sections.map((s) => s.name))),
  ];

  const manifest = AppManifestSchema.parse({
    appId: plan.appId,
    version,
    designTokens,
    components: [],
    endpoints,
    policies: [],
    createdAt: new Date().toISOString(),
    designSurface: {
      pages: plan.archetypes.map((a) => ({ route: a.key, defaultLevel: a.defaultLevel })),
      sections: sectionNames,
    },
  });

  const pageLevels: Record<string, number> = {};
  for (const a of plan.archetypes) pageLevels[a.key] = a.defaultLevel;

  const lockedSections = [
    ...new Set(
      plan.archetypes.flatMap((a) => a.sections.filter((s) => s.level === 0).map((s) => s.name)),
    ),
  ];

  const accentToken = plan.tokens.find((t) => t.role === "--inv-accent");
  const accentLock =
    accentToken?.locked && /^#[0-9a-fA-F]{6}$/.test(accentToken.value)
      ? accentToken.value
      : undefined;

  const designConfig: DesignConfig = {
    pageLevels,
    lockedSections,
    ...(accentLock ? { accentLock } : {}),
  };

  return { manifest, designConfig };
}
