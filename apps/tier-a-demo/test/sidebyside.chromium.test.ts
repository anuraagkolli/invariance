import { fileURLToPath } from "node:url";
import { compile, parseSpec } from "@invariance/theming";
import { type Browser, type Page, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { hslTripleToSrgb } from "./_measure.js";

function rgb255(triple: string): [number, number, number] {
  const [r, g, b] = hslTripleToSrgb(triple);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function parseCssRgb(s: string): [number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error(`not rgb: ${s}`);
  const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
  return [r, g, b];
}
const close = (a: [number, number, number], b: [number, number, number], tol = 4): boolean =>
  a.every((v, i) => Math.abs(v - b[i]) <= tol);

function brand(spec: Record<string, unknown>) {
  const p = parseSpec(spec, DEMO_MANIFEST);
  if (!p.ok) throw new Error("setup");
  return compile(p.spec, DEMO_MANIFEST);
}

// Soft-SaaS brand (Acme) — Linear-inspired indigo
const ACME = brand({
  colors: { primary: "oklch(0.52 0.20 277)", accent: "oklch(0.70 0.12 277)", neutral: "oklch(0.985 0.004 277)" },
  radius: 12,
  density: "spacious",
  typography: { display: "geist-sans", body: "geist-sans", mono: "geist-mono" },
  shadow: "soft",
  borderWeight: "standard",
});

// Terminal brand (Globex) — Bloomberg-style green
const GLOBEX = brand({
  colors: { primary: "oklch(0.78 0.17 145)", accent: "oklch(0.80 0.14 85)", neutral: "oklch(0.96 0.006 240)" },
  radius: 0,
  density: "comfortable",
  typography: { display: "ibm-plex-mono", body: "ibm-plex-mono", mono: "ibm-plex-mono" },
  shadow: "flat",
  borderWeight: "hairline",
});

const ACME_LIGHT = rgb255(ACME.light["--primary"]);
const ACME_DARK = rgb255(ACME.dark!["--primary"]);
const GLOBEX_LIGHT = rgb255(GLOBEX.light["--primary"]);
const GLOBEX_DARK = rgb255(GLOBEX.dark!["--primary"]);

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { port: 0 }, logLevel: "error" });
  await server.listen();
  url = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const ctaBg = async (page: Page, id: string): Promise<[number, number, number]> =>
  parseCssRgb(await page.evaluate((i) => getComputedStyle(document.querySelector(`[data-testid="${i}"]`)!).backgroundColor, id));
// poll until a CTA reaches a target color (CSS transitions mean it settles over ~0.3s)
const waitForCta = (page: Page, id: string, target: [number, number, number]) =>
  page.waitForFunction(
    ([i, t]: [string, number[]]) => {
      const el = document.querySelector(`[data-testid="${i}"]`);
      if (!el) return false;
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
      if (!m) return false;
      const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
      return Math.abs(r - t[0]) <= 4 && Math.abs(g - t[1]) <= 4 && Math.abs(b - t[2]) <= 4;
    },
    [id, target] as [string, number[]],
  );

describe("chromium: two-tenant side-by-side", () => {
  it("two wrappers themed differently (no bleed), structural profiles differ, fonts differ, shared toggle swaps both, customizing one isolates the other", async () => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.click('[data-testid="view-side"]');
    await page.waitForSelector('[data-testid="scope-acme"]');
    await page.waitForSelector('[data-testid="scope-globex"]');

    // brands auto-apply on mount → wait for each CTA to settle on its themed primary
    await waitForCta(page, "cta-acme", ACME_LIGHT);
    await waitForCta(page, "cta-globex", GLOBEX_LIGHT);

    // (1) two wrappers, NO bleed: both themed correctly AND different simultaneously
    const acmeLight = await ctaBg(page, "cta-acme");
    const globexLight = await ctaBg(page, "cta-globex");
    expect(close(acmeLight, ACME_LIGHT), "acme = Soft-SaaS indigo").toBe(true);
    expect(close(globexLight, GLOBEX_LIGHT), "globex = terminal green").toBe(true);
    expect(close(acmeLight, globexLight), "the two CTAs are different colors at the same time").toBe(false);

    // (2) structural profile differs: acme=roomy, globex=dense
    const acmeProfile = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="scope-acme"]');
      return scope?.querySelector('[data-profile]')?.getAttribute('data-profile') ?? null;
    });
    const globexProfile = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="scope-globex"]');
      return scope?.querySelector('[data-profile]')?.getAttribute('data-profile') ?? null;
    });
    expect(acmeProfile, "acme profile=roomy").toBe("roomy");
    expect(globexProfile, "globex profile=dense").toBe("dense");
    expect(acmeProfile, "profiles differ").not.toBe(globexProfile);

    // (3) font families differ: acme has Geist, globex has IBM Plex Mono
    // wait for fonts to load (font-display:block — first frame may have no glyphs)
    await page.waitForFunction(() => {
      const acmeCta = document.querySelector('[data-testid="cta-acme"]');
      if (!acmeCta) return false;
      return getComputedStyle(acmeCta).fontFamily.toLowerCase().includes("geist") || document.fonts.check("12px Geist");
    });
    const acmeFont = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="cta-acme"]');
      return el ? getComputedStyle(el).fontFamily : "";
    });
    const globexFont = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="cta-globex"]');
      return el ? getComputedStyle(el).fontFamily : "";
    });
    expect(acmeFont.toLowerCase(), "acme font contains Geist").toContain("geist");
    expect(globexFont.toLowerCase(), "globex font differs from acme (IBM Plex Mono)").not.toContain("geist");
    expect(acmeFont, "font families are different").not.toBe(globexFont);

    // (3b) elevation differs: Soft-SaaS has a soft shadow; the Terminal is flat (none)
    const boxShadowOf = (id: string) =>
      page.evaluate((i) => getComputedStyle(document.querySelector(`[data-testid="${i}"]`)!).boxShadow, id);
    expect(await boxShadowOf("cta-acme"), "Soft-SaaS CTA is elevated").not.toBe("none");
    expect(await boxShadowOf("cta-globex"), "Terminal CTA is flat").toBe("none");

    // (4) on-page isolation: customizing Acme (Soften → radius 16) leaves Globex's CTA unchanged.
    // Wait on Acme's --radius var ACTUALLY changing (a real settle signal, not a vacuous `|| true`).
    const acmeRadiusBefore = await page.evaluate(() => (document.querySelector('[data-testid="scope-acme"]') as HTMLElement).style.getPropertyValue("--radius"));
    await page.locator('[data-testid="example-acme"]', { hasText: "Soften" }).click();
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="scope-acme"]') as HTMLElement).style.getPropertyValue("--radius") !== prev,
      acmeRadiusBefore,
    );
    expect(close(await ctaBg(page, "cta-globex"), globexLight), "Globex unchanged while Acme is customized").toBe(true);

    // (5) shared toggle swaps BOTH to their dark primaries (each differs from its own light)
    await page.click('[data-testid="shared-toggle"]');
    await waitForCta(page, "cta-acme", ACME_DARK);
    await waitForCta(page, "cta-globex", GLOBEX_DARK);
    expect(close(await ctaBg(page, "cta-acme"), ACME_LIGHT), "acme actually swapped").toBe(false);
    expect(close(await ctaBg(page, "cta-globex"), GLOBEX_LIGHT), "globex actually swapped").toBe(false);

    await page.close();
  });
});
