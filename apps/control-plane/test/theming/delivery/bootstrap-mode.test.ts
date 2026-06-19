// apps/control-plane/test/theming/bootstrap-mode.test.ts
import { describe, it, expect, vi } from "vitest";
import { bootstrapMode, MODE_COOKIE } from "../../../src/theming/delivery/bootstrap-mode.js";

type BootstrapDoc = Parameters<typeof bootstrapMode>[0]["doc"];

// Minimal fake document: a settable cookie string + a matchMedia hook on its defaultView.
function fakeDoc(opts: { prefersDark: boolean; existingCookie?: string }): BootstrapDoc {
  let cookie = opts.existingCookie ?? "";
  const matchMedia = (q: string) => ({ matches: q.includes("dark") ? opts.prefersDark : !opts.prefersDark });
  const doc = {
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      cookie = v;
    },
    defaultView: { matchMedia },
  } as unknown as BootstrapDoc;
  return doc;
}

describe("bootstrapMode", () => {
  it("persists dark when the OS prefers dark but the server defaulted to light", () => {
    const doc = fakeDoc({ prefersDark: true });
    bootstrapMode({ doc, defaultMode: "light" });
    expect(doc.cookie).toContain(`${MODE_COOKIE}=dark`);
  });

  it("persists light when the OS prefers light but the server defaulted to dark", () => {
    const doc = fakeDoc({ prefersDark: false });
    bootstrapMode({ doc, defaultMode: "dark" });
    expect(doc.cookie).toContain(`${MODE_COOKIE}=light`);
  });

  it("is a no-op when the resolved mode already matches the server default", () => {
    const doc = fakeDoc({ prefersDark: true });
    const spy = vi.spyOn(doc, "cookie", "set");
    bootstrapMode({ doc, defaultMode: "dark" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("is a no-op when matchMedia is unavailable (cannot resolve system → concrete)", () => {
    const doc = { defaultView: {} } as unknown as BootstrapDoc;
    // must not throw
    expect(() => bootstrapMode({ doc, defaultMode: "light" })).not.toThrow();
  });
});
