import type { CandidateTheme } from "@invariance/theming/compile";

// The demo's stand-in for the production :root/.dark applier. Same VALUES, scoped to a wrapper element
// instead of :root. Sets every emitted var as an inline custom property on `wrapper`, AND toggles
// class="dark" — a scoped wrapper does NOT inherit a :root-level .dark toggle, so the class travels
// with the var map (belt-and-suspenders; the canvas is pure-var so the vars alone drive the look).
export function applyScoped(wrapper: HTMLElement, theme: CandidateTheme, mode: "light" | "dark"): void {
  const vars = mode === "dark" ? (theme.dark ?? theme.light) : theme.light;
  for (const [name, value] of Object.entries(vars)) wrapper.style.setProperty(name, value);
  wrapper.classList.toggle("dark", mode === "dark");
}
