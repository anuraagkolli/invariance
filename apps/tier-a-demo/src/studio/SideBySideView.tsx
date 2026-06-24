import { useState } from "react";
import { CannedAgent } from "../demo/canned-agent.js";
import { GLOBEX_SCRIPT, SCRIPT } from "../demo/script.js";
import { TenantColumn } from "./TenantColumn.js";

const ACME_AGENT = new CannedAgent(SCRIPT);
const GLOBEX_AGENT = new CannedAgent(GLOBEX_SCRIPT);
const ACME_BRAND = "Make it feel like Linear — a soft, modern SaaS.";
const GLOBEX_BRAND = "Make it a Bloomberg-style terminal.";

// The climax: two tenants, two independent sessions, ONE shared dark toggle (mode lives here, not per
// session) — both brands customized from the SAME manifest, holding accessibility in both modes.
export function SideBySideView() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderBottom: "1px solid #e4e4e7" }}>
        <strong>Two tenants · one platform · one set of invariants</strong>
        <button data-testid="shared-toggle" onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))} style={{ padding: "6px 12px" }}>
          Both: {mode}
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <TenantColumn tenant="acme" agent={ACME_AGENT} brandPrompt={ACME_BRAND} examples={Object.keys(SCRIPT)} mode={mode} />
        <div style={{ width: 1, background: "#e4e4e7" }} />
        <TenantColumn tenant="globex" agent={GLOBEX_AGENT} brandPrompt={GLOBEX_BRAND} examples={Object.keys(GLOBEX_SCRIPT)} mode={mode} />
      </div>
    </div>
  );
}
