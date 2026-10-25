import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AppManifestSchema, type AppManifest } from "@invariance/schema";
import { ROLE_TOKENS, StyleSpecSchema } from "@invariance/design/server";
import { initDetailed } from "../src/cli";
import { draftManifest, manifestFromScan } from "../src/draft";
import { scanRepo } from "../src/scan";

/** Recursively snapshot relative path -> contents (skips node_modules). */
async function snapshotDir(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(d: string): Promise<void> {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else out.set(relative(dir, p), await readFile(p, "utf8"));
    }
  }
  await walk(dir);
  return out;
}

/** A miniature React+Express app with everything the scanner looks for. */
async function fixtureRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "invariance-init-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "acme-shop",
      dependencies: { react: "^18.0.0", express: "^4.0.0" },
    }),
  );
  await mkdir(join(dir, "src", "components"), { recursive: true });
  await mkdir(join(dir, "server"), { recursive: true });
  await writeFile(
    join(dir, "src", "styles.css"),
    `:root {
      --accent-color: #7c5cff;
      --card-radius: 12px;
      --body-font: "Inter", sans-serif;
      --derived: var(--accent-color);
    }`,
  );
  await writeFile(
    join(dir, "src", "components", "ProductCard.tsx"),
    `export function ProductCard() { return null; }
     export const PriceTag = () => null;`,
  );
  await writeFile(
    join(dir, "server", "routes.ts"),
    `app.get("/api/products", listProducts);
     router.post("/api/cart", addToCart);
     app.get(dynamicPath, noString); // not extractable: ignored`,
  );
  // Noise that must be skipped.
  await mkdir(join(dir, "node_modules", "junk"), { recursive: true });
  await writeFile(join(dir, "node_modules", "junk", "x.css"), ":root { --junk: red; }");
  return dir;
}

describe("scanRepo", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fixtureRepo();
  });

  it("detects frameworks, tokens, routes, and components; skips node_modules and var() chains", () => {
    const scan = scanRepo(dir);
    expect(scan.packageName).toBe("acme-shop");
    expect(scan.frameworks).toEqual({ react: true, next: false, express: true });
    expect(scan.cssTokens.map((t) => t.name).sort()).toEqual([
      "--accent-color",
      "--body-font",
      "--card-radius",
    ]);
    expect(scan.routes).toEqual([
      { method: "GET", path: "/api/products", file: join("server", "routes.ts") },
      { method: "POST", path: "/api/cart", file: join("server", "routes.ts") },
    ]);
    expect(scan.components.map((c) => c.name).sort()).toEqual(["PriceTag", "ProductCard"]);
  });

  it("maps Next.js app-router files to endpoint paths", async () => {
    const next = await mkdtemp(join(tmpdir(), "invariance-next-"));
    await mkdir(join(next, "app", "api", "users", "[id]"), { recursive: true });
    await writeFile(
      join(next, "app", "api", "users", "[id]", "route.ts"),
      `export async function GET() {}\nexport async function DELETE() {}`,
    );
    const scan = scanRepo(next);
    expect(scan.routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "DELETE /api/users/:id",
      "GET /api/users/:id",
    ]);
  });
});

describe("draftManifest", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fixtureRepo();
  });

  it("deterministic draft is schema-valid with classified token kinds", () => {
    const manifest = manifestFromScan(scanRepo(dir), "acme-shop");
    expect(() => AppManifestSchema.parse(manifest)).not.toThrow();
    const kinds = Object.fromEntries(manifest.designTokens.map((t) => [t.name, t.kind]));
    expect(kinds["--accent-color"]).toBe("color");
    expect(kinds["--card-radius"]).toBe("radius");
    expect(kinds["--body-font"]).toBe("typography");
    expect(manifest.endpoints.map((e) => e.id)).toEqual(["get-api-products", "post-api-cart"]);
  });

  it("repairs an invalid model draft by feeding zod issues back", async () => {
    const scan = scanRepo(dir);
    const good = manifestFromScan(scan, "acme-shop");
    const calls: string[] = [];
    const llm = async (_system: string, user: string) => {
      calls.push(user);
      return calls.length === 1 ? { ...good, version: "not-semver" } : good;
    };
    const result = await draftManifest(scan, "acme-shop", llm);
    expect(result.source).toBe("ai");
    expect(result.attempts).toBe(2);
    expect(calls[1]).toContain("must be semver");
  });

  it("falls back to the scan draft when every attempt fails", async () => {
    const scan = scanRepo(dir);
    const result = await draftManifest(scan, "acme-shop", async () => ({ junk: true }), 2);
    expect(result.source).toBe("scan");
    expect(() => AppManifestSchema.parse(result.manifest)).not.toThrow();
  });

  it("never lets the model change the appId", async () => {
    const scan = scanRepo(dir);
    const hijacked = { ...manifestFromScan(scan, "acme-shop"), appId: "evil" };
    const result = await draftManifest(scan, "acme-shop", async () => hijacked);
    expect(result.manifest.appId).toBe("acme-shop");
  });
});

describe("initDetailed", () => {
  it("writes a valid manifest and a framework-specific guide", async () => {
    const dir = await fixtureRepo();
    const outcome = await initDetailed({}, dir, null);
    expect(outcome.source).toBe("scan");
    // 3 observed CSS tokens + the 38 role tokens the design engine manages.
    expect(outcome.counts.tokens).toBe(3 + ROLE_TOKENS.length);
    expect(outcome.counts.endpoints).toBe(2);
    expect(outcome.counts.components).toBe(2);

    const manifest = AppManifestSchema.parse(
      JSON.parse(await readFile(outcome.manifestFile, "utf8")),
    ) as AppManifest;
    expect(manifest.appId).toBe("acme-shop"); // from package.json name

    // The full role-token vocabulary is declared — the app is compiler-ready.
    const names = new Set(manifest.designTokens.map((t) => t.name));
    for (const token of ROLE_TOKENS) expect(names.has(token), `missing ${token}`).toBe(true);

    // A schema-valid StyleSpec is inferred and reported.
    expect(() => StyleSpecSchema.parse(outcome.styleSpec)).not.toThrow();

    const guide = await readFile(outcome.guideFile, "utf8");
    expect(guide).toContain("InvarianceProvider"); // react wiring
    expect(guide).toContain("createInvarianceMiddleware"); // express wiring
    expect(guide).toContain('appId: "acme-shop"');
  });

  it("writes only the manifest + guide — never edits existing source", async () => {
    const dir = await fixtureRepo();
    const before = await snapshotDir(dir);
    await initDetailed({}, dir, null);
    const after = await snapshotDir(dir);

    // Every pre-existing file is byte-identical.
    for (const [path, content] of before) {
      expect(after.get(path), `${path} was modified`).toBe(content);
    }
    // The only new files are the two generated artifacts.
    const created = [...after.keys()].filter((p) => !before.has(p)).sort();
    expect(created).toEqual(["INVARIANCE.md", "invariance.manifest.json"]);
  });
});
