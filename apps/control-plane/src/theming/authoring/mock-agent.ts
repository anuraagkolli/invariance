import type {
  Agent,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
  GateClassification,
} from "./agent-types.js";

type CannedTurn = { classification: GateClassification; spec: unknown };

// The zero-LLM test harness for the whole merge → compile → verify → publish half (§8).
// Each gatekeep + design pair consumes one canned turn, in order.
export class MockAgent implements Agent {
  private readonly canned: CannedTurn[];
  private cursor = 0;

  constructor(canned: CannedTurn[]) {
    this.canned = canned;
  }

  private next(): CannedTurn {
    const turn = this.canned[this.cursor];
    if (turn === undefined) {
      throw new Error("MockAgent: canned script exhausted");
    }
    return turn;
  }

  async gatekeep(_input: GatekeeperInput): Promise<GatekeeperResult> {
    const turn = this.next();
    return { classification: turn.classification };
  }

  async design(_input: DesignerInput): Promise<DesignerResult> {
    const turn = this.next();
    this.cursor += 1; // advance after the design call completes the turn
    return { specJson: turn.spec };
  }
}
