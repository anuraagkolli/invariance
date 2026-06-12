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

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";

const isFunctionType = (type: string) =>
  type === "ArrowFunctionExpression" ||
  type === "FunctionExpression" ||
  type === "FunctionDeclaration";

/** Return statements belonging to `fn` itself, not to functions nested in it. */
function collectOwnReturns(node: AstNode, out: AstNode[]): void {
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!isNode(child) || isFunctionType(child.type)) continue;
      if (child.type === "ReturnStatement") out.push(child);
      collectOwnReturns(child, out);
    }
  }
}

/**
 * True when the expression plausibly evaluates to the whole payload: the
 * payload parameter itself, an object literal (immutable-update style), or a
 * sequence/conditional ending in one of those. Assignments, member accesses,
 * and calls all return fragments — the runtime would replace the entire
 * payload with that fragment.
 */
function returnsWholePayload(expr: AstNode, param: string): boolean {
  switch (expr.type) {
    case "Identifier":
      return expr.name === param;
    case "ObjectExpression":
      return true;
    case "SequenceExpression": {
      const expressions = expr.expressions as AstNode[];
      const last = expressions[expressions.length - 1];
      return last !== undefined && returnsWholePayload(last, param);
    }
    case "ConditionalExpression":
      return (
        returnsWholePayload(expr.consequent as AstNode, param) &&
        returnsWholePayload(expr.alternate as AstNode, param)
      );
    default:
      return false;
  }
}

const RETURN_CONTRACT =
  "hook must return the full payload object — mutate it and end with `return payload;` " +
  "(an expression like `payload.x = ...` returns only that fragment, which would replace the entire payload)";

/** The hook's return value becomes the new payload; enforce that shape statically. */
function checkPayloadReturn(fn: AstNode): string[] {
  const params = fn.params as AstNode[];
  const first = params[0];
  if (!first || first.type !== "Identifier") {
    return ["hook must take the JSON payload as a single named parameter"];
  }
  const param = first.name as string;
  const body = fn.body as AstNode;
  if (body.type !== "BlockStatement") {
    return returnsWholePayload(body, param) ? [] : [RETURN_CONTRACT];
  }
  const returns: AstNode[] = [];
  collectOwnReturns(body, returns);
  if (returns.length === 0) return [RETURN_CONTRACT];
  return returns.every(
    (r) => isNode(r.argument) && returnsWholePayload(r.argument as AstNode, param),
  )
    ? []
    : [RETURN_CONTRACT];
}

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
  } else if (single) {
    const stmt = single as unknown as AstNode;
    const fn = (isBareFunction ? stmt.expression : stmt.declaration) as AstNode;
    reasons.push(...checkPayloadReturn(fn));
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
