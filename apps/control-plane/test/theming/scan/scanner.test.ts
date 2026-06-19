// apps/control-plane/test/theming/scan/scanner.test.ts
import { describe, it, expect } from "vitest";
import { VOCAB_VERSION, PROFILE_VERSION } from "@invariance/theming";
import type { ScanPayload } from "@invariance/theming";
import { runScanner } from "../../../src/theming/scan/scanner.js";

// A minimal shadcn-shaped scan: background + primary + their foregrounds, both modes,
// all consumed via hsl(var(--x)); plus a raw-consumed radius number.
const PAYLOAD: ScanPayload = {
  scanVersion: 1,
  origin: "https://app.example.com",
  variables: [
    {
      name: "--background",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 100%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--foreground",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 98%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--primary",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "240 5.9% 10%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 98%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--radius",
      declarations: [{ selector: ":root", mode: "light", rawValue: "0.5rem", heldFormat: "number" }],
    },
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
    "--foreground": [{ wrapping: "hsl", selector: "body", property: "color" }],
    "--primary": [{ wrapping: "hsl", selector: ".btn", property: "background-color" }],
    "--radius": [{ wrapping: "raw", selector: ".btn", property: "border-radius" }],
  },
  opaqueSheets: [],
};

const OPTS = {
  appId: "demo-app",
  vocabVersion: VOCAB_VERSION,
  profileVersion: PROFILE_VERSION,
  contrastTier: "AA" as const,
};

describe("runScanner — manifest assembly", () => {
  it("binds vars to roles by canonical name with confirmed confidence", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.appId).toBe("demo-app");
    expect(manifest.vocabVersion).toBe(VOCAB_VERSION);
    expect(manifest.variables["--background"]!.role).toBe("background");
    expect(manifest.variables["--primary"]!.role).toBe("primary");
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
  });

  it("emits triple/hsl for hsl-consumed colors and number/null for raw radius", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.variables["--primary"]!.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
    expect(manifest.variables["--radius"]!.emit).toEqual({ shape: "number", space: null, precision: 4 });
  });

  it("captures per-mode selectors and both base maps verbatim", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.modes.allowed.sort()).toEqual(["dark", "light"]);
    expect(manifest.modes.selectors.light).toBe(":root");
    expect(manifest.modes.selectors.dark).toBe(".dark");
    expect(manifest.base.light["background"]).toBe("0 0% 100%");
    expect(manifest.base.dark!["primary"]).toBe("0 0% 98%");
  });

  it("captures defaultSeeds from the seed roles", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.defaultSeeds.colors.primary).toBe("240 5.9% 10%");
    expect(manifest.defaultSeeds.radius).toBe(0.5);
  });
});

describe("runScanner — coverage report", () => {
  it("classifies mapped vars and lists none needing confirmation for a clean scan", () => {
    const { coverage } = runScanner(PAYLOAD, OPTS);
    expect(coverage.classified.map((c) => c.name).sort()).toContain("--primary");
    expect(coverage.needsConfirmation).toEqual([]);
    expect(coverage.opaqueSheetCount).toBe(0);
  });

  it("routes an unknown-named color var to unmapped", () => {
    const withExtra: ScanPayload = {
      ...PAYLOAD,
      variables: [
        ...PAYLOAD.variables,
        {
          name: "--brand-glow",
          declarations: [{ selector: ":root", mode: "light", rawValue: "120 50% 50%", heldFormat: "hsl-triple" }],
        },
      ],
    };
    const { coverage } = runScanner(withExtra, OPTS);
    expect(coverage.unmapped).toContain("--brand-glow");
    expect(coverage.classified.find((c) => c.name === "--brand-glow")).toBeUndefined();
  });

  it("mechanically downgrades to needsConfirmation/opaque_sheet when opaqueSheets is non-empty", () => {
    const opaque: ScanPayload = { ...PAYLOAD, opaqueSheets: ["https://cdn.other.com/x.css"] };
    const { coverage, manifest } = runScanner(opaque, OPTS);
    expect(coverage.opaqueSheetCount).toBe(1);
    // colors consumed via hsl with corroborating hsl-triple held STAY confirmed (held corroborates);
    // a var whose held does not corroborate is downgraded. Here all colors corroborate, radius raw+number corroborates,
    // so the clean shadcn shape stays confirmed even under an opaque sheet (the honest carve-out).
    expect(manifest.variables["--primary"]!.confidence).toBe("confirmed");
  });
});
