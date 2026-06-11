import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.DEMO_WEB_PORT ?? 4501),
    proxy: {
      "/api": process.env.DEMO_API_URL ?? "http://localhost:4500",
    },
  },
});
