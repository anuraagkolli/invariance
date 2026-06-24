import { useState } from "react";
import { CannedAgent } from "../demo/canned-agent.js";
import { BLOOMBERG_SCRIPT, SCRIPT } from "../demo/script.js";
import { TenantColumn } from "./TenantColumn.js";

const STRIPE_AGENT = new CannedAgent(SCRIPT);
const BLOOMBERG_AGENT = new CannedAgent(BLOOMBERG_SCRIPT);
const STRIPE_BRAND = "Make it match Stripe.";
const BLOOMBERG_BRAND = "Match Bloomberg — amber terminal.";

// The climax: two clients, two independent sessions, ONE shared dark toggle (mode lives here, not per
// session) — both brands customized from the SAME manifest, holding accessibility in both modes.
export function SideBySideView() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderBottom: "1px solid #e4e4e7" }}>
        <strong>Two clients · one dashboard · one set of invariants</strong>
        <button data-testid="shared-toggle" onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))} style={{ padding: "6px 12px" }}>
          Both: {mode}
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <TenantColumn tenant="stripe" agent={STRIPE_AGENT} brandPrompt={STRIPE_BRAND} examples={Object.keys(SCRIPT)} mode={mode} />
        <div style={{ width: 1, background: "#e4e4e7" }} />
        <TenantColumn tenant="bloomberg" agent={BLOOMBERG_AGENT} brandPrompt={BLOOMBERG_BRAND} examples={Object.keys(BLOOMBERG_SCRIPT)} mode={mode} />
      </div>
    </div>
  );
}
