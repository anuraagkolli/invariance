import { useState } from "react";
import { SideBySideView } from "./studio/SideBySideView.js";
import { StudioView } from "./studio/StudioView.js";

type View = "studio" | "side";

export function App() {
  const [view, setView] = useState<View>("studio");
  const tab = (v: View, label: string, testid: string) => (
    <button
      data-testid={testid}
      onClick={() => setView(v)}
      style={{ padding: "6px 12px", fontWeight: view === v ? 700 : 400, borderBottom: view === v ? "2px solid #111" : "2px solid transparent" }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", gap: 8, padding: "6px 12px", borderBottom: "1px solid #e4e4e7" }}>
        {tab("studio", "Studio", "view-studio")}
        {tab("side", "Side-by-side", "view-side")}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{view === "studio" ? <StudioView /> : <SideBySideView />}</div>
    </div>
  );
}
