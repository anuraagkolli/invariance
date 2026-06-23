import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("mount", () => {
  it("renders the app shell without throwing", () => {
    expect(renderToString(<App />)).toContain("tier-a-demo");
  });
});
