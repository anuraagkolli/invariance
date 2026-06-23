import { fileURLToPath } from "node:url";
import { compile, parseSpec } from "@invariance/theming";
import { type Browser, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { hslTripleToSrgb } from "./_measure.js";

// ── independent expected RGB (0–255) from an emitted bare HSL triple, computed without the browser ──
function rgb255(triple: string): [number, number, number] {
  const [r, g, b] = hslTripleToSrgb(triple);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function parseCssRgb(s: string): [number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error(`not an rgb string: ${s}`);
  const [r, g, b] = m[1].split(",").map((x) => Math.round(parseFloat(x)));
  return [r, g, b];
}
const close = (a: [number, number, number], b: [number, number, number], tol = 3): boolean =>
  a.every((v, i) => Math.abs(v - b[i]) <= tol);

// recompute the App's SAMPLE_THEME from the SAME inputs as App.tsx (the engine is deterministic)
const parsed = parseSpec({ colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 }, DEMO_MANIFEST);
if (!parsed.ok) throw new Error("setup: sample spec rejected");
const THEME = compile(parsed.spec, DEMO_MANIFEST);

let server: ViteDevServer;
let browser: Browser;
let url: string;

beforeAll(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { port: 0 },
    logLevel: "error",
  });
  await server.listen();
  url = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("chromium: the scoped applier re-themes the REAL dashboard", () => {
  it("CTA reflects the themed primary in light, and the dark toggle swaps it", async () => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    // wait for applyScoped (mount effect) to set the wrapper's --primary
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="scope"]') as HTMLElement | null)?.style.getPropertyValue("--primary") !== "",
    );
    const ctaBg = async (): Promise<[number, number, number]> =>
      parseCssRgb(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="cta"]')!).backgroundColor));

    // LIGHT: the CTA renders the themed indigo primary, independently derived — and NOT the base primary.
    const light = await ctaBg();
    expect(close(light, rgb255(THEME.light["--primary"])), `light cta ${light} vs themed ${rgb255(THEME.light["--primary"])}`).toBe(true);
    expect(close(light, rgb255(DEMO_MANIFEST.base.light.primary)), "themed must differ from base primary").toBe(false);

    // DARK: toggling sets the dark var map + .dark on the wrapper → the rendered color genuinely swaps.
    await page.click('[data-testid="toggle-dark"]');
    await page.waitForFunction(() => (document.querySelector('[data-testid="scope"]') as HTMLElement | null)?.classList.contains("dark") === true);
    const dark = await ctaBg();
    expect(close(dark, rgb255(THEME.dark!["--primary"])), `dark cta ${dark} vs themed ${rgb255(THEME.dark!["--primary"])}`).toBe(true);
    expect(close(dark, light), "dark must differ from light (the toggle swapped)").toBe(false);

    await page.close();
  });
});
