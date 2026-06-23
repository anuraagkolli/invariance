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

// the indigo beat's expected emitted primary (same inputs as SCRIPT's indigo turn), and the base.
const parsed = parseSpec({ colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 }, DEMO_MANIFEST);
if (!parsed.ok) throw new Error("setup");
const THEMED = rgb255(compile(parsed.spec, DEMO_MANIFEST).light["--primary"]);
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
  it("a prompt re-themes the preview; a rejection AFTER publish does not disturb it", async () => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="cta"]');
    const ctaBg = async (): Promise<[number, number, number]> =>
      parseCssRgb(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="cta"]')!).backgroundColor));

    // starts at the base primary
    expect(close(await ctaBg(), BASE), "starts at base").toBe(true);

    // click the indigo example → the preview re-themes (applied advances on the diff)
    await page.locator('[data-testid="example"]', { hasText: "deep indigo" }).click();
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
    expect(close(await ctaBg(), THEMED), "themed indigo").toBe(true);
    expect(close(await ctaBg(), BASE)).toBe(false);

    // acknowledge → publish (a customized, LIVE look)
    await page.locator('[data-testid="acknowledge"]').click();
    await page.locator('[data-testid="publish"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="publish"]')?.textContent?.includes("Live") === true);
    const published = await ctaBg();
    expect(close(published, THEMED)).toBe(true);

    // a governance rejection AFTER publish → the panel shows it, the published preview is UNCHANGED
    await page.locator('[data-testid="example"]', { hasText: "error state" }).click();
    await page.waitForSelector('[data-testid="rejection"]');
    expect(close(await ctaBg(), published), "rejection did not disturb the published look").toBe(true);

    await page.close();
  });
});
