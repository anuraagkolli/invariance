// packages/theming/test/artifact/barrel.test.ts
import { describe, it, expect } from "vitest";
import * as artifactBarrel from "../../src/artifact/index.js";

describe("artifact barrel", () => {
  it("re-exports the public surface", () => {
    expect(typeof artifactBarrel.hashArtifact).toBe("function");
    expect(typeof artifactBarrel.buildArtifact).toBe("function");
    expect(typeof artifactBarrel.renderStyleText).toBe("function");
    expect(typeof artifactBarrel.styleTag).toBe("function");
    expect(typeof artifactBarrel.applyTheme).toBe("function");
    expect(artifactBarrel.ThemeArtifact).toBeDefined(); // zod schema value
    expect(artifactBarrel.Pointer).toBeDefined();
    expect(artifactBarrel.ARTIFACT_SCHEMA_VERSION).toBe(1);
  });
});
