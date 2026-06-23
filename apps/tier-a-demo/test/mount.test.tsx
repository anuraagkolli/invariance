import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("mount", () => {
  it("renders the app shell (incl. the dashboard) without throwing", () => {
    const html = renderToString(<App />);
    expect(html).toContain("New report"); // the dashboard CTA — proves the canvas mounts in the shell
    expect(html).toContain("toggle-dark"); // the light/dark control
  });
});
