import type { AppManifest } from "@invariance/theming/manifest";
import { useState } from "react";
import type { Agent } from "../demo/wiring.js";
import {
  type DemoState,
  ackState,
  initialState,
  publishState,
  resetState,
  submitState,
  toggleModeState,
} from "./session-state.js";

// Thin React glue over the pure reducers (session-state.ts). Per-tenant: one instance per tenant
// (Part 5 renders two — no Map refactor needed).
export function useDemoSession(agent: Agent, manifest: AppManifest, tenant: string) {
  const [state, setState] = useState<DemoState>(() => initialState(manifest, tenant));
  return {
    state,
    submit: async (prompt: string) => setState(await submitState(state, agent, prompt, manifest)),
    acknowledge: () => setState((s) => ackState(s)),
    publish: () => setState((s) => publishState(s)),
    reset: () => setState((s) => resetState(s, manifest)),
    toggleMode: () => setState((s) => toggleModeState(s)),
  };
}
