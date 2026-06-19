// packages/client/src/theming/scan-sdk/css-text.test.ts
import { describe, it, expect } from "vitest";
import { parseRuleBlocks, collectCustomPropDecls, collectVarUseSites } from "./css-text.js";

const SHEET = `
:root { --background: 0 0% 100%; --primary: 240 5.9% 10%; --radius: 0.5rem; }
.dark { --background: 0 0% 4%; --primary: 0 0% 98%; }
body { background-color: hsl(var(--background)); }
.btn { background: hsl(var(--primary)); border-radius: var(--radius); }
.ring { box-shadow: 0 0 0 2px color-mix(in srgb, hsl(var(--ring)) 50%, transparent); }
`;

describe("parseRuleBlocks", () => {
  it("splits each selector block and its declarations", () => {
    const blocks = parseRuleBlocks(SHEET);
    expect(blocks.map((b) => b.selector)).toEqual([":root", ".dark", "body", ".btn", ".ring"]);
    expect(blocks[0]!.declarations).toContainEqual({ property: "--background", value: "0 0% 100%" });
    expect(blocks[3]!.declarations).toContainEqual({ property: "border-radius", value: "var(--radius)" });
  });
  it("strips comments before parsing", () => {
    const blocks = parseRuleBlocks(":root { /* note */ --x: 1; }");
    expect(blocks[0]!.declarations).toEqual([{ property: "--x", value: "1" }]);
  });
});

describe("collectCustomPropDecls", () => {
  it("collects each (name, selector, value) declaration", () => {
    const decls = collectCustomPropDecls(parseRuleBlocks(SHEET));
    expect(decls).toContainEqual({ name: "--background", selector: ":root", value: "0 0% 100%" });
    expect(decls).toContainEqual({ name: "--background", selector: ".dark", value: "0 0% 4%" });
    expect(decls).toContainEqual({ name: "--radius", selector: ":root", value: "0.5rem" });
    // consumption-only properties are NOT custom-prop decls
    expect(decls.find((d) => d.name === "background-color")).toBeUndefined();
  });
});

describe("collectVarUseSites", () => {
  it("collects wrapping use-sites per consumed var, scoped by selector/property", () => {
    const sites = collectVarUseSites(parseRuleBlocks(SHEET));
    expect(sites).toContainEqual({
      name: "--background",
      selector: "body",
      property: "background-color",
      useSite: "hsl(var(--background))",
    });
    expect(sites).toContainEqual({
      name: "--radius",
      selector: ".btn",
      property: "border-radius",
      useSite: "var(--radius)",
    });
  });
  it("captures the color-mix wrapping use-site as the whole value", () => {
    const sites = collectVarUseSites(parseRuleBlocks(SHEET));
    const ring = sites.find((s) => s.name === "--ring");
    expect(ring).toBeDefined();
    expect(ring!.useSite.startsWith("color-mix(")).toBe(true);
  });
  it("does NOT treat a custom-property declaration as a use-site", () => {
    const sites = collectVarUseSites(parseRuleBlocks(":root { --primary: 240 5.9% 10%; }"));
    expect(sites).toEqual([]);
  });
});
