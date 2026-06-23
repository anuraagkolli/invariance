import type { Agent, DesignerInput, DesignerResult, GatekeeperInput, GatekeeperResult } from "./wiring.js";
import type { CannedTurn } from "./script.js";

// Implements the real Agent interface (the seam): canned now → MockAgent → qwen later. It only SUPPLIES
// proposals; the engine produces every verdict. Keyed by the exact prompt string.
export class CannedAgent implements Agent {
  constructor(private readonly script: Record<string, CannedTurn>) {}

  private lookup(prompt: string): CannedTurn {
    const turn = this.script[prompt];
    if (!turn) throw new Error(`CannedAgent: no canned turn for prompt ${JSON.stringify(prompt)}`);
    return turn;
  }

  async gatekeep(input: GatekeeperInput): Promise<GatekeeperResult> {
    return { classification: this.lookup(input.prompt).classification };
  }

  async design(input: DesignerInput): Promise<DesignerResult> {
    return { specJson: this.lookup(input.prompt).spec };
  }
}
