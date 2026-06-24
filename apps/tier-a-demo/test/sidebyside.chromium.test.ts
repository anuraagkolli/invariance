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

// Stripe brand — indigo/roomy
const STRIPE = brand({
  colors: { primary: "oklch(0.55 0.21 280)", accent: "oklch(0.72 0.12 280)", neutral: "oklch(0.985 0.004 280)" },
  radius: 12,
  density: "spacious",
  typography: { display: "geist-sans", body: "geist-sans", mono: "geist-mono" },
  shadow: "soft",
  borderWeight: "standard",
});

// Bloomberg brand — amber terminal/dense
const BLOOMBERG = brand({
  colors: { primary: "oklch(0.78 0.15 70)", accent: "oklch(0.72 0.16 150)", neutral: "oklch(0.96 0.006 250)" },
  radius: 0,
  density: "comfortable",
  typography: { display: "ibm-plex-mono", body: "ibm-plex-mono", mono: "ibm-plex-mono" },
  shadow: "flat",
  borderWeight: "hairline",
});

const STRIPE_LIGHT = rgb255(STRIPE.light["--primary"]);
const STRIPE_DARK = rgb255(STRIPE.dark!["--primary"]);
const BLOOMBERG_LIGHT = rgb255(BLOOMBERG.light["--primary"]);
const BLOOMBERG_DARK = rgb255(BLOOMBERG.dark!["--primary"]);

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
    await page.waitForSelector('[data-testid="scope-stripe"]');
    await page.waitForSelector('[data-testid="scope-bloomberg"]');

    // brands auto-apply on mount → wait for each CTA to settle on its themed primary
    await waitForCta(page, "cta-stripe", STRIPE_LIGHT);
    await waitForCta(page, "cta-bloomberg", BLOOMBERG_LIGHT);

    // (1) two wrappers, NO bleed: both themed correctly AND different simultaneously
    const stripeLight = await ctaBg(page, "cta-stripe");
    const bloombergLight = await ctaBg(page, "cta-bloomberg");
    expect(close(stripeLight, STRIPE_LIGHT), "stripe = Stripe indigo").toBe(true);
    expect(close(bloombergLight, BLOOMBERG_LIGHT), "bloomberg = amber terminal").toBe(true);
    expect(close(stripeLight, bloombergLight), "the two CTAs are different colors at the same time").toBe(false);

    // (2) structural profile differs: stripe=roomy, bloomberg=dense
    const stripeProfile = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="scope-stripe"]');
      return scope?.querySelector('[data-profile]')?.getAttribute('data-profile') ?? null;
    });
    const bloombergProfile = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="scope-bloomberg"]');
      return scope?.querySelector('[data-profile]')?.getAttribute('data-profile') ?? null;
    });
    expect(stripeProfile, "stripe profile=roomy").toBe("roomy");
    expect(bloombergProfile, "bloomberg profile=dense").toBe("dense");
    expect(stripeProfile, "profiles differ").not.toBe(bloombergProfile);

    // (3) font families differ: stripe has Geist, bloomberg has IBM Plex Mono
    // wait for fonts to load (font-display:block — first frame may have no glyphs)
    await page.waitForFunction(() => {
      const stripeCta = document.querySelector('[data-testid="cta-stripe"]');
      if (!stripeCta) return false;
      return getComputedStyle(stripeCta).fontFamily.toLowerCase().includes("geist") || document.fonts.check("12px Geist");
    });
    const stripeFont = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="cta-stripe"]');
      return el ? getComputedStyle(el).fontFamily : "";
    });
    const bloombergFont = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="cta-bloomberg"]');
      return el ? getComputedStyle(el).fontFamily : "";
    });
    expect(stripeFont.toLowerCase(), "stripe font contains Geist").toContain("geist");
    expect(bloombergFont.toLowerCase(), "bloomberg font differs from stripe (IBM Plex Mono)").not.toContain("geist");
    expect(stripeFont, "font families are different").not.toBe(bloombergFont);

    // (3b) elevation differs: Stripe has a soft shadow; Bloomberg is flat (none)
    const boxShadowOf = (id: string) =>
      page.evaluate((i) => getComputedStyle(document.querySelector(`[data-testid="${i}"]`)!).boxShadow, id);
    expect(await boxShadowOf("cta-stripe"), "Stripe CTA is elevated").not.toBe("none");
    expect(await boxShadowOf("cta-bloomberg"), "Bloomberg CTA is flat").toBe("none");

    // (4) on-page isolation: customizing Stripe (Soften → radius 16) leaves Bloomberg's CTA unchanged.
    // Wait on Stripe's --radius var ACTUALLY changing (a real settle signal, not a vacuous `|| true`).
    const stripeRadiusBefore = await page.evaluate(() => (document.querySelector('[data-testid="scope-stripe"]') as HTMLElement).style.getPropertyValue("--radius"));
    await page.locator('[data-testid="example-stripe"]', { hasText: "Soften" }).click();
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="scope-stripe"]') as HTMLElement).style.getPropertyValue("--radius") !== prev,
      stripeRadiusBefore,
    );
    expect(close(await ctaBg(page, "cta-bloomberg"), bloombergLight), "Bloomberg unchanged while Stripe is customized").toBe(true);

    // (5) shared toggle swaps BOTH to their dark primaries (each differs from its own light)
    await page.click('[data-testid="shared-toggle"]');
    await waitForCta(page, "cta-stripe", STRIPE_DARK);
    await waitForCta(page, "cta-bloomberg", BLOOMBERG_DARK);
    expect(close(await ctaBg(page, "cta-stripe"), STRIPE_LIGHT), "stripe actually swapped").toBe(false);
    expect(close(await ctaBg(page, "cta-bloomberg"), BLOOMBERG_LIGHT), "bloomberg actually swapped").toBe(false);

    await page.close();
  });
});
