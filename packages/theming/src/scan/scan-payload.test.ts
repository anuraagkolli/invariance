// packages/theming/src/scan/scan-payload.test.ts
import { describe, it, expect } from "vitest";
import { ScanPayload } from "./scan-payload.js";

const VALID = {
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
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
  },
  opaqueSheets: [],
};

describe("ScanPayload schema", () => {
  it("parses a well-formed payload and infers the type", () => {
    const parsed = ScanPayload.parse(VALID);
    expect(parsed.variables[0]!.name).toBe("--background");
    expect(parsed.variables[0]!.declarations[1]!.mode).toBe("dark");
    expect(parsed.consumption["--background"]![0]!.wrapping).toBe("hsl");
    expect(parsed.opaqueSheets).toEqual([]);
  });

  it("rejects an unknown declaration mode", () => {
    const bad = structuredClone(VALID);
    (bad.variables[0]!.declarations[0] as any).mode = "system";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown heldFormat", () => {
    const bad = structuredClone(VALID);
    (bad.variables[0]!.declarations[0] as any).heldFormat = "lab";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown consumption wrapping", () => {
    const bad = structuredClone(VALID);
    (bad.consumption["--background"]![0] as any).wrapping = "lch";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-string opaqueSheets entry", () => {
    const bad = structuredClone(VALID);
    (bad.opaqueSheets as any[]).push(42);
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });
});
