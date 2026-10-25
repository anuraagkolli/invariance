import { parse } from "acorn";
import type { ModBundle } from "@invariance/schema";

/**
 * Static write-capability derivation for hook sources.
 *
 * Weak models routinely author a *correct* hook but mis-declare its `writes`
 * capability (e.g. `writes: []`). The static verifier can't catch that — it
 * doesn't simulate execution — so at runtime `checkCapabilityWrites` discards
 * the hook's output and it silently no-ops (the user sees "success", nothing
 * changes). This module reads the hook's source and infers the top-level
 * payload keys it can write, so the authoring pipeline can repair the declared
 * writes before signing.
 *
 * Coarse on purpose — top-level keys only. The runtime's capability match is
 * descendant-or-equal, so declaring the array/object root (`shows`) covers every
 * nested write under it (`shows.0.title`); and the verifier still rejects writes
 * that target an immutable field, so widening to a root never weakens a policy.
 */

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isNode = (v: unknown): v is AstNode =>
  typeof v === "object" && v !== null && typeof (v as AstNode).type === "string";

const isFunctionType = (t: string) =>
  t === "ArrowFunctionExpression" || t === "FunctionExpression" || t === "FunctionDeclaration";

// Array/object methods that mutate the receiver in place.
const MUTATORS = new Set([
  "sort",
  "reverse",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "fill",
  "copyWithin",
]);

/** A non-computed member/property key name, or null for dynamic keys. */
function memberKey(member: AstNode): string | null {
  const prop = member.property as AstNode;
  if (!member.computed && prop?.type === "Identifier") return prop.name as string;
  if (prop?.type === "Literal") return String(prop.value);
  return null;
}
function propertyKey(prop: AstNode): string | null {
  const key = prop.key as AstNode;
  if (!prop.computed && key?.type === "Identifier") return key.name as string;
  if (key?.type === "Literal") return String(key.value);
  return null;
}

/** The top-level payload key for a member chain rooted at `param`, else null. */
function topLevelKey(node: AstNode | undefined, param: string): string | null {
  let cur = node;
  while (cur && cur.type === "MemberExpression") {
    const obj = cur.object as AstNode;
    if (obj?.type === "Identifier" && obj.name === param) return memberKey(cur);
    cur = obj;
  }
  return null;
}

/** Explicit (non-spread) top-level keys of returned object literal expressions. */
function collectObjectKeys(expr: AstNode | undefined, out: Set<string>): void {
  if (!expr) return;
  switch (expr.type) {
    case "ObjectExpression":
      for (const p of expr.properties as AstNode[]) {
        if (p.type !== "Property") continue; // skip SpreadElement (`...payload`)
        const k = propertyKey(p);
        if (k) out.add(k);
      }
      return;
    case "ConditionalExpression":
      collectObjectKeys(expr.consequent as AstNode, out);
      collectObjectKeys(expr.alternate as AstNode, out);
      return;
    case "SequenceExpression": {
      const exprs = expr.expressions as AstNode[];
      collectObjectKeys(exprs[exprs.length - 1], out);
      return;
    }
    default:
      return;
  }
}

/** Return statements belonging to `node` itself, not to functions nested in it. */
function collectOwnReturns(node: AstNode, out: AstNode[]): void {
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!isNode(child) || isFunctionType(child.type)) continue;
      if (child.type === "ReturnStatement") out.push(child);
      collectOwnReturns(child, out);
    }
  }
}

/** Recursively visit every node (including nested functions). */
function walkAll(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) walkAll(child, visit);
    }
  }
}

function findHookFunction(ast: AstNode): AstNode | null {
  const body = ast.body as AstNode[];
  const single = body.length === 1 ? body[0] : undefined;
  if (!single) return null;
  if (single.type === "ExpressionStatement" && isFunctionType((single.expression as AstNode).type)) {
    return single.expression as AstNode;
  }
  if (single.type === "ExportDefaultDeclaration") {
    const decl = single.declaration as AstNode;
    if (isFunctionType(decl.type)) return decl;
  }
  return null;
}

/**
 * Top-level payload keys a hook may write — from its returned object literal(s),
 * assignments to the payload param, and in-place mutations of the param's
 * fields. Returns `[]` for an identity hook, an unparseable source, or anything
 * not matching the single-function contract (the verifier rejects those anyway).
 */
export function deriveWrittenFields(source: string): string[] {
  let ast: AstNode;
  try {
    ast = parse(source, { ecmaVersion: 2022, sourceType: "module" }) as unknown as AstNode;
  } catch {
    return [];
  }
  const fn = findHookFunction(ast);
  if (!fn) return [];
  const first = (fn.params as AstNode[])[0];
  if (!first || first.type !== "Identifier") return [];
  const param = first.name as string;

  const keys = new Set<string>();

  // 1) Returned object literals (the hook's OWN returns, never nested funcs).
  const fnBody = fn.body as AstNode;
  if (fnBody.type === "BlockStatement") {
    const returns: AstNode[] = [];
    collectOwnReturns(fnBody, returns);
    for (const r of returns) collectObjectKeys(r.argument as AstNode, keys);
  } else {
    collectObjectKeys(fnBody, keys); // expression-bodied arrow
  }

  // 2) Assignments / updates to `param.<key>`, and in-place mutator calls on it.
  //    Walked over the whole function so a mutation inside a callback still
  //    counts; the param-root filter ignores writes to other variables (e.g. a
  //    `.map(s => ...)` callback's `s`).
  walkAll(fn, (n) => {
    if (n.type === "AssignmentExpression") {
      const k = topLevelKey(n.left as AstNode, param);
      if (k) keys.add(k);
    } else if (n.type === "UpdateExpression") {
      const k = topLevelKey(n.argument as AstNode, param);
      if (k) keys.add(k);
    } else if (n.type === "CallExpression") {
      const callee = n.callee as AstNode;
      if (callee?.type === "MemberExpression") {
        const method = memberKey(callee);
        if (method && MUTATORS.has(method)) {
          const k = topLevelKey(callee.object as AstNode, param);
          if (k) keys.add(k);
        }
      }
    }
  });

  return [...keys];
}

/**
 * Repair under-declared write capabilities from the bundle's hooks. Returns the
 * merged write list and the `endpoint.field` entries that were added. Only adds
 * coverage for what hooks statically write; never removes a declared capability.
 */
export function deriveRepairedWrites(bundle: ModBundle): {
  writes: ModBundle["capabilities"]["writes"];
  added: string[];
} {
  const writes = bundle.capabilities.writes.map((w) => ({ ...w, fields: [...(w.fields ?? [])] }));
  const added: string[] = [];
  for (const hook of bundle.hooks) {
    const fields = deriveWrittenFields(hook.source);
    if (fields.length === 0) continue;
    const endpointId = hook.trigger.endpointId;
    let entry = writes.find((w) => w.endpointId === endpointId);
    if (!entry) {
      entry = { endpointId, fields: [] };
      writes.push(entry);
    }
    for (const field of fields) {
      const covered = entry.fields.some((d) => field === d || field.startsWith(`${d}.`));
      if (!covered) {
        entry.fields.push(field);
        added.push(`${endpointId}.${field}`);
      }
    }
  }
  return { writes, added };
}
