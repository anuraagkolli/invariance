// packages/theming/test/artifact/pointer.test.ts
import { describe, it, expect } from "vitest";
import { Pointer } from "../../src/artifact/pointer.js";

describe("Pointer schema", () => {
  it("accepts a live pointer", () => {
    const r = Pointer.safeParse({ hash: "deadbeef", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(true);
  });

  it("accepts a disabled (kill-switched) pointer", () => {
    const r = Pointer.safeParse({ hash: "deadbeef", status: "disabled", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = Pointer.safeParse({ hash: "x", status: "paused", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing hash", () => {
    const r = Pointer.safeParse({ status: "live", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(false);
  });

  it("models a present pointer only — a miss is the absence of a value, not status:'disabled'", () => {
    // A disabled pointer is a real value; a miss (null) never parses to this shape.
    expect(Pointer.safeParse(null).success).toBe(false);
    expect(Pointer.parse({ hash: "h", status: "disabled", updatedAt: "t" }).status).toBe("disabled");
  });
});
