// packages/client/src/theming/applier.ts
// Data-plane applier: the SAME pure core + client sink as the control plane,
// re-surfaced under @invariance/client so the SDK does not import control-plane code.
// "One pure core, two sinks" (§7.2) — no logic lives here.
export { renderStyleText, applyTheme } from "@invariance/theming";
