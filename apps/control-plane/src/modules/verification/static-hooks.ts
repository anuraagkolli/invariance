import { parse } from "acorn";
import { simple as walkSimple } from "acorn-walk";

const MAX_SOURCE_LENGTH = 20_000;

const FORBIDDEN_IDENTIFIERS = new Set([
  "eval",
  "Function",
  "globalThis",
  "process",
  "require",
  "fetch",
  "XMLHttpRequest",
  "WebAssembly",
  "Proxy",
  "Reflect",
  "importScripts",
]);

const FORBIDDEN_MEMBERS = new Set(["constructor", "__proto__", "prototype"]);

/**
 * Static analysis gate for hook source. The QuickJS sandbox is the real
 * security boundary (none of these globals exist there); this layer exists to
 * reject obviously hostile or out-of-contract code before it is ever signed,
 * and to give the authoring loop precise repair feedback.
 *
 * Contract: source must be a single synchronous function — either a bare
 * function/arrow expression or `export default <function>`.
 */
export function analyzeHookSource(source: string): string[] {
  const reasons: string[] = [];
  if (source.length > MAX_SOURCE_LENGTH) {
    return [`hook source exceeds ${MAX_SOURCE_LENGTH} characters`];
  }

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { ecmaVersion: 2022, sourceType: "module" });
  } catch (err) {
    return [`hook source does not parse: ${(err as Error).message}`];
  }

  const body = ast.body;
  const isFunctionNode = (node: { type: string }) =>
    node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";
  const single = body.length === 1 ? body[0] : undefined;
  const isBareFunction =
    single?.type === "ExpressionStatement" && isFunctionNode(single.expression);
  const isDefaultExportFunction =
    single?.type === "ExportDefaultDeclaration" &&
    (isFunctionNode(single.declaration) || single.declaration.type === "FunctionDeclaration");
  if (!isBareFunction && !isDefaultExportFunction) {
    reasons.push(
      "hook source must be a single function expression (optionally `export default`)",
    );
  }

  walkSimple(ast, {
    Identifier(node) {
      if (FORBIDDEN_IDENTIFIERS.has(node.name)) {
        reasons.push(`forbidden identifier: ${node.name}`);
      }
    },
    MemberExpression(node) {
      const prop = node.property;
      const name =
        prop.type === "Identifier" && !node.computed
          ? prop.name
          : prop.type === "Literal"
            ? String(prop.value)
            : null;
      if (name && FORBIDDEN_MEMBERS.has(name)) {
        reasons.push(`forbidden member access: ${name}`);
      }
    },
    ImportDeclaration() {
      reasons.push("imports are not allowed in hooks");
    },
    ImportExpression() {
      reasons.push("dynamic import is not allowed in hooks");
    },
    AwaitExpression() {
      reasons.push("hooks must be synchronous (await not allowed)");
    },
    WithStatement() {
      reasons.push("with statements are not allowed");
    },
    FunctionDeclaration(node) {
      if (node.async || node.generator) reasons.push("hooks must be plain synchronous functions");
    },
    FunctionExpression(node) {
      if (node.async || node.generator) reasons.push("hooks must be plain synchronous functions");
    },
    ArrowFunctionExpression(node) {
      if (node.async) reasons.push("hooks must be plain synchronous functions");
    },
  });

  return [...new Set(reasons)];
}
