import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

/** What `invariance init` could learn about the host repo without an LLM. */
export interface RepoScan {
  /** package.json name, if any. */
  packageName: string | null;
  frameworks: { react: boolean; next: boolean; express: boolean };
  cssTokens: Array<{ name: string; value: string; file: string }>;
  routes: Array<{ method: string; path: string; file: string }>;
  components: Array<{ name: string; file: string }>;
  /** Relative paths of every source file seen (context for AI drafting). */
  files: string[];
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "coverage", ".vercel", ".cache",
]);
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const STYLE_EXTS = new Set([".css", ".scss", ".less"]);
const MAX_FILES = 4000;

function* walk(dir: string, root: string, seen = { count: 0 }): Generator<string> {
  if (seen.count > MAX_FILES) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(join(dir, entry.name), root, seen);
    } else if (entry.isFile()) {
      seen.count++;
      yield relative(root, join(dir, entry.name));
    }
  }
}

const CSS_VAR_RE = /(--[a-zA-Z][\w-]*)\s*:\s*([^;}{]+)[;}]/g;
const EXPRESS_ROUTE_RE =
  /\b(?:app|router|server)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const NEXT_ROUTE_METHOD_RE =
  /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const COMPONENT_RE =
  /export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g;

/** `app/api/users/[id]/route.ts` -> `/api/users/:id` */
function nextRoutePath(file: string): string {
  const segments = file
    .replace(/\\/g, "/")
    .replace(/^(src\/)?app/, "")
    .replace(/\/route\.(ts|js|tsx|jsx)$/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith("[") ? `:${s.replace(/[[\]]|\.{3}/g, "")}` : s));
  return `/${segments.join("/")}`;
}

export function scanRepo(root: string): RepoScan {
  const scan: RepoScan = {
    packageName: null,
    frameworks: { react: false, next: false, express: false },
    cssTokens: [],
    routes: [],
    components: [],
    files: [],
  };

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scan.packageName = pkg.name ?? null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      scan.frameworks.react = "react" in deps;
      scan.frameworks.next = "next" in deps;
      scan.frameworks.express = "express" in deps;
    } catch {
      // unreadable package.json: scan the files anyway
    }
  }

  const seenTokens = new Set<string>();
  const seenRoutes = new Set<string>();
  const seenComponents = new Set<string>();

  for (const file of walk(root, root)) {
    scan.files.push(file);
    const ext = extname(file);

    if (STYLE_EXTS.has(ext)) {
      const text = readFileSync(join(root, file), "utf8");
      for (const match of text.matchAll(CSS_VAR_RE)) {
        const name = match[1]!;
        const value = match[2]!.trim();
        // var() chains reference tokens; the definitions are what users restyle.
        if (!seenTokens.has(name) && !value.startsWith("var(")) {
          seenTokens.add(name);
          scan.cssTokens.push({ name, value, file });
        }
      }
    }

    if (SOURCE_EXTS.has(ext)) {
      const text = readFileSync(join(root, file), "utf8");

      for (const match of text.matchAll(EXPRESS_ROUTE_RE)) {
        const method = match[1]!.toUpperCase();
        const path = match[2]!;
        const key = `${method} ${path}`;
        if (!seenRoutes.has(key) && path.startsWith("/")) {
          seenRoutes.add(key);
          scan.routes.push({ method, path, file });
        }
      }

      if (/(^|\/)route\.(ts|js)$/.test(file) && /(^|\/)(src\/)?app\//.test(file)) {
        const path = nextRoutePath(file);
        for (const match of text.matchAll(NEXT_ROUTE_METHOD_RE)) {
          const key = `${match[1]} ${path}`;
          if (!seenRoutes.has(key)) {
            seenRoutes.add(key);
            scan.routes.push({ method: match[1]!, path, file });
          }
        }
      }

      if (ext === ".tsx" || ext === ".jsx") {
        for (const match of text.matchAll(COMPONENT_RE)) {
          const name = match[1]!;
          if (!seenComponents.has(name)) {
            seenComponents.add(name);
            scan.components.push({ name, file });
          }
        }
      }
    }
  }

  return scan;
}
