#!/usr/bin/env node
// Workspace packages ship TS source directly (no build step), so the bin
// shim registers tsx's ESM loader before importing the real entry point.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { register } = await import("tsx/esm/api");
register();
await import(join(dirname(fileURLToPath(import.meta.url)), "../src/main.ts"));
