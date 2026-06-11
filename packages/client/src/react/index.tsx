import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { requestRefix, submitPrompt, type AuthoringResult } from "../core/authoring";
import { ModLoader } from "../core/loader";
import {
  applyOverlay,
  clearOverlay,
  DEFAULT_SCOPE_ATTRIBUTE,
  slotKey,
  type SlotOverrideMap,
} from "../core/overlay";
import { sanitizeHtml } from "../core/sanitize";
import { createTelemetry } from "../core/telemetry";
import type { InvarianceClientConfig, ModStatus } from "../core/types";

interface InvarianceContextValue {
  status: ModStatus;
  degradeReasons: string[];
  slotOverrides: SlotOverrideMap;
  reload: () => Promise<void>;
  author: (prompt: string) => Promise<AuthoringResult>;
  refix: () => Promise<AuthoringResult>;
}

const InvarianceContext = createContext<InvarianceContextValue | null>(null);

export function useInvariance(): InvarianceContextValue {
  const ctx = useContext(InvarianceContext);
  if (!ctx) throw new Error("useInvariance must be used inside <InvarianceProvider>");
  return ctx;
}

export function InvarianceProvider({
  config,
  children,
}: {
  config: InvarianceClientConfig;
  children: ReactNode;
}) {
  const loader = useMemo(() => new ModLoader(config), [config]);
  const telemetry = useMemo(() => createTelemetry(config), [config]);
  const [status, setStatus] = useState<ModStatus>("none");
  const [degradeReasons, setDegradeReasons] = useState<string[]>([]);
  const [slotOverrides, setSlotOverrides] = useState<SlotOverrideMap>(new Map());

  const scopeAttribute = config.scopeAttribute ?? DEFAULT_SCOPE_ATTRIBUTE;

  const reload = useCallback(async () => {
    const loaded = await loader.load();
    setStatus(loaded.status);
    setDegradeReasons(loaded.reasons ?? []);
    if (loaded.bundle) {
      const applied = applyOverlay(loaded.bundle, scopeAttribute);
      setSlotOverrides(applied.slotOverrides);
      telemetry.emit({ type: "mods_applied", modId: loaded.bundle.id });
    } else {
      clearOverlay();
      setSlotOverrides(new Map());
      if (loaded.status === "degraded") {
        telemetry.emit({ type: "mods_degraded" });
      }
    }
  }, [loader, scopeAttribute, telemetry]);

  useEffect(() => {
    document.body.setAttribute(scopeAttribute, "");
    void reload();
    return () => {
      clearOverlay();
      document.body.removeAttribute(scopeAttribute);
    };
  }, [reload, scopeAttribute]);

  const author = useCallback(
    async (prompt: string) => {
      telemetry.emit({ type: "prompt_submitted" });
      const result = await submitPrompt(config, prompt);
      if (result.ok) await reload();
      return result;
    },
    [config, reload, telemetry],
  );

  const refix = useCallback(async () => {
    telemetry.emit({ type: "refix_requested" });
    const result = await requestRefix(config);
    if (result.ok) await reload();
    return result;
  }, [config, reload, telemetry]);

  const value = useMemo(
    () => ({ status, degradeReasons, slotOverrides, reload, author, refix }),
    [status, degradeReasons, slotOverrides, reload, author, refix],
  );

  return <InvarianceContext.Provider value={value}>{children}</InvarianceContext.Provider>;
}

/**
 * Marks a customizable slot. Renders the override (sanitized) when the
 * subject's bundle provides one, otherwise the developer's default children.
 */
export function Slot({
  componentId,
  slot,
  children,
}: {
  componentId: string;
  slot: string;
  children?: ReactNode;
}) {
  const { slotOverrides } = useInvariance();
  const override = slotOverrides.get(slotKey(componentId, slot));
  if (override === undefined) return <>{children}</>;
  return (
    <span
      data-invariance-slot={slotKey(componentId, slot)}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(override) }}
    />
  );
}

/** Floating "Customize" widget: prompt box + degrade/re-fix banner. */
export function PromptWidget() {
  const { status, degradeReasons, author, refix } = useInvariance();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setMessage("Generating and verifying…");
    const result = await author(prompt.trim());
    setMessage(result.ok ? "Applied!" : `Rejected: ${(result.reasons ?? []).join("; ")}`);
    if (result.ok) setPrompt("");
    setBusy(false);
  };

  const runRefix = async () => {
    setBusy(true);
    setMessage("Repairing your customizations…");
    const result = await refix();
    setMessage(result.ok ? "Fixed!" : `Could not fix: ${(result.reasons ?? []).join("; ")}`);
    setBusy(false);
  };

  return (
    <div data-invariance-widget="" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 9999 }}>
      {status === "degraded" && (
        <div data-invariance-degraded-banner="" style={bannerStyle}>
          <p style={{ margin: 0 }}>
            Your customizations were paused by an app update
            {degradeReasons.length > 0 ? ` (${degradeReasons.join("; ")})` : ""}.
          </p>
          <button onClick={runRefix} disabled={busy} style={buttonStyle}>
            Fix with AI
          </button>
        </div>
      )}
      {open && (
        <div data-invariance-panel="" style={panelStyle}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a change… e.g. “make the accent color teal”"
            rows={3}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <button onClick={submit} disabled={busy} style={buttonStyle}>
            {busy ? "Working…" : "Apply"}
          </button>
          {message && <p data-invariance-message="" style={{ fontSize: 12 }}>{message}</p>}
        </div>
      )}
      <button
        data-invariance-trigger=""
        onClick={() => setOpen((v) => !v)}
        style={{ ...buttonStyle, borderRadius: 999, padding: "10px 16px" }}
      >
        ✨ Customize
      </button>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  padding: 12,
  marginBottom: 8,
  background: "#fff",
  color: "#111",
  border: "1px solid #ddd",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};

const bannerStyle: React.CSSProperties = {
  ...panelStyle,
  width: 320,
  background: "#fff7e6",
  borderColor: "#f0c36d",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 12px",
  cursor: "pointer",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
};
