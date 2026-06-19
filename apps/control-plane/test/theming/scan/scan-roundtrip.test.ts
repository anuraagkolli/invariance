// apps/control-plane/test/theming/scan/scan-roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { VOCAB_VERSION, PROFILE_VERSION } from "@invariance/theming";
import type { ScanPayload } from "@invariance/theming";
import { runScanner } from "../../../src/theming/scan/scanner.js";

// A payload shaped exactly as scan() emits (see scan.test.ts): a color-mix consumer
// downgrades to inferred, an opaque sheet downgrades a non-corroborating var, while
// the corroborating shadcn colors stay confirmed.
const SDK_SHAPED: ScanPayload = {
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
      name: "--ring",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "240 5% 65%", heldFormat: "hsl-triple" },
      ],
    },
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
    "--foreground": [{ wrapping: "hsl", selector: "body", property: "color" }],
    // --ring is consumed through color-mix → must downgrade to inferred/color_mix
    "--ring": [{ wrapping: "color-mix", selector: ".focus", property: "box-shadow" }],
  },
  opaqueSheets: [],
};

const OPTS = {
  appId: "roundtrip",
  vocabVersion: VOCAB_VERSION,
  profileVersion: PROFILE_VERSION,
  contrastTier: "AA" as const,
};

describe("scan → runScanner contract roundtrip", () => {
  it("color-mix consumer is routed to needsConfirmation with reason color_mix", () => {
    const { manifest, coverage } = runScanner(SDK_SHAPED, OPTS);
    expect(manifest.variables["--ring"]!.confidence).toBe("inferred");
    expect(coverage.needsConfirmation).toContainEqual({ name: "--ring", reason: "color_mix" });
  });

  it("hsl-corroborated colors stay confirmed and produce triple/hsl emit", () => {
    const { manifest } = runScanner(SDK_SHAPED, OPTS);
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
    expect(manifest.variables["--background"]!.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });

  it("non-empty opaqueSheets downgrades a non-corroborating var but not corroborating ones", () => {
    const opaque: ScanPayload = {
      ...SDK_SHAPED,
      // add a raw-consumed var whose held is 'unknown' (no corroboration) → opaque_sheet downgrade
      variables: [
        ...SDK_SHAPED.variables,
        {
          name: "--border",
          declarations: [{ selector: ":root", mode: "light", rawValue: "0 0% 90%", heldFormat: "hsl-triple" }],
        },
      ],
      consumption: {
        ...SDK_SHAPED.consumption,
        "--border": [{ wrapping: "other", selector: ".x", property: "border-color" }],
      },
      opaqueSheets: ["https://cdn.other.com/x.css"],
    };
    const { manifest, coverage } = runScanner(opaque, OPTS);
    expect(coverage.opaqueSheetCount).toBe(1);
    // background (hsl + hsl-triple held) corroborates → stays confirmed even under opaque sheet
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
    // border (other wrapping, no corroboration) → downgraded to inferred/opaque_sheet
    expect(manifest.variables["--border"]!.confidence).toBe("inferred");
    expect(coverage.needsConfirmation).toContainEqual({ name: "--border", reason: "opaque_sheet" });
  });
});
