import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { AnalyticsDashboard } from "../src/canvas/AnalyticsDashboard.js";

describe("mount", () => {
  it("renders the app shell (incl. the dashboard) without throwing", () => {
    const html = renderToString(<App />);
    expect(html).toContain("New report"); // the dashboard CTA — proves the canvas mounts in the shell
    expect(html).toContain("toggle-dark"); // the light/dark control
  });

  it("dense profile: mounts, data-profile=dense, has topnav, no sidebar", () => {
    const html = renderToString(<AnalyticsDashboard profile="dense" />);
    expect(html).toContain('data-profile="dense"');
    expect(html).toContain('data-testid="topnav"');
    expect(html).not.toContain('data-testid="sidebar"');
  });

  it("standard profile: mounts, data-profile=standard, has sidebar, no topnav", () => {
    const html = renderToString(<AnalyticsDashboard profile="standard" />);
    expect(html).toContain('data-profile="standard"');
    expect(html).toContain('data-testid="sidebar"');
    expect(html).not.toContain('data-testid="topnav"');
  });

  it("roomy profile: mounts, data-profile=roomy, has sidebar, no topnav", () => {
    const html = renderToString(<AnalyticsDashboard profile="roomy" />);
    expect(html).toContain('data-profile="roomy"');
    expect(html).toContain('data-testid="sidebar"');
    expect(html).not.toContain('data-testid="topnav"');
  });

  it("ctaTestId prop round-trips in both dense and standard", () => {
    const dense = renderToString(<AnalyticsDashboard profile="dense" ctaTestId="cta-test" />);
    expect(dense).toContain('data-testid="cta-test"');
    const standard = renderToString(<AnalyticsDashboard profile="standard" ctaTestId="cta-test" />);
    expect(standard).toContain('data-testid="cta-test"');
  });
});
