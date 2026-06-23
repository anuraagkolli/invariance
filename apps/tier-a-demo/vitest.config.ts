import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()], // JSX/TSX transform for the React tests
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node", // logic + Playwright-driven chromium; no jsdom needed
    testTimeout: 60_000, // the chromium test launches a real browser + a Vite dev server
    hookTimeout: 60_000,
    // Two chromium files each launch a browser + a Vite dev server. Running them concurrently
    // contends for resources and makes the transition-timed waits flaky — fatal for a recording
    // asset's CI. Serialize files: the node tests are fast, so the cost is small and the result
    // is deterministic.
    fileParallelism: false,
  },
});
