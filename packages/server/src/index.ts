// Tier-1 server SDK: middleware adapters, sandboxed hook executor,
// capability enforcement. Everything here fails open — a mod can never break
// the host app.
export { createInvarianceMiddleware, type InvarianceMiddlewareConfig } from "./express";
export { withInvariance, type FetchHandler, type InvarianceFetchConfig } from "./fetch";
export { InvarianceRuntime, type InvarianceServerConfig } from "./runtime";
export { executeHook, toFunctionExpression, type HookBudgets, type HookExecution } from "./sandbox";
export { checkCapabilityWrites, checkFieldConstraints } from "./enforce";
