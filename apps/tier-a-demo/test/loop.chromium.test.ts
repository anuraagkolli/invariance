import { fileURLToPath } from "node:url";
import { compile, parseSpec } from "@invariance/theming";
import { type Browser, chromium } from "playwright";
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
const close = (a: [number, number, number], b: [number, number, number], tol = 3): boolean =>
  a.every((v, i) => Math.abs(v - b[i]) <= tol);

// The Stripe beat's expected emitted primary (same inputs as SCRIPT's Stripe turn), and the base.
const parsed = parseSpec(
  {
    colors: { primary: "oklch(0.55 0.21 280)", accent: "oklch(0.72 0.12 280)", neutral: "oklch(0.985 0.004 280)" },
    radius: 12,
    density: "spacious",
    typography: { display: "geist-sans", body: "geist-sans", mono: "geist-mono" },
    shadow: "soft",
    borderWeight: "standard",
  },
  DEMO_MANIFEST,
);
if (!parsed.ok) throw new Error("setup");
const THEME = compile(parsed.spec, DEMO_MANIFEST);
const THEMED = rgb255(THEME.light["--primary"]);
const THEMED_DARK = rgb255(THEME.dark!["--primary"]); // mode-polarized — differs from light
const BASE = rgb255(DEMO_MANIFEST.base.light.primary);

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

describe("chromium e2e: the customize loop", () => {
  it("a prompt re-themes the preview; vibe assertions prove the shift; a rejection AFTER publish does not disturb it", async () => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="cta"]');
    const ctaBg = async (): Promise<[number, number, number]> =>
      parseCssRgb(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="cta"]')!).backgroundColor));

    // starts at the base primary (wait for it to settle — the scoped re-theme CSS transition
    // animates the CTA from its initial fallback to the base color over ~0.3s on first paint)
    await page.waitForFunction(
      (t) => {
        const el = document.querySelector('[data-testid="cta"]');
        if (!el) return false;
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
        if (!m) return false;
        const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
        return Math.abs(r - t[0]) <= 3 && Math.abs(g - t[1]) <= 3 && Math.abs(b - t[2]) <= 3;
      },
      BASE,
    );
    expect(close(await ctaBg(), BASE), "starts at base").toBe(true);

    // capture base geometry — the vibe shift must move RADIUS + SPACING, not just color
    const ctaGeom = async (): Promise<{ radius: number; pad: number }> =>
      page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('[data-testid="cta"]')!);
        return { radius: Number.parseFloat(s.borderTopLeftRadius), pad: Number.parseFloat(s.paddingTop) };
      });
    const baseGeom = await ctaGeom();

    // click the Stripe example chip (fills the input) → Send → the preview re-themes
    await page.locator('[data-testid="example"]', { hasText: "Stripe" }).click();
    await page.locator('[data-testid="send"]').click();
    await page.waitForFunction(
      (t) => {
        const el = document.querySelector('[data-testid="cta"]');
        if (!el) return false;
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
        if (!m) return false;
        const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
        return Math.abs(r - t[0]) <= 3 && Math.abs(g - t[1]) <= 3 && Math.abs(b - t[2]) <= 3;
      },
      THEMED,
    );
    expect(close(await ctaBg(), THEMED), "themed Stripe primary").toBe(true);
    expect(close(await ctaBg(), BASE)).toBe(false);

    // vibe-shift assertions: the dashboard now reflects the Stripe look
    // (1) fontFamily contains "Geist" (was system-ui before theming)
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="panel"]') ?? document.querySelector('[data-profile]') ?? document.querySelector('[data-testid="scope"]');
      if (!panel) return false;
      return getComputedStyle(panel).fontFamily.toLowerCase().includes("geist");
    });
    const panelFont = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="panel"]') ?? document.querySelector('[data-profile]') ?? document.querySelector('[data-testid="scope"]');
      return el ? getComputedStyle(el).fontFamily : "";
    });
    expect(panelFont.toLowerCase(), "font is now Geist after Stripe").toContain("geist");

    // (2) data-profile on the scope is "roomy" (Stripe: radius=12, shadow=soft → roomy)
    const profile = await page.evaluate(() => {
      const el = document.querySelector('[data-profile]');
      return el?.getAttribute('data-profile') ?? null;
    });
    expect(profile, "profile=roomy after Stripe").toBe("roomy");

    // (3) geometry shifted too: corner radius up (base 8 → 12) and padding up (comfortable → spacious).
    // Wait for the radius transition to settle past the base value, then assert both grew.
    await page.waitForFunction((base) => {
      const s = getComputedStyle(document.querySelector('[data-testid="cta"]')!);
      return Number.parseFloat(s.borderTopLeftRadius) > base + 1;
    }, baseGeom.radius);
    const themedGeom = await ctaGeom();
    expect(themedGeom.radius, "corner radius increased").toBeGreaterThan(baseGeom.radius);
    expect(themedGeom.pad, "padding increased (spacious density)").toBeGreaterThan(baseGeom.pad);

    // publish is disabled until acknowledged (the governance beat)
    expect(await page.locator('[data-testid="publish"]').isDisabled(), "publish disabled before acknowledge").toBe(true);

    // acknowledge → publish (a customized, LIVE look)
    await page.locator('[data-testid="acknowledge"]').click();
    expect(await page.locator('[data-testid="publish"]').isDisabled(), "publish enabled after acknowledge").toBe(false);
    await page.locator('[data-testid="publish"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="publish"]')?.textContent?.includes("Live") === true);
    const published = await ctaBg();
    expect(close(published, THEMED)).toBe(true);

    // a governance rejection AFTER publish → the panel shows it, the published preview is UNCHANGED
    // Use the compact-density prompt (target_size_floor) — the new beat
    await page.locator('[data-testid="example"]', { hasText: "compact" }).click();
    await page.locator('[data-testid="send"]').click();
    await page.waitForSelector('[data-testid="rejection"]');
    expect(close(await ctaBg(), published), "rejection did not disturb the published look").toBe(true);

    // light↔dark toggle swaps the rendered colors (mode-polarized — dark ≠ light), the climax cascade.
    await page.locator('[data-testid="toggle-dark"]').click();
    await page.waitForFunction(
      (t) => {
        const el = document.querySelector('[data-testid="cta"]');
        if (!el) return false;
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
        if (!m) return false;
        const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
        return Math.abs(r - t[0]) <= 3 && Math.abs(g - t[1]) <= 3 && Math.abs(b - t[2]) <= 3;
      },
      THEMED_DARK,
    );
    const dark = await ctaBg();
    expect(close(dark, THEMED_DARK), "dark themed primary").toBe(true);
    expect(close(dark, THEMED), "dark differs from light (the toggle swapped)").toBe(false);

    await page.close();
  });
});
