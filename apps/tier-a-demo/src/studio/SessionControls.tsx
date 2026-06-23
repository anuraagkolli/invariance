// Acknowledge lives in OutcomePanel (contextual to a diff). These are the session-level actions.
export function SessionControls({
  published,
  canPublish,
  onPublish,
  onReset,
}: {
  published: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        data-testid="publish"
        disabled={!canPublish}
        onClick={onPublish}
        style={{
          padding: "6px 12px",
          ...(!canPublish && !published ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        }}
        title={!canPublish && !published ? "Acknowledge a change to publish" : undefined}
      >
        {published ? "Live ✓" : "Publish"}
      </button>
      <button data-testid="reset" onClick={onReset} style={{ padding: "6px 12px" }}>
        Reset
      </button>
    </div>
  );
}
