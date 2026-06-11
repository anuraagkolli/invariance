import { describe, expect, it } from "vitest";
import { executeHook, toFunctionExpression } from "../src/sandbox";

const BUDGETS = { cpuMs: 100, memMb: 32 };

describe("executeHook", () => {
  it("runs a transform and returns the parsed result", async () => {
    const result = await executeHook(
      "(payload) => ({ ...payload, count: payload.count + 1 })",
      { count: 1 },
      BUDGETS,
    );
    expect(result).toEqual({ ok: true, result: { count: 2 } });
  });

  it("accepts an `export default` prefix", async () => {
    expect(toFunctionExpression("export default (p) => p")).toBe("(p) => p");
    const result = await executeHook("export default (p) => p.items.length", { items: [1, 2] }, BUDGETS);
    expect(result).toEqual({ ok: true, result: 2 });
  });

  it("supports classic function expressions", async () => {
    const result = await executeHook("function (p) { return p * 2; }", 21, BUDGETS);
    expect(result).toEqual({ ok: true, result: 42 });
  });
});

describe("sandbox as a security boundary", () => {
  it("interrupts an infinite loop within the cpu budget", async () => {
    const started = Date.now();
    const result = await executeHook("(p) => { while (true) {} }", {}, { cpuMs: 50, memMb: 32 });
    expect(result.ok).toBe(false);
    // Generous bound: the point is it does not hang, not exact accounting.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("kills a memory bomb at the memory limit", async () => {
    const result = await executeHook(
      "(p) => { const a = []; while (true) { a.push(new Array(65536).fill(8)); } }",
      {},
      { cpuMs: 1000, memMb: 8 },
    );
    expect(result.ok).toBe(false);
  });

  it("exposes no host bindings inside the sandbox", async () => {
    const result = await executeHook(
      `(p) => ({
        process: typeof process,
        require: typeof require,
        fetch: typeof fetch,
        XMLHttpRequest: typeof XMLHttpRequest,
        setTimeout: typeof setTimeout,
        WebSocket: typeof WebSocket,
        Buffer: typeof Buffer,
      })`,
      {},
      BUDGETS,
    );
    expect(result).toEqual({
      ok: true,
      result: {
        process: "undefined",
        require: "undefined",
        fetch: "undefined",
        XMLHttpRequest: "undefined",
        setTimeout: "undefined",
        WebSocket: "undefined",
        Buffer: "undefined",
      },
    });
  });

  it("a throwing hook fails closed (no partial output)", async () => {
    const result = await executeHook("(p) => { throw new Error('boom'); }", {}, BUDGETS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("boom");
  });

  it("a hook returning undefined is a failure, not a payload wipe", async () => {
    const result = await executeHook("(p) => undefined", { keep: true }, BUDGETS);
    expect(result.ok).toBe(false);
  });

  it("a hook returning a non-JSON value (function) is rejected", async () => {
    const result = await executeHook("(p) => (() => 1)", {}, BUDGETS);
    expect(result.ok).toBe(false);
  });

  it("payload crosses the boundary as data, never as code", async () => {
    // A payload that would break naive string templating into an escape.
    const hostile = { s: '"; globalThis.escaped = true; "' };
    const result = await executeHook("(p) => p.s.length", hostile, BUDGETS);
    expect(result).toEqual({ ok: true, result: hostile.s.length });
    expect((globalThis as Record<string, unknown>).escaped).toBeUndefined();
  });

  it("mutations inside the sandbox cannot reach the host object", async () => {
    const payload = { value: 1 };
    await executeHook("(p) => { p.value = 999; return p; }", payload, BUDGETS);
    expect(payload.value).toBe(1);
  });

  it("each execution gets a fresh runtime (no state bleed between hooks)", async () => {
    await executeHook("(p) => { Object.leak = 42; return p; }", {}, BUDGETS);
    const result = await executeHook("(p) => typeof Object.leak", {}, BUDGETS);
    expect(result).toEqual({ ok: true, result: "undefined" });
  });

  it("syntactically invalid source fails open", async () => {
    const result = await executeHook("not even js ===", {}, BUDGETS);
    expect(result.ok).toBe(false);
  });
});
