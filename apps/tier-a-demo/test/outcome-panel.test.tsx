import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { failureTemplate } from "../src/demo/wiring.js";
import { OutcomePanel } from "../src/studio/OutcomePanel.js";

const noop = () => {};

describe("OutcomePanel", () => {
  it("shows the idle hint when there is no outcome", () => {
    expect(renderToString(<OutcomePanel outcome={null} onAcknowledge={noop} />)).toContain("Pick a prompt");
  });

  it("shows the calm no-change line", () => {
    expect(renderToString(<OutcomePanel outcome={{ kind: "no_change" }} onAcknowledge={noop} />)).toContain("No visual change");
  });

  it("diff: role + a color swatch (resolved 'to' value) + an Acknowledge button", () => {
    const html = renderToString(
      <OutcomePanel
        outcome={{ kind: "diff", diff: [{ role: "primary", from: "240 5% 10%", to: "270 50% 30%", kind: "changed" }], candidate: {} as never, pendingSpec: {} as never }}
        onAcknowledge={noop}
      />,
    );
    expect(html).toContain("primary");
    expect(html).toContain("acknowledge");
    expect(html).toContain("hsl(270 50% 30%)"); // the swatch renders the resolved 'to' triple
  });

  it("rejection renders the ENGINE's failureTemplate copy (not a UI-local string)", () => {
    const failure = { code: "seed_locked", path: "colors.destructive", message: "m" } as const;
    const html = renderToString(<OutcomePanel outcome={{ kind: "rejected", failures: [failure] }} onAcknowledge={noop} />);
    expect(html).toContain(failureTemplate(failure).headline); // == engine copy ⇒ not a fork
    expect(html).toContain("Your design is unchanged");
  });
});
