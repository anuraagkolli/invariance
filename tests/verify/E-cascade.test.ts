import {
  type CandidateTheme,
  type ThemeArtifact,
  buildArtifact,
  compile,
  hashArtifact,
  parseSpec,
  renderStyleText,
  verify,
} from "@invariance/theming";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SHADCN_CAN, TWO_MODE_CAN } from "./_fixtures.js";
import {
  InMemoryAuditStore,
  InMemoryBlobStore,
  InMemoryPointerStore,
  publish,
  resolveThemeTag,
  setKillSwitch,
} from "./_cp.js";
import { parseToSrgb } from "./_oracle.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP E — THE CASCADE ACTUALLY WINS (real chromium) + FAIL-OPEN
// E1 runs in a real browser: a shadcn-style gallery defines its OWN base :root/.dark
// rules; we inject the themed <style> at the END of <head> and assert getComputedStyle
// returns the THEMED value (source-order beats equal-specificity app rules), in both
// light and dark via next-themes-style `.dark` toggling. jsdom cannot resolve the CSS
// cascade / hsl(var(--x)) — only a real engine can. E2 covers every FailOpenReason.
// ════════════════════════════════════════════════════════════════════════════

function compileJson(json: unknown, manifest = SHADCN_CAN): CandidateTheme {
  const p = parseSpec(json, manifest);
  if (!p.ok) throw new Error(`rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, manifest);
}

// expected rgb [0..255] from a bare HSL triple, computed independently of the browser
function expectedRgb(triple: string): [number, number, number] {
  const c = parseToSrgb(triple, "hsl");
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}
function parseCssRgb(s: string): [number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error(`not an rgb string: ${s}`);
  const [r, g, b] = m[1].split(",").map((x) => parseFloat(x));
  return [Math.round(r), Math.round(g), Math.round(b)];
}
function close(a: [number, number, number], b: [number, number, number], tol = 2): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

// A shadcn-style reference gallery with its OWN base theme (the app's rules the injected
// <style> must beat). Elements consume colors as hsl(var(--x)), shadcn's convention.
const GALLERY_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style id="app-base">
  /* distinctive app-base accents no theme produces, so "themed wins" is unambiguous */
  :root { --background: 0 0% 100%; --foreground: 0 0% 0%; --accent: 120 100% 25%; }
  .dark { --background: 0 0% 0%; --foreground: 0 0% 100%; --accent: 30 100% 25%; }
  body { margin: 0; }
  #surface { background: hsl(var(--background)); color: hsl(var(--foreground)); width: 100px; height: 50px; }
  #chip { background: hsl(var(--accent)); }
</style></head>
<body><div id="surface">x</div><button id="chip">y</button></body></html>`;

let browser: Browser | undefined;
let launchError: unknown;

beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    launchError = e;
  }
});
afterAll(async () => {
  await browser?.close();
});

async function gallery(): Promise<Page> {
  if (!browser) throw new Error(`chromium failed to launch: ${String(launchError)}`);
  const page = await browser.newPage();
  await page.setContent(GALLERY_HTML, { waitUntil: "load" });
  return page;
}

async function bgRgb(page: Page, sel: string): Promise<[number, number, number]> {
  const s = await page.evaluate((q) => getComputedStyle(document.querySelector(q)!).backgroundColor, sel);
  return parseCssRgb(s);
}

describe("E1 — the themed cascade wins in a real browser (light + dark)", () => {
  it("chromium launched", () => {
    expect(launchError, `chromium launch error: ${String(launchError)}`).toBeUndefined();
    expect(browser).toBeDefined();
  });

  it("themed accent wins over app-base in BOTH modes; background mode-polarizes under .dark toggle", async () => {
    // pick a draft that verifies on the two-mode manifest (gentle accent change)
    const candidates = [
      { colors: { accent: "oklch(0.7 0.1 40)" } },
      { colors: { accent: "oklch(0.65 0.08 40)" } },
      { colors: { accent: "oklch(0.6 0.06 250)" } },
    ];
    let artifact: ThemeArtifact | undefined;
    for (const json of candidates) {
      const theme = compileJson(json, TWO_MODE_CAN);
      const verdict = verify(theme, TWO_MODE_CAN);
      if (verdict.ok) {
        artifact = buildArtifact(theme, TWO_MODE_CAN, verdict);
        break;
      }
    }
    expect(artifact, "no candidate verified on TWO_MODE_CAN").toBeDefined();
    if (!artifact) return;

    const lightCss = renderStyleText(artifact, "light"); // ":root { … themed light … }"
    const darkCss = renderStyleText(artifact, "dark"); //  ".dark { … themed dark … }"

    const page = await gallery();
    // base (before injection): app's own distinctive accents/background
    expect(close(await bgRgb(page, "#chip"), expectedRgb("120 100% 25%")), "base accent").toBe(true);
    expect(close(await bgRgb(page, "#surface"), [255, 255, 255]), "base bg").toBe(true);

    // inject BOTH themed blocks at the END of <head> (after #app-base) — source order wins
    await page.evaluate(
      ([l, d]) => {
        for (const css of [l, d]) {
          const el = document.createElement("style");
          el.textContent = css;
          document.head.appendChild(el);
        }
      },
      [lightCss, darkCss],
    );

    // LIGHT: themed accent wins over app-base green (cascade + source order)
    const themedAccentLight = expectedRgb(artifact.modes.light.vars["--accent"]);
    expect(close(await bgRgb(page, "#chip"), themedAccentLight), "light themed accent wins").toBe(true);
    expect(close(themedAccentLight, expectedRgb("120 100% 25%")), "themed ≠ app-base").toBe(false);
    const themedLightBg = expectedRgb(artifact.modes.light.vars["--background"]);
    expect(close(await bgRgb(page, "#surface"), themedLightBg), "light bg").toBe(true);

    // DARK: toggle next-themes-style .dark; the .dark themed block wins (specificity parity + source order)
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const themedAccentDark = expectedRgb(artifact.modes.dark!.vars["--accent"]);
    expect(close(await bgRgb(page, "#chip"), themedAccentDark), "dark themed accent wins").toBe(true);
    expect(close(themedAccentDark, expectedRgb("30 100% 25%")), "themed ≠ app-base dark").toBe(false);
    const themedDarkBg = expectedRgb(artifact.modes.dark!.vars["--background"]);
    expect(close(await bgRgb(page, "#surface"), themedDarkBg), "dark bg").toBe(true);
    // background is mode-polarized: light (near-white) ≠ dark (near-black)
    expect(close(themedLightBg, themedDarkBg), "light bg ≠ dark bg").toBe(false);

    await page.close();
  });

  it("placing the themed <style> BEFORE the app rules would lose — end-of-head placement is load-bearing", async () => {
    // Counter-control: inject at the START of <head>; the app's later #app-base rule wins → base shows.
    const theme = compileJson({ colors: { neutral: "oklch(0.5 0.04 250)" } }, TWO_MODE_CAN);
    const artifact = buildArtifact(theme, TWO_MODE_CAN, verify(theme, TWO_MODE_CAN));
    const lightCss = renderStyleText(artifact, "light");
    const page = await gallery();
    await page.evaluate((css) => {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.insertBefore(el, document.head.firstChild); // WRONG placement on purpose
    }, lightCss);
    // app base wins → still white, NOT the themed value
    expect(close(await bgRgb(page, "#surface"), [255, 255, 255])).toBe(true);
    await page.close();
  });
});

describe("E2 — fail open everywhere: each FailOpenReason → no tag (page renders BASE)", () => {
  const ISO = "2026-06-21T00:00:00.000Z";

  async function publishedSetup() {
    const theme = compileJson({ colors: { accent: "oklch(0.7 0.15 40)" } });
    const verdict = verify(theme, SHADCN_CAN);
    const artifact = buildArtifact(theme, SHADCN_CAN, verdict);
    const stores = { blob: new InMemoryBlobStore(), pointer: new InMemoryPointerStore(), audit: new InMemoryAuditStore() };
    const { hash } = await publish(
      { tenant: "acme", artifact, styleSpec: { colors: { accent: "oklch(0.7 0.15 40)" } } as never, verifierReport: verdict, prompt: "p", actor: "a", vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
      stores,
      { now: () => ISO },
    );
    return { stores, hash, artifact };
  }

  it("happy path → returns a <style> tag", async () => {
    const { stores } = await publishedSetup();
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(r.tag).not.toBeNull();
    expect(r.tag!.startsWith('<style nonce="n0">')).toBe(true);
  });

  it("no_nonce: CSP enforced + empty nonce", async () => {
    const { stores } = await publishedSetup();
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "", stores });
    expect(r).toEqual({ tag: null, reason: "no_nonce" });
  });

  it("pointer_miss: no pointer for the tenant", async () => {
    const { stores } = await publishedSetup();
    const r = await resolveThemeTag({ tenant: "nobody", mode: "light", nonce: "n0", stores });
    expect(r).toEqual({ tag: null, reason: "pointer_miss" });
  });

  it("pointer_disabled: kill switch", async () => {
    const { stores } = await publishedSetup();
    await setKillSwitch("acme", "disabled", stores.pointer, { now: () => ISO });
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(r).toEqual({ tag: null, reason: "pointer_disabled" });
  });

  it("artifact_missing: pointer hash not in blob", async () => {
    const { stores } = await publishedSetup();
    await stores.pointer.putPointer("acme", { hash: "deadbeef-not-stored", status: "live", updatedAt: ISO });
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(r).toEqual({ tag: null, reason: "artifact_missing" });
  });

  it("hash_mismatch: stored artifact does not hash to the pointer hash", async () => {
    const { stores, artifact } = await publishedSetup();
    // store a DIFFERENT artifact under a fake hash the pointer references
    const tampered: ThemeArtifact = { ...artifact, appId: "tampered-content" };
    await stores.blob.putArtifact("claimed-hash", tampered);
    await stores.pointer.putPointer("acme", { hash: "claimed-hash", status: "live", updatedAt: ISO });
    expect(hashArtifact(tampered)).not.toBe("claimed-hash"); // independent: content ≠ claimed hash
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(r).toEqual({ tag: null, reason: "hash_mismatch" });
  });

  it("unsafe_value: an emitted var contains a CSS breakout (caught at apply time)", async () => {
    const { stores } = await publishedSetup();
    // build an artifact whose vars include an unsafe value, stored under its OWN (correct) hash
    const evil: ThemeArtifact = {
      schemaVersion: 1,
      vocabVersion: "iv-roles-1",
      profileVersion: "iv-profile-1",
      appId: "evil",
      modes: { light: { selector: ":root", vars: { "--accent": "red; } body{display:none}" } } },
      meta: { verifierReport: { ok: true }, contrastFloor: "AA", chromaCap: 0.3 },
    };
    const h = hashArtifact(evil);
    await stores.blob.putArtifact(h, evil);
    await stores.pointer.putPointer("acme", { hash: h, status: "live", updatedAt: ISO });
    const r = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(r).toEqual({ tag: null, reason: "unsafe_value" });
  });
});

describe("E3 — fail-open in the browser: a null tag means the BASE design renders", () => {
  it("happy path injects themed; a fail-open injects nothing → base remains", async () => {
    const theme = compileJson({ colors: { accent: "oklch(0.7 0.18 35)" } });
    const verdict = verify(theme, SHADCN_CAN);
    const artifact = buildArtifact(theme, SHADCN_CAN, verdict);
    const stores = { blob: new InMemoryBlobStore(), pointer: new InMemoryPointerStore(), audit: new InMemoryAuditStore() };
    await publish(
      { tenant: "acme", artifact, styleSpec: { colors: { accent: "oklch(0.7 0.18 35)" } } as never, verifierReport: verdict, prompt: "p", actor: "a", vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
      stores,
      { now: () => "2026-06-21T00:00:00.000Z" },
    );

    // FAIL-OPEN (wrong tenant → pointer_miss): host injects nothing → app base accent (gray) renders
    const miss = await resolveThemeTag({ tenant: "nobody", mode: "light", nonce: "n0", stores });
    expect(miss.tag).toBeNull();
    const page = await gallery();
    // inject only if a tag exists (host behaviour); here it's null → nothing injected
    if (miss.tag) await page.evaluate((t) => (document.head.innerHTML += t), miss.tag);
    expect(close(await bgRgb(page, "#chip"), expectedRgb("120 100% 25%")), "base accent renders on fail-open").toBe(true);

    // HAPPY path → inject the returned <style>, themed accent renders (not base)
    const ok = await resolveThemeTag({ tenant: "acme", mode: "light", nonce: "n0", stores });
    expect(ok.tag).not.toBeNull();
    await page.evaluate((t) => document.head.insertAdjacentHTML("beforeend", t), ok.tag!);
    const themedAccent = expectedRgb(artifact.modes.light.vars["--accent"]);
    expect(close(await bgRgb(page, "#chip"), themedAccent), "themed accent renders on happy path").toBe(true);
    expect(close(themedAccent, expectedRgb("120 100% 25%"))).toBe(false); // differs from base
    await page.close();
  });
});
