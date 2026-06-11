import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";

export interface HookBudgets {
  cpuMs: number;
  memMb: number;
}

export type HookExecution =
  | { ok: true; result: unknown }
  | { ok: false; reason: string };

let quickjsPromise: Promise<QuickJSWASMModule> | null = null;

function quickjs(): Promise<QuickJSWASMModule> {
  if (!quickjsPromise) quickjsPromise = getQuickJS();
  return quickjsPromise;
}

/** Strips an optional leading `export default `, leaving the bare function expression. */
export function toFunctionExpression(source: string): string {
  return source.trim().replace(/^export\s+default\s+/, "");
}

/**
 * Runs one hook against one JSON payload in a fresh QuickJS-on-WASM sandbox.
 *
 * This is a security boundary: the sandbox has no host bindings at all (no
 * process, require, fetch, timers, or module loader — none are ever exposed),
 * a hard memory limit, and an interrupt handler that kills execution past the
 * CPU budget. One runtime per execution; everything is disposed in finally.
 * Values cross the boundary only as JSON text.
 */
export async function executeHook(
  source: string,
  payload: unknown,
  budgets: HookBudgets,
): Promise<HookExecution> {
  const QuickJS = await quickjs();
  const runtime = QuickJS.newRuntime();
  try {
    runtime.setMemoryLimit(budgets.memMb * 1024 * 1024);
    const deadline = Date.now() + budgets.cpuMs;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const context = runtime.newContext();
    try {
      const code =
        `const __p = ${JSON.stringify(payload ?? null)};\n` +
        `JSON.stringify((${toFunctionExpression(source)})(__p));`;
      const evaluated = context.evalCode(code);
      if (evaluated.error) {
        const detail = context.dump(evaluated.error);
        evaluated.error.dispose();
        const message =
          typeof detail === "object" && detail !== null && "message" in detail
            ? String((detail as { message: unknown }).message)
            : String(detail);
        return { ok: false, reason: `hook threw: ${message}` };
      }
      const json = context.dump(evaluated.value);
      evaluated.value.dispose();
      if (typeof json !== "string") {
        return { ok: false, reason: "hook did not return a JSON-serializable value" };
      }
      return { ok: true, result: JSON.parse(json) };
    } finally {
      context.dispose();
    }
  } catch (err) {
    return { ok: false, reason: `sandbox failure: ${(err as Error).message}` };
  } finally {
    runtime.dispose();
  }
}
