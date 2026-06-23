import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()], // JSX/TSX transform for the React tests
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node", // logic + Playwright-driven chromium; no jsdom needed
    testTimeout: 60_000, // the chromium test launches a real browser + a Vite dev server
    hookTimeout: 60_000,
  },
});
