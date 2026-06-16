import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store";

describe("subject = tenant isolation", () => {
  it("keeps two tenants' theme timelines independent", async () => {
    const store = new MemoryStore();
    await store.appendThemeVersion("acme-saas", "tenant-a", { mode: "dark" });
    await store.appendThemeVersion("acme-saas", "tenant-b", { mode: "light" });

    expect(await store.getLatestTheme("acme-saas", "tenant-a")).toEqual({ mode: "dark" });
    expect(await store.getLatestTheme("acme-saas", "tenant-b")).toEqual({ mode: "light" });
    expect((await store.listThemeVersions("acme-saas", "tenant-a")).length).toBe(1);
    expect((await store.listThemeVersions("acme-saas", "tenant-b")).length).toBe(1);
  });
});
