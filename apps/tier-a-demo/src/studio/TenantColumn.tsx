import { useEffect, useRef } from "react";
import { AnalyticsDashboard } from "../canvas/AnalyticsDashboard.js";
import { DEMO_MANIFEST } from "../demo/manifest.js";
import { applyScoped } from "../preview/apply-scoped.js";
import { structuralProfile } from "@invariance/theming/spec";
import type { Agent } from "../demo/wiring.js";
import { appliedSpec } from "./session-state.js";
import { useDemoSession } from "./useDemoSession.js";

// One tenant in the side-by-side: its OWN useDemoSession (independent state), its OWN scoped wrapper,
// re-themed with the SHARED `mode` prop (not the session's own mode — the climax toggle is shared).
export function TenantColumn({
  tenant,
  agent,
  brandPrompt,
  examples,
  mode,
}: {
  tenant: string;
  agent: Agent;
  brandPrompt: string;
  examples: string[];
  mode: "light" | "dark";
}) {
  const demo = useDemoSession(agent, DEMO_MANIFEST, tenant);
  const wrapper = useRef<HTMLDivElement>(null);

  // apply the tenant's brand once on mount: submit -> acknowledge
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot brand apply on mount
  useEffect(() => {
    void (async () => {
      await demo.submit(brandPrompt);
      demo.acknowledge();
    })();
  }, []);

  // re-theme on the tenant's applied theme OR the SHARED mode prop
  useEffect(() => {
    if (wrapper.current) applyScoped(wrapper.current, demo.state.applied, mode);
  }, [demo.state.applied, mode]);

  const s = appliedSpec(demo.state);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", fontFamily: "system-ui" }}>
        <strong style={{ textTransform: "capitalize" }}>{tenant}</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
          {examples.map((ex) => (
            <button key={ex} data-testid={`example-${tenant}`} onClick={() => demo.submit(ex)} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, border: "1px solid #d4d4d8" }}>
              {ex}
            </button>
          ))}
        </div>
      </div>
      <div ref={wrapper} data-testid={`scope-${tenant}`} style={{ background: "hsl(var(--background))", flex: 1, overflow: "auto" }}>
        <AnalyticsDashboard
          ctaTestId={`cta-${tenant}`}
          profile={structuralProfile(s)}
          shadow={s.shadow ?? "soft"}
          borderWeight={s.borderWeight ?? "hairline"}
        />
      </div>
    </div>
  );
}
