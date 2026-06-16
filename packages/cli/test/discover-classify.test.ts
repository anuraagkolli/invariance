import { describe, it, expect } from "vitest";
import { classifyVars, normalizeHex } from "../src/discover/classify";
import type { DiscoveredVar } from "../src/discover/vars";

const VARS: DiscoveredVar[] = [
  { name: "--background", value: "#FFFFFF", scope: ":root" },
  { name: "--foreground", value: "#0A0A0A", scope: ":root" },
  { name: "--primary", value: "#4F46E5", scope: ":root" },
  { name: "--primary-foreground", value: "#FFFFFF", scope: ":root" },
  { name: "--border", value: "#E5E5E5", scope: ":root" },
  { name: "--radius", value: "0.5rem", scope: ":root" },
  { name: "--ring", value: "oklch(0.55 0.12 250)", scope: ":root" }, // unparsed color format
  { name: "--background", value: "#0A0A0A", scope: ".dark" }, // mode variant — ignored
];

describe("classifyVars", () => {
  it("maps each hex-color var to the role its value lands in", () => {
    const r = classifyVars(VARS);
    expect(r.variableRoleMap["--background"]).toEqual({ role: "surface-0", scope: ":root", locked: false });
    expect(r.variableRoleMap["--foreground"]).toEqual({ role: "text-primary", scope: ":root", locked: false });
    expect(r.variableRoleMap["--primary"]).toEqual({ role: "accent", scope: ":root", locked: false });
    expect(r.variableRoleMap["--border"]).toEqual({ role: "border", scope: ":root", locked: false });
  });

  it("reports a hex color that won no role as unclassified", () => {
    // #FFFFFF as text on a #FFFFFF surface fails the readability floor -> no role.
    expect(classifyVars(VARS).unclassified).toContain("--primary-foreground");
  });

  it("reports non-color values (lengths) as nonColor, not unclassified", () => {
    const r = classifyVars(VARS);
    expect(r.nonColor).toContain("--radius");
    expect(r.unclassified).not.toContain("--radius");
  });

  it("reports an unparsed color format (oklch) as unclassified, not nonColor", () => {
    // Real shadcn/Tailwind-v4 ships oklch(); it's a drivable color we can't parse
    // yet, so it belongs in the coverage denominator (unclassified), not excluded.
    const r = classifyVars(VARS);
    expect(r.unclassified).toContain("--ring");
    expect(r.nonColor).not.toContain("--ring");
  });

  it("classifies from the :root value, not the .dark variant", () => {
    // --background is mapped once (surface-0), keyed by name, scope ":root".
    expect(classifyVars(VARS).variableRoleMap["--background"]!.scope).toBe(":root");
  });

  it("normalizeHex canonicalizes 3-digit and lowercase to uppercase #RRGGBB", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("#4f46e5")).toBe("#4F46E5");
    expect(normalizeHex("0.5rem")).toBeUndefined();
  });
});
