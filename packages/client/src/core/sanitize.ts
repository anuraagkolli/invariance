const ALLOWED_TAGS = new Set([
  "a", "b", "br", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i",
  "img", "li", "ol", "p", "section", "small", "span", "strong", "ul",
]);

const ALLOWED_ATTRS = new Set(["alt", "class", "href", "src", "style", "title"]);

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    (!trimmed.includes(":") && !trimmed.startsWith("//"))
  );
}

function sanitizeElement(el: Element): void {
  if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
    el.remove();
    return;
  }
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if ((name === "href" || name === "src") && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name);
    }
    if (name === "style" && /url\s*\(|expression\s*\(|javascript:/i.test(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }
  for (const child of [...el.children]) sanitizeElement(child);
}

/**
 * Allowlist sanitizer for slot-override content. Defense in depth: the
 * control plane statically rejects dangerous content at verification time,
 * and the client sanitizes again at render time.
 */
export function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const child of [...template.content.children]) sanitizeElement(child);
  // Template content can also hold stray scripts as non-element nodes in
  // some parsers; serialize only the sanitized element tree.
  return [...template.content.children].map((c) => c.outerHTML).join("");
}
