import { useEffect, useRef } from "react";
import { AnalyticsDashboard } from "../canvas/AnalyticsDashboard.js";
import { CannedAgent } from "../demo/canned-agent.js";
import { DEMO_MANIFEST } from "../demo/manifest.js";
import { SCRIPT } from "../demo/script.js";
import { applyScoped } from "../preview/apply-scoped.js";
import { structuralProfile } from "@invariance/theming/spec";
import { OutcomePanel } from "./OutcomePanel.js";
import { PromptBox } from "./PromptBox.js";
import { SessionControls } from "./SessionControls.js";
import { appliedSpec } from "./session-state.js";
import { useDemoSession } from "./useDemoSession.js";

const agent = new CannedAgent(SCRIPT);
const EXAMPLES = Object.keys(SCRIPT);

// The single-tenant customize loop (Part 4). Per-session mode toggle lives here.
export function StudioView() {
  const demo = useDemoSession(agent, DEMO_MANIFEST, "stripe");
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wrapper.current) applyScoped(wrapper.current, demo.state.applied, demo.state.mode);
  }, [demo.state.applied, demo.state.mode]);

  const s = appliedSpec(demo.state);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", height: "100%" }}>
      <aside style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, borderRight: "1px solid #e4e4e7", overflow: "auto", fontFamily: "system-ui" }}>
        <h2 style={{ margin: 0 }}>Customize the dashboard</h2>
        <PromptBox examples={EXAMPLES} onSubmit={demo.submit} />
        {demo.state.notice && (
          <p data-testid="notice" style={{ color: "#a16207", margin: 0 }}>
            {demo.state.notice}
          </p>
        )}
        <OutcomePanel outcome={demo.state.outcome} onAcknowledge={demo.acknowledge} />
        <SessionControls published={demo.state.published} canPublish={demo.state.acknowledged && !demo.state.published} onPublish={demo.publish} onReset={demo.reset} />
        <button data-testid="toggle-dark" onClick={demo.toggleMode} style={{ marginTop: "auto", padding: "6px 12px" }}>
          Mode: {demo.state.mode}
        </button>
      </aside>
      <main style={{ overflow: "auto" }}>
        <div ref={wrapper} data-testid="scope" style={{ background: "hsl(var(--background))", minHeight: "100%" }}>
          <AnalyticsDashboard
            profile={structuralProfile(s)}
            shadow={s.shadow ?? "soft"}
            borderWeight={s.borderWeight ?? "hairline"}
          />
        </div>
      </main>
    </div>
  );
}
