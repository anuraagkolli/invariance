import type { AppManifest, ModBundle } from "@invariance/schema";

export interface AgentInput {
  prompt: string;
  manifest: AppManifest;
  /** The subject's current modset; the agent must return the full new modset. */
  currentBundle: ModBundle | null;
  /** Verification failure reasons from the previous attempt, for repair. */
  feedback: string[];
}

/**
 * Generates a mod draft (uiOps/hooks/capabilities as raw JSON) from a
 * natural-language prompt. Implementations: AnthropicAgent (production),
 * MockAgent (tests). The pipeline owns parsing and verification — agents are
 * untrusted input sources.
 */
export interface AuthoringAgent {
  generateDraft(input: AgentInput): Promise<unknown>;
}
