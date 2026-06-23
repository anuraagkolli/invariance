// Acknowledge lives in OutcomePanel (contextual to a diff). These are the session-level actions.
export function SessionControls({ published, onPublish, onReset }: { published: boolean; onPublish: () => void; onReset: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button data-testid="publish" onClick={onPublish} style={{ padding: "6px 12px" }}>
        {published ? "Live ✓" : "Publish"}
      </button>
      <button data-testid="reset" onClick={onReset} style={{ padding: "6px 12px" }}>
        Reset
      </button>
    </div>
  );
}
