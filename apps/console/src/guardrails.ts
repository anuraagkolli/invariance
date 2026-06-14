// Single source of truth for the Guardrails view AND the demo-honesty test
// (apps/demo/test/guardrails-catalog.e2e.test.ts). DOM-free on purpose so the
// node test can import it. Every draft/check below was verified live against
// the streamline manifest.

export type GuardrailLayer = "authoring" | "runtime";

export interface GuardrailRuntime {
  /** Demo-API path (the console prefixes /demo-api; the test uses apiUrl + path). */
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** True when the invariant held (response is canonical / rolled back). */
  check: (json: any) => boolean;
}

export interface GuardrailTest {
  id: string;
  label: string;
  /** Manifest policy id, or "platform-safety" for built-in verifier guards. */
  policyId: string;
  layer: GuardrailLayer;
  /** Posted to POST /v1/apps/:app/subjects/:sid/bundles. */
  draft: unknown;
  /** Authoring only: substring expected in the 422 reasons. */
  expect?: { contains: string };
  /** Runtime only. */
  runtime?: GuardrailRuntime;
}

const sandboxBudgets = { cpuMs: 50, memMb: 32 };

export const GUARDRAIL_TESTS: GuardrailTest[] = [
  // ---- Runtime (defense-in-depth: signed cheat, neutralized at execution) ----
  {
    id: "titles-runtime",
    label: "Rewrite show titles",
    policyId: "titles-immutable",
    layer: "runtime",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "list-shows", phase: "response" },
          language: "js",
          source: "(p)=>({shows:p.shows.map(s=>({...s,title:s.title.toUpperCase()}))})",
        },
      ],
      capabilities: {
        reads: [{ endpointId: "list-shows" }],
        writes: [{ endpointId: "list-shows", fields: ["shows"] }],
        budgets: sandboxBudgets,
      },
    },
    runtime: {
      path: "/api/shows",
      // canonical titles contain lowercase; an applied cheat would be all-caps.
      check: (j) => Array.isArray(j.shows) && j.shows.some((s: any) => /[a-z]/.test(s.title)),
    },
  },
  {
    id: "maturity-runtime",
    label: "Strip maturity ratings",
    policyId: "maturity-immutable",
    layer: "runtime",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "list-shows", phase: "response" },
          language: "js",
          source: "(p)=>({shows:p.shows.map(({maturity,...s})=>s)})",
        },
      ],
      capabilities: {
        reads: [{ endpointId: "list-shows" }],
        writes: [{ endpointId: "list-shows", fields: ["shows"] }],
        budgets: sandboxBudgets,
      },
    },
    runtime: {
      path: "/api/shows",
      check: (j) =>
        Array.isArray(j.shows) && j.shows.every((s: any) => typeof s.maturity === "string"),
    },
  },
  {
    id: "featured-runtime",
    label: "Rewrite the billboard title",
    policyId: "featured-title-immutable",
    layer: "runtime",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "featured", phase: "response" },
          language: "js",
          source: "(p)=>({...p,show:{...p.show,title:'OWNED'}})",
        },
      ],
      capabilities: {
        reads: [{ endpointId: "featured" }],
        writes: [{ endpointId: "featured", fields: ["show"] }],
        budgets: sandboxBudgets,
      },
    },
    runtime: {
      path: "/api/featured",
      check: (j) => j.show?.title !== "OWNED",
    },
  },
  {
    id: "priority-runtime",
    label: "Force priority out of range",
    policyId: "priority-range",
    layer: "runtime",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "add-watchlist", phase: "request" },
          language: "js",
          source: "(p)=>({...p,priority:99})",
        },
      ],
      capabilities: {
        reads: [{ endpointId: "add-watchlist" }],
        writes: [{ endpointId: "add-watchlist", fields: ["priority"] }],
        budgets: sandboxBudgets,
      },
    },
    runtime: {
      path: "/api/watchlist",
      method: "POST",
      body: { showId: "s1" },
      check: (j) => j.item?.priority !== 99,
    },
  },
  // ---- Authoring (rejected before it is ever signed) ----
  {
    id: "titles-authoring",
    label: "Declare a write to titles",
    policyId: "titles-immutable",
    layer: "authoring",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "list-shows", phase: "response" },
          language: "js",
          source: "(p)=>p",
        },
      ],
      capabilities: {
        reads: [],
        writes: [{ endpointId: "list-shows", fields: ["shows.*.title"] }],
        budgets: sandboxBudgets,
      },
    },
    expect: { contains: "immutable field" },
  },
  {
    id: "deletes-authoring",
    label: "Hook the delete endpoint",
    policyId: "no-hooking-deletes",
    layer: "authoring",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "remove-watchlist", phase: "response" },
          language: "js",
          source: "(p)=>p",
        },
      ],
      capabilities: {
        reads: [],
        writes: [{ endpointId: "remove-watchlist", fields: ["x"] }],
        budgets: sandboxBudgets,
      },
    },
    expect: { contains: "denied endpoint" },
  },
  {
    id: "budget-authoring",
    label: "Exceed the hook CPU budget",
    policyId: "hook-budgets",
    layer: "authoring",
    draft: {
      hooks: [
        {
          id: "h",
          trigger: { endpointId: "list-shows", phase: "response" },
          language: "js",
          source: "(p)=>p",
        },
      ],
      capabilities: {
        reads: [],
        writes: [{ endpointId: "list-shows", fields: ["shows"] }],
        budgets: { cpuMs: 200, memMb: 32 },
      },
    },
    expect: { contains: "exceeds policy max" },
  },
  {
    id: "xss-authoring",
    label: "Inject unsafe CSS",
    policyId: "platform-safety",
    layer: "authoring",
    draft: {
      uiOps: [
        {
          type: "style-rule",
          selector: ".show-card",
          declarations: { background: "url(javascript:alert(1))" },
        },
      ],
    },
    expect: { contains: "unsafe css" },
  },
  {
    id: "slot-authoring",
    label: "Override a locked UI slot",
    policyId: "platform-safety",
    layer: "authoring",
    draft: {
      uiOps: [
        { type: "slot-override", componentId: "billboard", slot: "meta", content: "hacked" },
      ],
    },
    expect: { contains: "not overridable" },
  },
];

export interface HumanEvent {
  icon: string;
  tone: "block" | "warn" | "muted";
  text: string;
}

/** Render a raw telemetry event as a legible feed line. */
export function eventToHuman(e: {
  type: string;
  detail?: Record<string, unknown>;
}): HumanEvent {
  const violations = Array.isArray(e.detail?.violations)
    ? (e.detail!.violations as string[]).join("; ")
    : "";
  switch (e.type) {
    case "hook_policy_violation":
      return {
        icon: "🛡️",
        tone: "block",
        text: `BLOCKED · a mod broke an invariant → app served canonical data — ${violations}`,
      };
    case "hook_capability_violation":
      return {
        icon: "🛡️",
        tone: "block",
        text: `CONTAINED · a mod exceeded its declared capabilities — ${violations}`,
      };
    case "hook_failed":
      return {
        icon: "⚠️",
        tone: "warn",
        text: `a hook failed inside the sandbox — ${String(e.detail?.reason ?? "")}`,
      };
    case "mod_authored":
      return { icon: "✨", tone: "muted", text: "a customization was authored & verified" };
    case "mod_killed":
      return { icon: "⛔", tone: "muted", text: "a developer killed a customization" };
    case "mod_restored":
      return { icon: "↩︎", tone: "muted", text: "a customization was restored" };
    default:
      return { icon: "•", tone: "muted", text: e.type };
  }
}
