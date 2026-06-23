import { compile, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { GLOBEX_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";

const fresh = (): Session => ({ tenant: "globex", draft: APP_DEFAULT_SPEC, published: null });
const GLOBEX_PROMPT = "Match Globex — emerald, crisp corners.";
const ACME_INDIGO = "Make it feel like Acme — deep indigo, a little more rounded.";

describe("Globex brand — a contrasting brand under the SAME AA manifest", () => {
  it("the emerald/sharp brand is an accepted diff (clears AA in both modes)", async () => {
    const t = await runScriptedTurn(new CannedAgent(GLOBEX_SCRIPT), fresh(), GLOBEX_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff"); // an accepted diff ⇒ verify passed every allowed mode (light + dark) at AA
    if (t.kind === "diff") expect(t.diff.some((d) => d.role === "primary")).toBe(true);
  });

  it("Globex's emerald primary genuinely differs from Acme's indigo (same manifest, different brand)", () => {
    const globex = parseSpec((GLOBEX_SCRIPT[GLOBEX_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const acme = parseSpec((SCRIPT[ACME_INDIGO].spec as object) as unknown, DEMO_MANIFEST);
    expect(globex.ok && acme.ok).toBe(true);
    if (!globex.ok || !acme.ok) return;
    const gPrimary = compile(globex.spec, DEMO_MANIFEST).light["--primary"];
    const aPrimary = compile(acme.spec, DEMO_MANIFEST).light["--primary"];
    expect(gPrimary).not.toBe(aPrimary);
  });
});
