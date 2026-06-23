import type { AppManifest } from "@invariance/theming/manifest";
import { type Agent, type Session, type TurnResult, buildEnvelope, runTurn } from "./wiring.js";

// One turn exactly as the UI runs it: gatekeep → (in scope) design → the real engine turn. The agent
// only SUPPLIES the proposal; runTurn produces the verdict. Throws on a non-in-scope gate OR an
// unscripted prompt (the caller catches → a `notice`). No fabricated TurnResult.
export async function runScriptedTurn(
  agent: Agent,
  session: Session,
  prompt: string,
  manifest: AppManifest,
): Promise<TurnResult> {
  const envelope = buildEnvelope(manifest);
  const gate = await agent.gatekeep({ prompt, envelope });
  if (gate.classification !== "in_scope_styling") throw new Error(`gate: ${gate.classification}`);
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, manifest);
}
