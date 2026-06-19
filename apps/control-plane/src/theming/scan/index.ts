// apps/control-plane/src/theming/scan/index.ts
// Task 8 extends this barrel with the `getCanManifest` re-export. Kept self-consistent
// here so Task 7 typechecks and tests green standalone (no forward reference to a
// not-yet-created module).
export { runScanner } from "./scanner.js";
export type {
  ScannerOptions,
  ScanResult,
  CoverageReport,
  CoverageReason,
} from "./scanner.js";
