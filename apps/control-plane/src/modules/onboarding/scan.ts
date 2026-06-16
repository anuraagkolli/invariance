import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { Project, Node, SyntaxKind } from "ts-morph";
import type { JsxElement, JsxSelfClosingElement } from "ts-morph";
import type { ColorObservation } from "@invariance/design/server";

/**
 * The deterministic half of onboarding (Stages 1–2 of ONBOARDING-PIPELINE.md):
 * walk the router tree into archetypes, segment each page's top-level sections,
 * and observe the app's colors/fonts. No LLM here — naming/levels are proposed
 * heuristically in name.ts and are fully developer-editable.
 */

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "coverage", ".vercel", ".cache",
]);

/** A permissive ts-morph project over the app's source (JSX preserved). */
export function loadProject(root: string): Project {
  let project: Project;
  try {
    project = new Project({
      tsConfigFilePath: join(root, "tsconfig.json"),
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true, noEmit: true },
    });
  } catch {
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noEmit: true, jsx: 1 },
    });
  }
  project.addSourceFilesAtPaths([
    join(root, "src/**/*.{ts,tsx,js,jsx}"),
    join(root, "app/**/*.{ts,tsx,js,jsx}"),
    join(root, "pages/**/*.{ts,tsx,js,jsx}"),
    join(root, "components/**/*.{ts,tsx,js,jsx}"),
  ]);
  return project;
}

export interface DiscoveredArchetype {
  key: string; // route pattern, e.g. "/title/[id]"
  route: string; // representative concrete-ish route for preview
  pageFile: string; // repo-relative
}

export interface DiscoveredEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  file: string;
}

export interface RawSection {
  tagName: string;
  jsxPath: string;
  domIndex: number;
  line: number;
  snippet: string;
  colors: string[];
}

function* walk(dir: string, root: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(abs, root);
    } else if (entry.isFile()) {
      yield relative(root, abs);
    }
  }
}

const isPageFile = (f: string) =>
  /(^|\/)(src\/)?app\/.*page\.(tsx|jsx)$/.test(f.replace(/\\/g, "/"));
const isRouteFile = (f: string) =>
  /(^|\/)(src\/)?app\/.*route\.(ts|js)$/.test(f.replace(/\\/g, "/"));

/** `src/app/title/[id]/page.tsx` -> { key: "/title/[id]", route: "/title/[id]" } */
function pageRoute(file: string): { key: string; route: string } {
  const segs = file
    .replace(/\\/g, "/")
    .replace(/^(src\/)?app\//, "")
    .replace(/\/?page\.(tsx|jsx)$/, "")
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s)); // drop route groups (marketing)
  const key = "/" + segs.join("/");
  return { key: key === "/" ? "/" : key, route: key === "/" ? "/" : key };
}

/** `src/app/api/shows/route.ts` -> "/api/shows" */
function apiRoutePath(file: string): string {
  const segs = file
    .replace(/\\/g, "/")
    .replace(/^(src\/)?app\//, "")
    .replace(/\/route\.(ts|js)$/, "")
    .split("/")
    .filter(Boolean);
  return "/" + segs.join("/");
}

export function discoverArchetypes(root: string): DiscoveredArchetype[] {
  const out: DiscoveredArchetype[] = [];
  for (const file of walk(root, root)) {
    if (!isPageFile(file)) continue;
    const { key, route } = pageRoute(file);
    out.push({ key, route, pageFile: file });
  }
  // Stable order: root first, then alphabetical.
  out.sort((a, b) => (a.key === "/" ? -1 : b.key === "/" ? 1 : a.key.localeCompare(b.key)));
  return out;
}

const METHOD_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

export function discoverEndpoints(root: string): DiscoveredEndpoint[] {
  const out: DiscoveredEndpoint[] = [];
  const seen = new Set<string>();
  for (const file of walk(root, root)) {
    if (!isRouteFile(file)) continue;
    const text = readFileSync(join(root, file), "utf8");
    const path = apiRoutePath(file);
    for (const m of text.matchAll(METHOD_RE)) {
      const method = m[1] as DiscoveredEndpoint["method"];
      const k = `${method} ${path}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ method, path, file });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return out;
}

// --- JSX helpers -----------------------------------------------------------

type JsxEl = JsxElement | JsxSelfClosingElement;

function tagOf(node: JsxEl): string {
  return Node.isJsxElement(node)
    ? node.getOpeningElement().getTagNameNode().getText()
    : node.getTagNameNode().getText();
}

function elementChildren(node: JsxElement): JsxEl[] {
  return node
    .getJsxChildren()
    .filter((c): c is JsxEl => Node.isJsxElement(c) || Node.isJsxSelfClosingElement(c));
}

/** Compact dotted path from the enclosing component down to `node`. */
function jsxPathOf(node: JsxEl): string {
  const chain: JsxEl[] = [];
  let cur: Node | undefined = node;
  while (cur) {
    if (Node.isJsxElement(cur) || Node.isJsxSelfClosingElement(cur)) chain.push(cur);
    const parent = cur.getParent();
    if (!parent || Node.isFunctionDeclaration(parent) || Node.isArrowFunction(parent)) break;
    cur = parent;
  }
  chain.reverse();
  return chain
    .map((el) => {
      const tag = tagOf(el);
      const parent = el.getParentIfKind(SyntaxKind.JsxElement);
      if (!parent) return tag;
      const sibs = elementChildren(parent).filter((s) => tagOf(s) === tag);
      if (sibs.length <= 1) return tag;
      return `${tag}[${sibs.indexOf(el)}]`;
    })
    .join(">");
}

const COLOR_PROPS = new Set([
  "color", "backgroundColor", "background", "borderColor", "borderTopColor",
  "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor",
  "fill", "stroke",
]);
const COLOR_VALUE = /^#[0-9a-fA-F]{3,8}$|^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/i;
const ARBITRARY_CLASS = /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[([^\]]+)\]/g;
const FONT_ARBITRARY = /\bfont-\[([^\]]+)\]/g;

function kindFor(prop: string): ColorObservation["kind"] {
  if (prop === "color" || prop === "fill" || prop === "stroke") return "text";
  if (/border|outline/i.test(prop)) return "border";
  return "bg";
}

/** Observe inline-style and arbitrary-tailwind colors within a JSX subtree. */
function observeColorsIn(node: JsxEl): ColorObservation[] {
  const out: ColorObservation[] = [];
  const attrs = node.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of attrs) {
    const name = attr.getNameNode().getText();
    if (name === "style") {
      const init = attr.getInitializer();
      const obj = init?.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) continue;
      for (const prop of obj.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;
        const key = prop.getName().replace(/['"]/g, "");
        if (!COLOR_PROPS.has(key)) continue;
        const lit = prop.getInitializerIfKind(SyntaxKind.StringLiteral);
        const v = lit?.getLiteralText().trim();
        if (v && COLOR_VALUE.test(v)) out.push({ hex: v, kind: kindFor(key) });
      }
    } else if (name === "className" || name === "class") {
      const text = attr.getInitializer()?.getText() ?? "";
      for (const m of text.matchAll(ARBITRARY_CLASS)) {
        const raw = m[1]!.replace(/_/g, " ").trim();
        if (COLOR_VALUE.test(raw)) {
          const prefix = m[0]!.split("-[")[0]!;
          const kind: ColorObservation["kind"] =
            prefix === "text" || prefix === "fill" || prefix === "stroke"
              ? "text"
              : prefix === "border" || prefix === "ring"
                ? "border"
                : "bg";
          out.push({ hex: raw, kind });
        }
      }
    }
  }
  return out;
}

function observeFontsIn(sf: { getFullText(): string }): string[] {
  const text = sf.getFullText();
  const fonts = new Set<string>();
  for (const m of text.matchAll(FONT_ARBITRARY)) {
    fonts.add(m[1]!.replace(/_/g, " ").trim());
  }
  for (const m of text.matchAll(/fontFamily:\s*["'`]([^"'`]+)["'`]/g)) {
    fonts.add(m[1]!.trim());
  }
  return [...fonts].filter(Boolean);
}

const isCustomComponent = (tag: string) => /^[A-Z]/.test(tag.split(".")[0]!);
// Components that wrap/overlay rather than lay out the page — never descend into
// or segment on these.
const OVERLAY =
  /tour|modal|toast|provider|dialog|overlay|portal|analytics|script|boundary|suspense|fragment/i;
const GENERIC_WRAPPER = /^(div|section|main|article|span)$/i;

type SourceFile = import("ts-morph").SourceFile;
type Container = JsxElement | import("ts-morph").JsxFragment;

const isContainer = (n: Node): n is Container =>
  Node.isJsxElement(n) || Node.isJsxFragment(n);

function childrenOf(node: Container): JsxEl[] {
  return node
    .getJsxChildren()
    .filter((c): c is JsxEl => Node.isJsxElement(c) || Node.isJsxSelfClosingElement(c));
}

/**
 * The named (or default-exported) component's returned JSX root, scoped to that
 * function so a helper component in the same file can't win. Returns the
 * outermost JSX node (element / fragment / self-closing delegate).
 */
function componentRootJsx(sf: SourceFile, name?: string): Node | undefined {
  const fns: Node[] = [];
  if (name) {
    const fd = sf.getFunction(name);
    if (fd) fns.push(fd);
    const init = sf.getVariableDeclaration(name)?.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) fns.push(init);
  }
  if (fns.length === 0) {
    const def = sf.getFunctions().find((f) => f.isDefaultExport());
    if (def) {
      fns.push(def);
    } else {
      for (const fn of sf.getFunctions()) fns.push(fn);
      for (const vd of sf.getVariableDeclarations()) {
        const init = vd.getInitializer();
        if (init && Node.isArrowFunction(init)) fns.push(init);
      }
    }
  }
  let best: Node | undefined;
  let bestSize = -1;
  for (const fn of fns) {
    const roots = [
      ...fn.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...fn.getDescendantsOfKind(SyntaxKind.JsxFragment),
      ...fn.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].filter(
      (e) =>
        !e.getFirstAncestorByKind(SyntaxKind.JsxElement) &&
        !e.getFirstAncestorByKind(SyntaxKind.JsxFragment),
    );
    for (const r of roots) {
      const size = r.getDescendantsOfKind(SyntaxKind.JsxElement).length;
      if (size > bestSize) {
        bestSize = size;
        best = r;
      }
    }
  }
  return best;
}

/** Resolve a custom-component tag to the source file that defines it. */
function resolveComponentFile(sf: SourceFile, tag: string): SourceFile | undefined {
  const base = tag.split(".")[0]!; // <Foo.Bar> -> Foo
  for (const imp of sf.getImportDeclarations()) {
    const named = imp
      .getNamedImports()
      .some((n) => (n.getAliasNode()?.getText() ?? n.getName()) === base);
    const def = imp.getDefaultImport()?.getText() === base;
    if (named || def) {
      const target = imp.getModuleSpecifierSourceFile();
      if (target) return target;
    }
  }
  return undefined;
}

/**
 * Find a page's real content container, following delegating components into
 * their definition files (page.tsx → <HomeScreen/> → <Shell>{…}</Shell>).
 * Prefers a `<main>`; unwraps single generic wrappers; treats a node that
 * delegates wholly to one content component as a pass-through.
 */
function resolveContainer(
  project: Project,
  sf: SourceFile,
  name: string | undefined,
  depth = 0,
): Container | undefined {
  const rootNode = componentRootJsx(sf, name);
  if (!rootNode) return undefined;

  // A bare delegate like `return <SeriesScreen/>`.
  if (Node.isJsxSelfClosingElement(rootNode)) {
    return followCustom(project, sf, tagOf(rootNode), depth);
  }
  if (!isContainer(rootNode)) return undefined;
  let root: Container = rootNode;

  // Prefer a <main> declared within this component's own JSX.
  const main = root
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .find((m) => tagOf(m).toLowerCase() === "main" && childrenOf(m).length >= 1);
  if (main) return main;

  for (let i = 0; i < 8; i++) {
    const kids = childrenOf(root).filter(
      (k) => !(isCustomComponent(tagOf(k)) && OVERLAY.test(tagOf(k))),
    );
    // Whole-page delegation: every child is a custom component — follow the
    // first that resolves to a layout (e.g. page → <HomeScreen/>).
    if (kids.length >= 1 && kids.every((k) => isCustomComponent(tagOf(k)))) {
      if (depth < 6) {
        for (const k of kids) {
          const inner = followCustom(project, sf, tagOf(k), depth);
          if (inner) return inner;
        }
      }
      return root;
    }
    if (kids.length >= 2) return root;
    if (kids.length === 1) {
      const only = kids[0]!;
      if (isContainer(only) && GENERIC_WRAPPER.test(tagOf(only))) {
        root = only; // unwrap a single generic wrapper and look again
        continue;
      }
      return root;
    }
    return root;
  }
  return root;
}

function followCustom(
  project: Project,
  sf: SourceFile,
  tag: string,
  depth: number,
): Container | undefined {
  if (depth >= 6) return undefined;
  const target = resolveComponentFile(sf, tag);
  if (!target || target.getFilePath() === sf.getFilePath()) return undefined;
  return resolveContainer(project, target, tag.split(".")[0], depth + 1);
}

/**
 * Segment a page into top-level sections — the element children of its primary
 * content container, resolved across the delegating component chain.
 */
export function extractSections(
  project: Project,
  root: string,
  pageFile: string,
): { sections: RawSection[]; fonts: string[] } {
  const sf = project.getSourceFile(join(root, pageFile));
  if (!sf) return { sections: [], fonts: [] };

  const container = resolveContainer(project, sf, undefined);
  const sections: RawSection[] = [];
  if (container) {
    childrenOf(container).forEach((el, i) => {
      const colors = [...new Set(observeColorsIn(el).map((c) => c.hex))];
      const opening = Node.isJsxElement(el) ? el.getOpeningElement().getText() : el.getText();
      sections.push({
        tagName: tagOf(el),
        jsxPath: jsxPathOf(el),
        domIndex: i,
        line: el.getStartLineNumber(),
        snippet: opening.replace(/\s+/g, " ").slice(0, 120),
        colors,
      });
    });
  }

  const fonts = observeFontsIn(sf);
  const containerSf = container?.getSourceFile();
  if (containerSf && containerSf.getFilePath() !== sf.getFilePath()) {
    observeFontsIn(containerSf).forEach((f) => fonts.push(f));
  }
  return { sections, fonts };
}

const CSS_VAR_RE = /(--[a-zA-Z][\w-]*)\s*:\s*([^;}{]+)[;}]/g;
const STYLE_EXTS = new Set([".css", ".scss", ".less"]);

function kindFromTokenName(name: string): ColorObservation["kind"] {
  const n = name.toLowerCase();
  if (/border|ring|divide|outline|stroke/.test(n)) return "border";
  if (/text|fg|foreground|ink|copy|label/.test(n)) return "text";
  return "bg";
}

/** Observe colors from CSS custom properties across the repo's stylesheets. */
export function observeCssColors(root: string): ColorObservation[] {
  const out: ColorObservation[] = [];
  const seen = new Set<string>();
  for (const file of walk(root, root)) {
    if (!STYLE_EXTS.has(extname(file))) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const m of text.matchAll(CSS_VAR_RE)) {
      const name = m[1]!;
      const value = m[2]!.trim();
      if (value.startsWith("var(")) continue;
      if (!COLOR_VALUE.test(value)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ hex: value, kind: kindFromTokenName(name) });
    }
  }
  return out;
}
