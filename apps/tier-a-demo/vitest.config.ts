import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()], // JSX/TSX transform for the React tests
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node", // logic + (Task 4) Playwright-driven chromium; no jsdom needed
  },
});
