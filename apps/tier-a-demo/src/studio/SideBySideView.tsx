import { useState } from "react";
import { CannedAgent } from "../demo/canned-agent.js";
import { BLOOMBERG_SCRIPT, SCRIPT } from "../demo/script.js";
import { TenantColumn } from "./TenantColumn.js";

const STRIPE_AGENT = new CannedAgent(SCRIPT);
const BLOOMBERG_AGENT = new CannedAgent(BLOOMBERG_SCRIPT);
const STRIPE_BRAND = "Make it match Stripe.";
const BLOOMBERG_BRAND = "Match Bloomberg — amber terminal.";

// In the comparison view, surface only the single-axis REFINEMENTS (the brand is auto-applied; the
// destination + governance prompts live in the Studio tab). Keeps each column's chrome short + tidy.
const STRIPE_REFINEMENTS = ["Soften the corners.", "Switch to the geometric sans.", "Tighten the density."];

// The climax: two clients, two independent sessions, ONE shared dark toggle (mode lives here, not per
// session) — both brands customized from the SAME manifest, holding accessibility in both modes.
export function SideBySideView() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flex: "0 0 auto", padding: "0 16px", borderBottom: "1px solid #e4e4e7", fontFamily: "system-ui" }}>
        <strong style={{ fontSize: 14 }}>Two clients · one dashboard · one set of invariants</strong>
        <button
          data-testid="shared-toggle"
          onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #d4d4d8", background: "#fafafa", fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
        >
          Both: {mode}
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <TenantColumn tenant="stripe" agent={STRIPE_AGENT} brandPrompt={STRIPE_BRAND} examples={STRIPE_REFINEMENTS} mode={mode} />
        <div style={{ width: 1, flex: "0 0 auto", background: "#e4e4e7" }} />
        <TenantColumn tenant="bloomberg" agent={BLOOMBERG_AGENT} brandPrompt={BLOOMBERG_BRAND} examples={[]} mode={mode} />
      </div>
    </div>
  );
}
