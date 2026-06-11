import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CONSOLE_PORT ?? 4600),
    proxy: {
      "/v1": process.env.INVARIANCE_REGISTRY ?? "http://localhost:4400",
    },
  },
});
