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
      {/* Fixed-height chrome bar so BOTH columns align regardless of chip count; chips on a single
          non-wrapping row (scrolls if they overflow) — no multi-row wrap, no misaligned dashboards. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 52,
          flex: "0 0 auto",
          padding: "0 16px",
          borderBottom: "1px solid #e4e4e7",
          background: "#ffffff",
          fontFamily: "system-ui",
        }}
      >
        <strong style={{ textTransform: "capitalize", fontSize: 15, whiteSpace: "nowrap" }}>{tenant}</strong>
        {examples.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              flexWrap: "nowrap",
              minWidth: 0,
              scrollbarWidth: "none",
              // soft right-edge fade so any overflow reads as intentional, not a hard clip
              maskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
              WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
            }}
          >
            {examples.map((ex) => (
              <button
                key={ex}
                data-testid={`example-${tenant}`}
                onClick={() => demo.submit(ex)}
                style={{ flex: "0 0 auto", fontSize: 11, padding: "3px 9px", borderRadius: 999, border: "1px solid #d4d4d8", background: "#fafafa", color: "#3f3f46", whiteSpace: "nowrap", cursor: "pointer" }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
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
