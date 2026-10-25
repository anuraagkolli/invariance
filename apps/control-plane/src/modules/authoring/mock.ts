import type { AgentInput, AuthoringAgent } from "./agent";

/**
 * Scripted agent for tests and offline development: returns queued drafts in
 * order (repeating the last one), recording every input it saw.
 */
export class MockAgent implements AuthoringAgent {
  readonly inputs: AgentInput[] = [];
  private index = 0;

  constructor(private readonly drafts: unknown[]) {
    if (drafts.length === 0) throw new Error("MockAgent needs at least one draft");
  }

  generateDraft(input: AgentInput): Promise<unknown> {
    this.inputs.push(input);
    const draft = this.drafts[Math.min(this.index, this.drafts.length - 1)];
    this.index++;
    return Promise.resolve(draft);
  }
}
