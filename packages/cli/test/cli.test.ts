import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dev, init, parseFlags, publishManifest, type DevServer } from "../src/cli";

describe("parseFlags", () => {
  it("parses --name value, --name=value, and bare booleans", () => {
    expect(parseFlags(["publish", "--file", "m.json", "--registry=http://x", "--verbose"])).toEqual({
      flags: { file: "m.json", registry: "http://x", verbose: "true" },
      rest: ["publish"],
    });
  });
});

describe("init + manifest publish + dev (against a real local control plane)", () => {
  let dir: string;
  let server: DevServer;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "invariance-cli-"));
    server = await dev({ port: "0", manifest: join(dir, "missing.json") });
  });

  afterAll(async () => {
    await server.close();
  });

  it("init scaffolds a valid manifest and refuses to overwrite", async () => {
    const file = await init({ app: "acme", "no-ai": "true" }, dir);
    const manifest = JSON.parse(await readFile(file, "utf8")) as { appId: string };
    expect(manifest.appId).toBe("acme");
    await expect(init({ app: "acme", "no-ai": "true" }, dir)).rejects.toThrow(
      /refusing to overwrite/,
    );
  });

  it("manifest publish pushes the file to the registry", async () => {
    const file = join(dir, "invariance.manifest.json");
    const result = await publishManifest({ file, registry: server.url });
    expect(result).toEqual({ appId: "acme", version: "1.0.0", staleMods: 0 });

    const fetched = await fetch(`${server.url}/v1/apps/acme/manifest`);
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as { version: string }).version).toBe("1.0.0");
  });

  it("publish rejects a broken manifest with a clear error", async () => {
    const bad = join(dir, "bad.json");
    await writeFile(bad, JSON.stringify({ appId: "acme" }));
    await expect(publishManifest({ file: bad, registry: server.url })).rejects.toThrow(
      /invalid manifest/,
    );
  });

  it("publish rejects a missing file", async () => {
    await expect(
      publishManifest({ file: join(dir, "nope.json"), registry: server.url }),
    ).rejects.toThrow(/not found/);
  });
});
