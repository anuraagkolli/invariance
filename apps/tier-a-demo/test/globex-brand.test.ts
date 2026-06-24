import { compile, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { BLOOMBERG_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";

const fresh = (): Session => ({ tenant: "bloomberg", draft: APP_DEFAULT_SPEC, published: null });
const BLOOMBERG_PROMPT = "Match Bloomberg — amber terminal.";
const STRIPE_PROMPT = "Make it match Stripe.";

describe("Bloomberg brand — a contrasting brand under the SAME AA manifest", () => {
  it("the bloomberg brand is an accepted diff (clears AA in both modes)", async () => {
    const t = await runScriptedTurn(new CannedAgent(BLOOMBERG_SCRIPT), fresh(), BLOOMBERG_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff"); // an accepted diff ⇒ verify passed every allowed mode (light + dark) at AA
    if (t.kind === "diff") expect(t.diff.some((d) => d.role === "primary")).toBe(true);
  });

  it("Bloomberg's amber primary genuinely differs from Stripe's indigo (same manifest, different brand)", () => {
    const bloomberg = parseSpec((BLOOMBERG_SCRIPT[BLOOMBERG_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const stripe = parseSpec((SCRIPT[STRIPE_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(bloomberg.ok && stripe.ok).toBe(true);
    if (!bloomberg.ok || !stripe.ok) return;
    const bPrimary = compile(bloomberg.spec, DEMO_MANIFEST).light["--primary"];
    const sPrimary = compile(stripe.spec, DEMO_MANIFEST).light["--primary"];
    expect(bPrimary).not.toBe(sPrimary);
  });
});
