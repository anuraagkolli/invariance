import { z } from "zod";
import { FontStackId as FontStackIdSchema, type StyleSpec } from "../spec/index.js";
import type { ContrastTier, SeedId, RoleId } from "../roles/index.js";
import type { AppManifest } from "../manifest/index.js";

// FontStackId's TYPE alias is intentionally excluded from the roles barrel (the zod VALUE is the
// reachable surface). Derive the type from it (= string).
type FontStackId = z.infer<typeof FontStackIdSchema>;

// The non-deterministic stages — BOTH sit BEFORE the wall. MockAgent and the real qwen-backed agent
// implement this. Plane-agnostic contracts, so they live in the shared core (both planes + the demo
// implement/consume the same Agent).
export interface Agent {
  // Stage 1: Gatekeeper (cheap LLM, NOT the gate) — one classification call.
  gatekeep(input: GatekeeperInput): Promise<GatekeeperResult>;
  // Stage 2: Designer (quality LLM) — the one creative call. Emits a SPARSE StyleSpec as raw JSON.
  design(input: DesignerInput): Promise<DesignerResult>;
}

export type GateClassification =
  | "in_scope_styling"
  | "out_of_scope"
  | "targets_locked_invariant"
  | "abuse_or_injection";

export type GatekeeperInput = { prompt: string; envelope: ConstraintEnvelope };
export type GatekeeperResult = { classification: GateClassification; reason?: string };

export type DesignerInput = { prompt: string; draft: StyleSpec; envelope: ConstraintEnvelope };
// The Designer returns RAW JSON (unknown) — it crosses the wall via parseSpec, never trusted.
export type DesignerResult = { specJson: unknown };

// The constraint envelope — manifest invariants fed to the LLM stages so they propose in-bounds.
// A UX/cost optimization only; the wall + verifier remain the enforcement.
export type ConstraintEnvelope = {
  contrastFloor: { tier: ContrastTier };
  locks: (SeedId | RoleId)[];
  allowedFonts: Array<{ id: FontStackId; stack: string }>;
  chromaCap: number;
  defaultSeeds: AppManifest["defaultSeeds"];
};

export function buildEnvelope(manifest: AppManifest): ConstraintEnvelope {
  return {
    contrastFloor: { tier: manifest.invariants.contrastTier },
    locks: [...manifest.invariants.locks],
    allowedFonts: manifest.invariants.allowedFonts.map((f) => ({ id: f.id, stack: f.stack })),
    chromaCap: manifest.invariants.chromaCap,
    defaultSeeds: manifest.defaultSeeds,
  };
}
