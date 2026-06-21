import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Repo root — so test files may import control-plane / client source by relative path
// (those stages are not re-exported from the control-plane public barrel) without tripping
// vite's filesystem allow-list.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
    // Playwright (Group E) launches a real browser; give it room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
