import { compile, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { GLOBEX_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";

const fresh = (): Session => ({ tenant: "globex", draft: APP_DEFAULT_SPEC, published: null });
const TERMINAL_PROMPT = "Make it a Bloomberg-style terminal.";
const SOFT_SAAS_PROMPT = "Make it feel like Linear — a soft, modern SaaS.";

describe("Terminal brand — a contrasting brand under the SAME AA manifest", () => {
  it("the terminal brand is an accepted diff (clears AA in both modes)", async () => {
    const t = await runScriptedTurn(new CannedAgent(GLOBEX_SCRIPT), fresh(), TERMINAL_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff"); // an accepted diff ⇒ verify passed every allowed mode (light + dark) at AA
    if (t.kind === "diff") expect(t.diff.some((d) => d.role === "primary")).toBe(true);
  });

  it("Terminal's green primary genuinely differs from Soft-SaaS's indigo (same manifest, different brand)", () => {
    const terminal = parseSpec((GLOBEX_SCRIPT[TERMINAL_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const softSaas = parseSpec((SCRIPT[SOFT_SAAS_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(terminal.ok && softSaas.ok).toBe(true);
    if (!terminal.ok || !softSaas.ok) return;
    const tPrimary = compile(terminal.spec, DEMO_MANIFEST).light["--primary"];
    const sPrimary = compile(softSaas.spec, DEMO_MANIFEST).light["--primary"];
    expect(tPrimary).not.toBe(sPrimary);
  });
});
