// Crypto-free subpaths (not the barrel): the barrel pulls node:crypto via artifact/hash-artifact,
// which the browser bundle can't include. compile/spec are browser-safe; the demo never hashes.
import { compile } from "@invariance/theming/compile";
import { parseSpec } from "@invariance/theming/spec";
import { useEffect, useRef, useState } from "react";
import { AnalyticsDashboard } from "./canvas/AnalyticsDashboard.js";
import { DEMO_MANIFEST } from "./demo/manifest.js";
import { applyScoped } from "./preview/apply-scoped.js";

// A sample published look (the engine runs client-side — pure). Part 4 will drive this from the
// CannedAgent + the page-held session; here it's a fixed theme to prove the scoped applier re-themes.
const parsed = parseSpec({ colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 }, DEMO_MANIFEST);
const SAMPLE_THEME = parsed.ok ? compile(parsed.spec, DEMO_MANIFEST) : undefined;

export function App() {
  const wrapper = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (wrapper.current && SAMPLE_THEME) applyScoped(wrapper.current, SAMPLE_THEME, mode);
  }, [mode]);

  return (
    <div data-testid="app">
      <button
        data-testid="toggle-dark"
        onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
        style={{ padding: "8px 12px", margin: 8 }}
      >
        Toggle {mode === "light" ? "dark" : "light"}
      </button>
      <div ref={wrapper} data-testid="scope" style={{ background: "hsl(var(--background))" }}>
        <AnalyticsDashboard />
      </div>
    </div>
  );
}
