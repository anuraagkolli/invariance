import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_TOKENS } from "@invariance/design/server";
import { initDetailed } from "../src/cli";
import { GEN_END, GEN_START, applyInit, locateNextApp, patchGlobalsCss, renderRootBlock } from "../src/apply";

// create-next-app's default root layout: no <head>, sync default export.
const CNA_LAYOUT = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Acme" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const HEAD_LAYOUT = `import type { ReactNode } from 'react'
import '../styles/app.css'

function Helper() {
  return (<span />)
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  )
}
`;

async function nextApp(opts: { srcDir?: boolean; layout?: string; cssRel?: string; css?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "invariance-apply-"));
  const base = opts.srcDir ? join(root, "src") : root;
  await mkdir(join(base, "app"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "acme-next", dependencies: { next: "15.0.0", react: "^18.0.0" } }),
  );
  await writeFile(join(base, "app", "layout.tsx"), opts.layout ?? CNA_LAYOUT);
  const cssRel = opts.cssRel ?? join("app", "globals.css");
  await mkdir(join(base, cssRel, ".."), { recursive: true });
  await writeFile(join(base, cssRel), opts.css ?? ":root {\n  --background: #0b0b10;\n  --brand: #7c5cff;\n}\n");
  await writeFile(join(base, "app", "page.tsx"), `export default function Page() { return <main style={{ color: "#7c5cff" }}>hi</main>; }\n`);
  return root;
}

const ROLES = { "--inv-surface-0": "oklch(0.2 0.01 250)", "--inv-accent": "oklch(0.6 0.15 250)" };

describe("locateNextApp", () => {
  it("finds app/ and src/app/ layouts and the stylesheet the layout imports", async () => {
    const a = await nextApp();
    expect(locateNextApp(a)).toEqual({
      layoutFile: join(a, "app", "layout.tsx"),
      globalsCssFile: join(a, "app", "globals.css"),
    });
    const b = await nextApp({ srcDir: true, layout: HEAD_LAYOUT, cssRel: join("styles", "app.css") });
    expect(locateNextApp(b)).toEqual({
      layoutFile: join(b, "src", "app", "layout.tsx"),
      globalsCssFile: join(b, "src", "styles", "app.css"),
    });
  });

  it("returns nulls for a non-Next repo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "invariance-apply-"));
    expect(locateNextApp(dir)).toEqual({ layoutFile: null, globalsCssFile: null });
  });
});

describe("patchGlobalsCss", () => {
  it("appends a marked :root block, preserves the app's CSS, and is idempotent", async () => {
    const root = await nextApp();
    const file = join(root, "app", "globals.css");
    const original = await readFile(file, "utf8");

    expect(await patchGlobalsCss(file, ROLES)).toBe("created");
    const once = await readFile(file, "utf8");
    expect(once.startsWith(original)).toBe(true);
    expect(once).toContain(renderRootBlock(ROLES));

    expect(await patchGlobalsCss(file, ROLES)).toBe("unchanged");
    expect(await readFile(file, "utf8")).toBe(once);

    // A new theme replaces the block in place; only one block ever exists.
    expect(await patchGlobalsCss(file, { ...ROLES, "--inv-accent": "oklch(0.7 0.1 30)" })).toBe("updated");
    const twice = await readFile(file, "utf8");
    expect(twice.split(GEN_START).length - 1).toBe(1);
    expect(twice.split(GEN_END).length - 1).toBe(1);
    expect(twice).toContain("--inv-accent: oklch(0.7 0.1 30);");
    expect(twice.startsWith(original)).toBe(true);
  });
});

describe("applyInit", () => {
  it("themes a create-next-app layout: config module, SSR <head> style, async export", async () => {
    const root = await nextApp();
    const report = await applyInit(root, "acme-next", ROLES);
    expect(report.skipped).toEqual([]);
    expect(report.edits.map((e) => [e.file, e.status])).toEqual([
      [join(root, "app", "globals.css"), "created"],
      [join(root, "invariance.config.ts"), "created"],
      [join(root, "app", "layout.tsx"), "created"],
    ]);

    const layout = await readFile(join(root, "app", "layout.tsx"), "utf8");
    expect(layout).toContain('import { headers } from "next/headers";');
    expect(layout).toContain('import { renderThemeCss, themeFromCookieHeader } from "@invariance/design"');
    expect(layout).toContain('import { invarianceConfig } from "../invariance.config"');
    expect(layout).toContain("export default async function RootLayout");
    expect(layout).toContain('const cookieHeader = (await headers()).get("cookie");');
    expect(layout).toMatch(/\n    <html lang="en">\n      <head>\{ssrCss \? <style id="inv-ssr-theme"/);
    // The SSR lines sit inside the default export, before its return.
    const fn = layout.indexOf("export default async function");
    expect(layout.indexOf("const ssrCss")).toBeGreaterThan(fn);
    expect(layout.indexOf("const ssrCss")).toBeLessThan(layout.indexOf("return (", fn));

    const config = await readFile(join(root, "invariance.config.ts"), "utf8");
    expect(config).toContain('export const invarianceConfig: InvarianceConfig = { app: "acme-next" }');

    // Re-running changes nothing.
    const again = await applyInit(root, "acme-next", ROLES);
    expect(again.edits.every((e) => e.status === "unchanged")).toBe(true);
    expect(await readFile(join(root, "app", "layout.tsx"), "utf8")).toBe(layout);
  });

  it("inserts into an existing <head>, anchors past helper components, keeps quote style", async () => {
    const root = await nextApp({ srcDir: true, layout: HEAD_LAYOUT, cssRel: join("styles", "app.css") });
    const report = await applyInit(root, "acme", ROLES);
    expect(report.skipped).toEqual([]);
    expect(report.edits.map((e) => e.file)).toContain(join(root, "src", "invariance.config.ts"));

    const layout = await readFile(join(root, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("import { invarianceConfig } from '../invariance.config'\n");
    expect(layout).toContain("function Helper() {\n  return (<span />)");
    expect(layout).toMatch(/<link rel="icon" href="\/favicon.ico" \/>\n\s+\{ssrCss \? <style id="inv-ssr-theme"[^\n]*\n\s+<\/head>/);
    expect(layout.match(/export default async function/g)).toHaveLength(1);
    expect(await readFile(join(root, "src", "styles", "app.css"), "utf8")).toContain(GEN_START);
  });

  it("leaves an unrecognised layout untouched and reports why", async () => {
    const odd = `import "./globals.css"\nexport const RootLayout = ({ children }) => children\nexport default RootLayout\n`;
    const root = await nextApp({ layout: odd });
    const report = await applyInit(root, "acme", ROLES);
    expect(report.skipped).toEqual([{ what: "SSR theme inlining", reason: "no `export default function` root layout" }]);
    expect(await readFile(join(root, "app", "layout.tsx"), "utf8")).toBe(odd);
  });
});

describe("review fixes", () => {
  it("ignores a globals.css the layout doesn't import", async () => {
    const noImport = CNA_LAYOUT.replace('import "./globals.css";\n', "");
    const root = await nextApp({ layout: noImport });
    expect(locateNextApp(root).globalsCssFile).toBeNull();
    const report = await applyInit(root, "acme-next", ROLES);
    expect(report.skipped).toContainEqual({ what: "globals.css", reason: "root layout imports no local stylesheet" });
    expect(await readFile(join(root, "app", "globals.css"), "utf8")).not.toContain(GEN_START);
  });

  it("refuses to rewrite a generated block whose end marker is missing", async () => {
    const root = await nextApp();
    const file = join(root, "app", "globals.css");
    const damaged = `${GEN_START}\n:root {\n  --inv-accent: red;\n}\n.button { color: red; }\n`;
    await writeFile(file, damaged);
    expect(await patchGlobalsCss(file, ROLES)).toBe("malformed");
    const report = await applyInit(root, "acme-next", ROLES);
    expect(report.skipped.map((s) => s.what)).toContain("globals.css");
    expect(await readFile(file, "utf8")).toBe(damaged);
  });

  it("leaves the layout alone when an existing config declares a different app id", async () => {
    const root = await nextApp();
    await writeFile(join(root, "invariance.config.ts"), "export const invarianceConfig = { app: 'legacy' }\n");
    const report = await applyInit(root, "storefront", ROLES);
    expect(report.skipped).toContainEqual({
      what: "SSR theme inlining",
      reason: 'invariance.config.ts declares app "legacy", not "storefront"; the theme cookie name would not match',
    });
    expect(await readFile(join(root, "app", "layout.tsx"), "utf8")).toBe(CNA_LAYOUT);

    const ok = await applyInit(root, "legacy", ROLES);
    expect(ok.skipped).toEqual([]);
    expect(ok.edits).toContainEqual({ file: join(root, "invariance.config.ts"), status: "unchanged" });
    expect(await readFile(join(root, "app", "layout.tsx"), "utf8")).toContain("inv-ssr-theme");
  });
});

describe("init --apply", () => {
  it("writes the compiled role tokens into globals.css alongside the manifest", async () => {
    const root = await nextApp();
    const outcome = await initDetailed({ "no-ai": "true", apply: "true" }, root, null);
    expect(outcome.applied?.skipped).toEqual([]);
    const css = await readFile(join(root, "app", "globals.css"), "utf8");
    for (const token of ROLE_TOKENS) expect(css).toContain(`  ${token}: `);

    const manifest = JSON.parse(await readFile(outcome.manifestFile, "utf8")) as {
      designTokens: Array<{ name: string; value: string }>;
    };
    const accent = manifest.designTokens.find((t) => t.name === "--inv-accent")!;
    expect(css).toContain(`--inv-accent: ${accent.value};`);
  });

  it("without --apply, still edits nothing", async () => {
    const root = await nextApp();
    const before = await readFile(join(root, "app", "layout.tsx"), "utf8");
    const outcome = await initDetailed({ "no-ai": "true" }, root, null);
    expect(outcome.applied).toBeUndefined();
    expect(await readFile(join(root, "app", "layout.tsx"), "utf8")).toBe(before);
    expect(await readFile(join(root, "app", "globals.css"), "utf8")).not.toContain(GEN_START);
  });
});
