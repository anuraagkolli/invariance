import { type CandidateTheme, compile } from "@invariance/theming/compile";
import type { AppManifest } from "@invariance/theming/manifest";
import { APP_DEFAULT_SPEC, type Agent, type Session, type TurnResult, acknowledge } from "../demo/wiring.js";
import { runScriptedTurn } from "../demo/run-turn.js";

// The page-held session as PURE reducers (node-testable); useDemoSession is thin glue over these.
export type Mode = "light" | "dark";
export type DemoState = {
  session: Session;
  outcome: TurnResult | null; // last turn's engine outcome (drives OutcomePanel); rejected ⇒ real failures
  notice: string | null; // non-engine UX message (unscripted / non-in-scope) — NOT a fake rejected
  applied: CandidateTheme; // what the preview currently shows; advances ONLY on a diff
  published: boolean; // page-held: real product flips the KV pointer (artifact→pointer→audit)
  acknowledged: boolean; // true once the current diff is acknowledged; gates Publish
  mode: Mode;
};

export function initialState(manifest: AppManifest, tenant: string): DemoState {
  return {
    session: { tenant, draft: APP_DEFAULT_SPEC, published: null },
    outcome: null,
    notice: null,
    applied: compile(APP_DEFAULT_SPEC, manifest), // the un-themed base look
    published: false,
    acknowledged: false,
    mode: "light",
  };
}

export async function submitState(state: DemoState, agent: Agent, prompt: string, manifest: AppManifest): Promise<DemoState> {
  try {
    const outcome = await runScriptedTurn(agent, state.session, prompt, manifest);
    return {
      ...state,
      outcome,
      notice: null,
      applied: outcome.kind === "diff" ? outcome.candidate : state.applied, // advance ONLY on diff
      published: outcome.kind === "diff" ? false : state.published,
      // a fresh diff re-locks the gate; no_change/rejected preserve the existing acknowledged state
      acknowledged: outcome.kind === "diff" ? false : state.acknowledged,
    };
  } catch {
    // unscripted: preserve acknowledged (same as preserving published)
    return { ...state, outcome: null, notice: "I don't have a styling for that — try one of the examples." };
  }
}

export function ackState(state: DemoState): DemoState {
  if (state.outcome?.kind !== "diff") return state;
  return {
    ...state,
    session: acknowledge({ ...state.session, candidate: state.outcome.candidate, pendingSpec: state.outcome.pendingSpec }),
    outcome: null,
    acknowledged: true,
  };
}

export function publishState(state: DemoState): DemoState {
  return { ...state, published: true };
}

// app-default reset (start over). Part 5 may add reset-to-this-tenant's-published.
export function resetState(state: DemoState, manifest: AppManifest): DemoState {
  return {
    ...state,
    session: { ...state.session, draft: APP_DEFAULT_SPEC, candidate: undefined, pendingSpec: undefined },
    applied: compile(APP_DEFAULT_SPEC, manifest),
    outcome: null,
    notice: null,
    published: false,
    acknowledged: false,
  };
}

export function toggleModeState(state: DemoState): DemoState {
  return { ...state, mode: state.mode === "light" ? "dark" : "light" };
}
