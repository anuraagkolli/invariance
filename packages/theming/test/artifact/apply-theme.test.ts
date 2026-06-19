// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme } from "../../src/artifact/apply-theme.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

const injected = (doc: Document) =>
  Array.from(doc.head.querySelectorAll("style")).filter((s) => s.textContent?.includes("--background"));

beforeEach(() => {
  document.head.innerHTML = "";
});

describe("applyTheme (client sink)", () => {
  it("injects a <style> at the END of <head>", () => {
    const marker = document.createElement("meta");
    document.head.appendChild(marker);
    applyTheme(artifact, "light", { doc: document });
    const last = document.head.lastElementChild!;
    expect(last.tagName).toBe("STYLE");
    expect(last.textContent).toContain("--background: oklch(1 0 0);");
  });

  it("discovers and reuses a pre-existing nonce (CSP enforced path)", () => {
    const s = document.createElement("script");
    s.setAttribute("nonce", "server-nonce");
    document.head.appendChild(s);
    applyTheme(artifact, "light", { doc: document });
    const styled = injected(document)[0];
    expect(styled.nonce).toBe("server-nonce");
  });

  it("injects WITHOUT a nonce when no nonced element exists (CSP not enforced)", () => {
    applyTheme(artifact, "light", { doc: document });
    const styled = injected(document)[0];
    expect(styled).toBeTruthy();
    expect(styled.getAttribute("nonce")).toBeNull();
  });

  it("injects NOTHING when a nonced element exists but its nonce is empty (CSP enforced, no usable nonce → fail open)", () => {
    const s = document.createElement("script");
    s.setAttribute("nonce", "");
    document.head.appendChild(s);
    applyTheme(artifact, "light", { doc: document });
    expect(injected(document).length).toBe(0);
  });

  it("injects NOTHING when an emitted value is unsafe (fail open)", () => {
    const unsafe: ThemeArtifact = {
      ...artifact,
      modes: { light: { selector: ":root", vars: { "--background": "red; } body { display:none" } } },
    };
    applyTheme(unsafe, "light", { doc: document });
    expect(document.head.querySelectorAll("style").length).toBe(0);
  });

  it("injects NOTHING when the requested mode has no block", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    applyTheme(lightOnly, "dark", { doc: document });
    expect(document.head.querySelectorAll("style").length).toBe(0);
  });

  it("emits the dark selector when applying dark", () => {
    applyTheme(artifact, "dark", { doc: document });
    expect(injected(document)[0].textContent).toContain(".dark {");
  });
});
