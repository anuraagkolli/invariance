import { useRef, useState } from "react";

export function PromptBox({ examples, onSubmit }: { examples: string[]; onSubmit: (prompt: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const send = () => {
    const v = value.trim();
    if (v) {
      onSubmit(v);
      setValue("");
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          data-testid="prompt-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe a look…"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #d4d4d8" }}
        />
        <button data-testid="send" onClick={send} style={{ padding: "8px 12px" }}>
          Send
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {examples.map((ex) => (
          <button
            key={ex}
            data-testid="example"
            onClick={() => {
              setValue(ex); // fill the input (reads as natural-language typing on camera), operator presses Send
              inputRef.current?.focus();
            }}
            style={{ padding: "4px 8px", fontSize: 12, borderRadius: 999, border: "1px solid #d4d4d8", background: "#fafafa" }}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
