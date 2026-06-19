import {
  parseSpec,
  mergeDelta,
  canonicalize,
  diffSpecs,
  compile,
  verify,
  type StyleSpec,
  type AppManifest,
  type CandidateTheme,
  type FieldDiff,
  type WallFailure,
  type VerifyFailure,
} from "@invariance/theming";
import type { AuditStore } from "../publish/stores.js";

// The app default = the empty (canonicalized) spec ≡ "absence = app default everywhere" (§4.2).
export const APP_DEFAULT_SPEC: StyleSpec = canonicalize({});

export type Session = {
  tenant: string;
  draft: StyleSpec; // last ACKNOWLEDGED state (null-free, canonicalized); accumulator of acknowledged deltas
  candidate?: CandidateTheme; // pending (unacknowledged) compiled candidate for the current turn
  pendingSpec?: StyleSpec; // merged spec underlying `candidate`, awaiting acknowledgment
  published: string | null; // hash end users see (null = nothing published yet)
};

export type TurnResult =
  | { kind: "diff"; diff: FieldDiff[]; candidate: CandidateTheme; pendingSpec: StyleSpec } // non-empty diff
  | { kind: "no_change" } // empty diff: "No visual change from that"
  | { kind: "rejected"; failures: (WallFailure | VerifyFailure)[] }; // wall/verifier reject; draft UNTOUCHED

// Each turn: parse delta → merge onto draft → compile → verify → produce one of three outcomes.
// `delta` is raw (unknown) so the WALL (parseSpec) lives inside the turn (§1.2 step 3).
export function runTurn(session: Session, delta: unknown, manifest: AppManifest): TurnResult {
  // 3) the wall — parse-don't-validate. Failure ⇒ reject, draft untouched.
  const parsed = parseSpec(delta, manifest);
  if (!parsed.ok) {
    return { kind: "rejected", failures: parsed.failures };
  }
  // 4) merge (pure) → the full next draft (canonicalized, null-free).
  const pendingSpec = mergeDelta(session.draft, parsed.spec);
  // empty diff = no visual change (structural after canonicalize).
  const diff = diffSpecs(session.draft, pendingSpec, manifest);
  if (diff.length === 0) {
    return { kind: "no_change" };
  }
  // 5) compile (pure) + 6) verify (the gate). Verifier reject ⇒ draft untouched.
  const candidate = compile(pendingSpec, manifest);
  const verdict = verify(candidate, manifest);
  if (!verdict.ok) {
    return { kind: "rejected", failures: verdict.failures };
  }
  return { kind: "diff", diff, candidate, pendingSpec };
}

// Acknowledgment commits the pending candidate into the draft (the prerequisite for publish, §4.4).
export function acknowledge(session: Session): Session {
  if (session.pendingSpec === undefined) {
    throw new Error("acknowledge: no pending candidate to commit");
  }
  return {
    tenant: session.tenant,
    draft: session.pendingSpec,
    candidate: undefined,
    pendingSpec: undefined,
    published: session.published,
  };
}

// Reset (§4.4): draft ← loadPublishedSpec(published) OR draft ← appDefault when nothing published.
export async function resetToPublished(session: Session, audit: AuditStore): Promise<Session> {
  if (session.published === null) {
    return resetToAppDefault(session);
  }
  const record = await audit.getPublishedSpec(session.tenant, session.published);
  const draft = record ? canonicalize(record.styleSpec) : APP_DEFAULT_SPEC;
  return { tenant: session.tenant, draft, candidate: undefined, pendingSpec: undefined, published: session.published };
}

export function resetToAppDefault(session: Session): Session {
  return { tenant: session.tenant, draft: APP_DEFAULT_SPEC, candidate: undefined, pendingSpec: undefined, published: session.published };
}
