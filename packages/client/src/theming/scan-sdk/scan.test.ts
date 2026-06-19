// packages/client/src/theming/scan-sdk/scan.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { scan } from "./scan.js";

function inject(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

afterEach(() => {
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

const SHEET = `
:root { --background: 0 0% 100%; --primary: 240 5.9% 10%; --radius: 0.5rem; }
.dark { --background: 0 0% 4%; --primary: 0 0% 98%; }
body { background-color: hsl(var(--background)); }
.btn { background: hsl(var(--primary)); border-radius: var(--radius); }
`;

describe("scan()", () => {
  it("produces a parseable ScanPayload with both-mode held declarations", () => {
    inject(SHEET);
    const payload = scan(document);
    expect(payload.scanVersion).toBe(1);
    const bg = payload.variables.find((v) => v.name === "--background");
    expect(bg).toBeDefined();
    const light = bg!.declarations.find((d) => d.mode === "light");
    const dark = bg!.declarations.find((d) => d.mode === "dark");
    expect(light!.rawValue).toBe("0 0% 100%");
    expect(light!.heldFormat).toBe("hsl-triple");
    expect(dark!.rawValue).toBe("0 0% 4%");
  });

  it("captures consumption wrapping per use-site", () => {
    inject(SHEET);
    const payload = scan(document);
    expect(payload.consumption["--background"]).toContainEqual({
      wrapping: "hsl",
      selector: "body",
      property: "background-color",
    });
    expect(payload.consumption["--radius"]).toContainEqual({
      wrapping: "raw",
      selector: ".btn",
      property: "border-radius",
    });
  });

  it("infers mode from the declaring selector, not by toggling the DOM", () => {
    inject(SHEET);
    const payload = scan(document);
    const prim = payload.variables.find((v) => v.name === "--primary")!;
    expect(prim.declarations.map((d) => d.mode).sort()).toEqual(["dark", "light"]);
  });

  it("records cross-origin sheets that throw on .cssRules into opaqueSheets", () => {
    inject(SHEET);
    // Simulate an opaque sheet: a styleSheet whose cssRules getter throws SecurityError.
    const fakeSheet = {
      href: "https://cdn.other-origin.com/app.css",
      get cssRules(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as CSSStyleSheet;
    const realList = Array.from(document.styleSheets);
    const patched = {
      length: realList.length + 1,
      item: (i: number) => (i < realList.length ? realList[i]! : fakeSheet),
      [Symbol.iterator]: function* () {
        yield* realList;
        yield fakeSheet;
      },
    } as unknown as StyleSheetList;
    const fakeDoc = Object.create(document, {
      styleSheets: { get: () => patched },
    }) as Document;
    const payload = scan(fakeDoc);
    expect(payload.opaqueSheets).toContain("https://cdn.other-origin.com/app.css");
  });
});
