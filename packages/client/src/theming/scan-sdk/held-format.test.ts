// packages/client/src/theming/scan-sdk/held-format.test.ts
import { describe, it, expect } from "vitest";
import { classifyHeldFormat, classifyWrapping, modeFromSelector } from "./held-format.js";

describe("classifyHeldFormat", () => {
  it("recognizes a bare HSL triple (shadcn held form)", () => {
    expect(classifyHeldFormat("0 0% 100%")).toBe("hsl-triple");
    expect(classifyHeldFormat("240 5.9% 10%")).toBe("hsl-triple");
  });
  it("recognizes a bare RGB triple", () => {
    expect(classifyHeldFormat("255 255 255")).toBe("rgb-triple");
    expect(classifyHeldFormat("17 24 39")).toBe("rgb-triple");
  });
  it("recognizes hex", () => {
    expect(classifyHeldFormat("#4F46E5")).toBe("hex");
    expect(classifyHeldFormat("#fff")).toBe("hex");
  });
  it("recognizes oklch", () => {
    expect(classifyHeldFormat("oklch(0.7 0.15 250)")).toBe("oklch");
  });
  it("recognizes a bare number (radius/density)", () => {
    expect(classifyHeldFormat("0.5rem")).toBe("number");
    expect(classifyHeldFormat("8px")).toBe("number");
    expect(classifyHeldFormat("0")).toBe("number");
  });
  it("recognizes a keyword", () => {
    expect(classifyHeldFormat("transparent")).toBe("keyword");
    expect(classifyHeldFormat("white")).toBe("keyword");
  });
  it("falls back to unknown on a font stack / anything else", () => {
    expect(classifyHeldFormat("'Inter', system-ui, sans-serif")).toBe("unknown");
  });
});

describe("classifyWrapping", () => {
  it("hsl(var(--x)) -> hsl", () => {
    expect(classifyWrapping("hsl(var(--primary))")).toBe("hsl");
  });
  it("rgb(var(--x)) -> rgb", () => {
    expect(classifyWrapping("rgb(var(--primary))")).toBe("rgb");
  });
  it("oklch(var(--x)) -> oklch", () => {
    expect(classifyWrapping("oklch(var(--primary))")).toBe("oklch");
  });
  it("bare var(--x) -> raw", () => {
    expect(classifyWrapping("var(--radius)")).toBe("raw");
  });
  it("color-mix(...) -> color-mix", () => {
    expect(classifyWrapping("color-mix(in srgb, var(--ring) 50%, white)")).toBe("color-mix");
  });
  it("anything else with a var -> other", () => {
    expect(classifyWrapping("hsla(var(--x) / 0.5)")).toBe("other");
  });
});

describe("modeFromSelector", () => {
  it(":root and html are light", () => {
    expect(modeFromSelector(":root")).toBe("light");
    expect(modeFromSelector("html")).toBe("light");
  });
  it(".dark and [data-theme='dark'] and media-dark are dark", () => {
    expect(modeFromSelector(".dark")).toBe("dark");
    expect(modeFromSelector("[data-theme='dark']")).toBe("dark");
    expect(modeFromSelector(":root.dark")).toBe("dark");
  });
  it("an unrecognized scope is unknown", () => {
    expect(modeFromSelector(".sidebar")).toBe("unknown");
  });
});
