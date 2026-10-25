import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../src/core/sanitize";

describe("sanitizeHtml", () => {
  it("keeps allowed markup", () => {
    expect(sanitizeHtml('<span class="badge">★ <b>Mine</b></span>')).toBe(
      '<span class="badge">★ <b>Mine</b></span>',
    );
  });

  it("removes script and iframe elements", () => {
    expect(sanitizeHtml('<span>ok</span><script>alert(1)</script>')).toBe("<span>ok</span>");
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe("");
  });

  it("strips event handler attributes", () => {
    expect(sanitizeHtml('<span onclick="alert(1)">x</span>')).toBe("<span>x</span>");
  });

  it("strips javascript: urls but keeps safe ones", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="https://ok.example">x</a>')).toBe(
      '<a href="https://ok.example">x</a>',
    );
  });

  it("strips style attributes containing url() or expression()", () => {
    expect(sanitizeHtml('<span style="background:url(https://evil.example)">x</span>')).toBe(
      "<span>x</span>",
    );
    expect(sanitizeHtml('<span style="color: red">x</span>')).toBe(
      '<span style="color: red">x</span>',
    );
  });

  it("removes nested disallowed elements", () => {
    expect(sanitizeHtml("<div><object data='x'></object><p>keep</p></div>")).toBe(
      "<div><p>keep</p></div>",
    );
  });
});
