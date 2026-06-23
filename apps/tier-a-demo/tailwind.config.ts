import type { Config } from "tailwindcss";

// Tailwind is used for LAYOUT/spacing/typography only. Colours are themed exclusively through
// hsl(var(--x)) (see the canvas + the no-dark: guard) — there are deliberately no `dark:` utilities.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
