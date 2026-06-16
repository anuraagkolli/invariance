import { describe, it, expect } from "vitest";
import { discoverVars } from "../src/discover/vars";

const CSS = `
/* comment with --commented-out: #000; should NOT be discovered */
:root {
  --background: #FFFFFF;
  --primary: #4F46E5;
  --radius: 0.5rem;
}
.dark {
  --background: #0A0A0A;
}
`;

describe("discoverVars", () => {
  it("extracts every declaration with its scope, preserving order", () => {
    const vars = discoverVars(CSS);
    expect(vars).toEqual([
      { name: "--background", value: "#FFFFFF", scope: ":root" },
      { name: "--primary", value: "#4F46E5", scope: ":root" },
      { name: "--radius", value: "0.5rem", scope: ":root" },
      { name: "--background", value: "#0A0A0A", scope: ".dark" },
    ]);
  });

  it("ignores declarations inside comments", () => {
    expect(discoverVars(CSS).some((v) => v.name === "--commented-out")).toBe(false);
  });

  it("returns [] for CSS with no custom properties", () => {
    expect(discoverVars(".btn { color: red; }")).toEqual([]);
  });

  it("discovers custom properties whose names contain underscores", () => {
    expect(discoverVars(":root { --foo_bar: #fff; }")).toEqual([
      { name: "--foo_bar", value: "#fff", scope: ":root" },
    ]);
  });
});
