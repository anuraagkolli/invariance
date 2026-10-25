# Console "Guardrails" Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Invariance's invariant enforcement a visible, repeatable, watchable demo beat — a console view that shows enforcement happening live and lets the presenter trigger a real violation per invariant on cue and watch it held.

**Architecture:** Add a new **Guardrails** view to the existing console (`apps/console`). It renders the manifest's declared invariants, each with "Test it" button(s) that fire a *real* violation attempt — authoring-time (POST a crafted draft → `422`) or runtime (register a signed cheat → fetch the real demo API → rolled back). A live feed polls a new control-plane route `GET /v1/apps/:appId/events`. A declarative catalog (`apps/console/src/guardrails.ts`) is the single source of truth, validated by a demo-honesty e2e test so the demo can't silently rot.

**Tech Stack:** TypeScript (strict, ESM), Hono (control plane), React + Vite (console), vitest. No enforcement-engine changes — this only makes the existing behavior visible.

**Spec:** `docs/superpowers/specs/2026-06-13-console-guardrails-design.md`

---

## File structure

- `apps/control-plane/src/app.ts` — MODIFY: add `GET /v1/apps/:appId/events`.
- `apps/control-plane/test/events-route.test.ts` — CREATE: route unit test.
- `apps/console/vite.config.ts` — MODIFY: add `/demo-api` proxy → `:4500`.
- `apps/console/src/api.ts` — MODIFY: add `events()`, `postBundle()`, `fetchDemo()` helpers + `RecentEvent` type.
- `apps/console/src/guardrails.ts` — CREATE: catalog + `eventToHuman()` (DOM-free, node-importable).
- `apps/console/src/App.tsx` — MODIFY: add `GuardrailsView`, hash route `#/guardrails`, nav link.
- `apps/console/src/styles.css` — MODIFY: feed + card styles.
- `apps/demo/test/guardrails-catalog.e2e.test.ts` — CREATE: demo-honesty test importing the catalog.

---

## Task 1: Control-plane `/events` route

**Files:**
- Test: `apps/control-plane/test/events-route.test.ts`
- Modify: `apps/control-plane/src/app.ts` (add a route near the existing `analytics/summary` route, ~line 271)

- [ ] **Step 1: Write the failing test**

Create `apps/control-plane/test/events-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";

describe("GET /v1/apps/:appId/events", () => {
  it("returns recent events newest-first, limited, with detail", async () => {
    const cp = createControlPlane();
    await cp.store.addEvent({ type: "a", appId: "streamline", at: 1 });
    await cp.store.addEvent({
      type: "hook_policy_violation",
      appId: "streamline",
      at: 2,
      detail: { violations: ["immutable field changed: shows.*.title"] },
    });
    await cp.store.addEvent({ type: "c", appId: "streamline", at: 3 });

    const res = await cp.app.fetch(
      new Request("http://local/v1/apps/streamline/events?limit=2"),
    );
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as {
      events: Array<{ type: string; detail?: { violations?: string[] } }>;
    };
    expect(events.map((e) => e.type)).toEqual(["c", "hook_policy_violation"]);
    expect(events[1]?.detail?.violations).toEqual([
      "immutable field changed: shows.*.title",
    ]);
  });

  it("caps limit at 200 and defaults sanely", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(
      new Request("http://local/v1/apps/streamline/events"),
    );
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(events)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @invariance/control-plane test events-route`
Expected: FAIL — route returns 404 (no such route), so `res.status` is 404 not 200.

- [ ] **Step 3: Add the route**

In `apps/control-plane/src/app.ts`, immediately after the `analytics/summary` route (the `app.get("/v1/apps/:appId/analytics/summary", ...)` block, ~line 271-273), add:

```ts
  /**
   * Recent activity feed across all subjects of an app, newest-first — the
   * data source for the console's live Guardrails enforcement feed.
   * `store.listEvents` is chronological (oldest-first of the last N); reverse
   * for newest-first display.
   */
  app.get("/v1/apps/:appId/events", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const events = await store.listEvents(c.req.param("appId"), { limit });
    return c.json({ events: events.reverse() });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @invariance/control-plane test events-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/src/app.ts apps/control-plane/test/events-route.test.ts
git commit -m "Control plane: recent-events feed route for the console"
```

---

## Task 2: Console API helpers + demo-API proxy

No test (the console has no test runner; these are thin fetch wrappers exercised by Task 3's honesty test and manual verification in Task 6).

**Files:**
- Modify: `apps/console/vite.config.ts`
- Modify: `apps/console/src/api.ts`

- [ ] **Step 1: Add the `/demo-api` proxy**

Replace the `server` block in `apps/console/vite.config.ts` with:

```ts
  server: {
    port: Number(process.env.CONSOLE_PORT ?? 4600),
    proxy: {
      "/v1": process.env.INVARIANCE_REGISTRY ?? "http://localhost:4400",
      "/demo-api": {
        target: process.env.DEMO_API_URL ?? "http://localhost:4500",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/demo-api/, ""),
      },
    },
  },
```

- [ ] **Step 2: Add the API helpers**

In `apps/console/src/api.ts`, add this type after the `SubjectEvent` interface (~line 55):

```ts
export interface RecentEvent {
  type: string;
  subjectId?: string;
  modId?: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface BundlePostResult {
  status: number;
  ok: boolean;
  reasons: string[];
}
```

Then add these three members to the `api` object (inside the `export const api = { ... }` literal, after `restore`):

```ts
  events: async (appId: string, limit = 30) =>
    (await get<{ events: RecentEvent[] }>(`/v1/apps/${appId}/events?limit=${limit}`)).events,
  /** POST a hand-crafted draft to the verifier route; never throws on 422. */
  postBundle: async (
    appId: string,
    subjectId: string,
    draft: unknown,
  ): Promise<BundlePostResult> => {
    const res = await fetch(
      `/v1/apps/${appId}/subjects/${encodeURIComponent(subjectId)}/bundles`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      },
    );
    const body = (await res.json().catch(() => ({}))) as { reasons?: string[] };
    return { status: res.status, ok: res.ok, reasons: body.reasons ?? [] };
  },
  /** Hit the real demo API (via the /demo-api vite proxy) as a given subject. */
  fetchDemo: async (
    path: string,
    subjectId: string,
    init?: { method?: string; body?: unknown },
  ): Promise<unknown> => {
    const res = await fetch(`/demo-api${path}`, {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json", "x-demo-user": subjectId },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    return res.json();
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @invariance/console typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/console/vite.config.ts apps/console/src/api.ts
git commit -m "Console: events/postBundle/fetchDemo helpers + demo-api proxy"
```

---

## Task 3: Guardrails catalog + demo-honesty test (TDD core)

The catalog is the single source of truth for both the console UI (Task 4) and this test. Writing the test first locks the contract.

**Files:**
- Test: `apps/demo/test/guardrails-catalog.e2e.test.ts`
- Create: `apps/console/src/guardrails.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/demo/test/guardrails-catalog.e2e.test.ts`:

```ts
// @vitest-environment node
import { createInvarianceMiddleware } from "@invariance/server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer } from "../server/app";
import { GUARDRAIL_TESTS } from "../../console/src/guardrails";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

let cp: TestControlPlane;
let api: Server;
let apiUrl: string;

beforeAll(async () => {
  cp = await startControlPlane();
  await publishDemoManifest(cp.url);
  const app = createDemoServer({
    middleware: createInvarianceMiddleware({
      registryUrl: cp.url,
      appId: "streamline",
      getSubject: (req) => req.header("x-demo-user") ?? undefined,
      pointerTtlMs: 0,
    }),
  });
  api = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => api.close(resolve));
  await cp.close();
});

describe("guardrails catalog stays honest against the live manifest", () => {
  it("every catalog entry exists and is well-formed", () => {
    expect(GUARDRAIL_TESTS.length).toBeGreaterThanOrEqual(8);
    for (const t of GUARDRAIL_TESTS) {
      expect(t.id).toBeTruthy();
      if (t.layer === "runtime") expect(t.runtime).toBeTruthy();
      else expect(t.expect?.contains).toBeTruthy();
    }
  });

  for (const t of GUARDRAIL_TESTS) {
    it(`[${t.layer}] ${t.id} → invariant holds`, async () => {
      const sid = `__guardrail_${t.id}`;
      const reg = await fetch(
        `${cp.url}/v1/apps/streamline/subjects/${sid}/bundles`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(t.draft),
        },
      );

      if (t.layer === "authoring") {
        expect(reg.status).toBe(422);
        const body = (await reg.json()) as { reasons: string[] };
        expect(body.reasons.join(" | ")).toContain(t.expect!.contains);
        return;
      }

      // runtime: the cheat passes verification + signing...
      expect(reg.status).toBe(201);
      // ...then the demo runtime neutralizes it at execution.
      const r = t.runtime!;
      const res = await fetch(`${apiUrl}${r.path}`, {
        method: r.method ?? "GET",
        headers: { "content-type": "application/json", "x-demo-user": sid },
        ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {}),
      });
      const json = await res.json();
      expect(r.check(json)).toBe(true); // invariant held (canonical data)

      // ...and the block is recorded as developer-visible telemetry.
      const ov = (await (
        await fetch(`${cp.url}/v1/apps/streamline/subjects/${sid}/overview`)
      ).json()) as { events: Array<{ type: string }> };
      expect(ov.events.some((e) => e.type === "hook_policy_violation")).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @invariance/demo test guardrails-catalog`
Expected: FAIL — `Cannot find module '../../console/src/guardrails'` (file not created yet).

- [ ] **Step 3: Create the catalog**

Create `apps/console/src/guardrails.ts` (DOM-free — types + data + pure functions only, so the node test can import it):

```ts
// Single source of truth for the Guardrails view AND the demo-honesty test
// (apps/demo/test/guardrails-catalog.e2e.test.ts). DOM-free on purpose.
// Every draft/check below was verified live against the streamline manifest.

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
      check: (j) => Array.isArray(j.shows) && j.shows.every((s: any) => typeof s.maturity === "string"),
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
export function eventToHuman(e: { type: string; detail?: Record<string, unknown> }): HumanEvent {
  const violations = Array.isArray(e.detail?.violations)
    ? (e.detail!.violations as string[]).join("; ")
    : "";
  switch (e.type) {
    case "hook_policy_violation":
      return { icon: "🛡️", tone: "block", text: `BLOCKED · a mod broke an invariant → app served canonical data — ${violations}` };
    case "hook_capability_violation":
      return { icon: "🛡️", tone: "block", text: `CONTAINED · a mod exceeded its declared capabilities — ${violations}` };
    case "hook_failed":
      return { icon: "⚠️", tone: "warn", text: `a hook failed inside the sandbox — ${String(e.detail?.reason ?? "")}` };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @invariance/demo test guardrails-catalog`
Expected: PASS — 1 well-formed test + one test per catalog entry (≥9), each green.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/guardrails.ts apps/demo/test/guardrails-catalog.e2e.test.ts
git commit -m "Guardrails: catalog + demo-honesty e2e (single source of truth)"
```

---

## Task 4: Guardrails view + routing in the console

No automated test (no console test runner); verified manually in Task 6. Keep the code complete and correct.

**Files:**
- Modify: `apps/console/src/App.tsx`

- [ ] **Step 1: Extend hash routing**

In `apps/console/src/App.tsx`, replace the `subjectFromHash` helper (lines 35-39) with:

```ts
/** Hash routing: "" = dashboard, "#/guardrails" = guardrails, "#/u/<id>" = drill-down. */
function subjectFromHash(): string | null {
  const match = /^#\/u\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

function isGuardrailsHash(): boolean {
  return window.location.hash === "#/guardrails";
}
```

- [ ] **Step 2: Track the guardrails route + render it**

In the `App()` component, add a `guardrails` state alongside `subject` and keep it in sync on hashchange. Replace the body of `App()` (lines 42-87) with:

```ts
  const [appId, setAppId] = useState(DEFAULT_APP);
  const [subject, setSubject] = useState<string | null>(() => subjectFromHash());
  const [guardrails, setGuardrails] = useState<boolean>(() => isGuardrailsHash());

  useEffect(() => {
    const onHash = () => {
      setSubject(subjectFromHash());
      setGuardrails(isGuardrailsHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openSubject = (subjectId: string) => {
    window.location.hash = `#/u/${encodeURIComponent(subjectId)}`;
  };
  const closeSubject = () => {
    window.location.hash = "";
  };

  return (
    <div className="console">
      <header>
        <h1>
          <span className="logo">◆</span>{" "}
          <button className="title-link" onClick={closeSubject}>
            Invariance Console
          </button>
          {subject && (
            <span className="crumb">
              {" "}
              / <span className="muted">user</span> {subject}
            </span>
          )}
          {guardrails && <span className="crumb"> / Guardrails</span>}
        </h1>
        <div className="header-right">
          <a className="nav-link" href="#/guardrails">
            Guardrails
          </a>
          <label>
            App{" "}
            <input value={appId} onChange={(e) => setAppId(e.target.value)} spellCheck={false} />
          </label>
        </div>
      </header>

      {guardrails ? (
        <GuardrailsView appId={appId} />
      ) : subject ? (
        <SubjectView appId={appId} subjectId={subject} onBack={closeSubject} />
      ) : (
        <Dashboard appId={appId} onOpenSubject={openSubject} />
      )}
    </div>
  );
```

- [ ] **Step 3: Add the imports**

At the top of `apps/console/src/App.tsx`, update the `./api` import to add the new members and add the catalog import. Replace lines 3-9 with:

```ts
import {
  api,
  type AnalyticsSummary,
  type ModContents,
  type ModRow,
  type RecentEvent,
  type SubjectOverview,
} from "./api";
import {
  eventToHuman,
  GUARDRAIL_TESTS,
  type GuardrailTest,
} from "./guardrails";
```

- [ ] **Step 4: Add the `GuardrailsView` component**

Append to `apps/console/src/App.tsx` (after the `describePolicy` function at the end of the file). It reuses the existing `describePolicy` (same module):

```tsx
interface GuardrailResult {
  held: boolean;
  text: string;
}

async function runGuardrailTest(appId: string, t: GuardrailTest): Promise<GuardrailResult> {
  const sid = `__guardrail_${t.id}_${Date.now()}`;
  if (t.layer === "authoring") {
    const r = await api.postBundle(appId, sid, t.draft);
    return r.status === 422
      ? { held: true, text: `Rejected at authoring — ${r.reasons.join("; ")}` }
      : { held: false, text: `Unexpected ${r.status}: it was NOT rejected` };
  }
  const reg = await api.postBundle(appId, sid, t.draft);
  if (reg.status !== 201) {
    return { held: false, text: `cheat failed to register (${reg.status})` };
  }
  try {
    const json = await api.fetchDemo(
      t.runtime!.path,
      sid,
      t.runtime!.method === "POST" ? { method: "POST", body: t.runtime!.body } : undefined,
    );
    return t.runtime!.check(json)
      ? { held: true, text: "Neutralized at runtime — the app served canonical data" }
      : { held: false, text: "Runtime did NOT roll back the cheat!" };
  } catch (err) {
    return { held: false, text: `demo API unreachable (${(err as Error).message}) — is :4500 up?` };
  }
}

function GuardrailsView({ appId }: { appId: string }) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [results, setResults] = useState<Record<string, GuardrailResult | "running">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const ev = await api.events(appId, 30);
        if (active) {
          setEvents(ev);
          setError(null);
        }
      } catch (err) {
        if (active) setError(`Cannot reach the control plane (${(err as Error).message})`);
      }
    };
    void api.manifest(appId).then((m) => active && setManifest(m)).catch(() => undefined);
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [appId]);

  const runTest = async (t: GuardrailTest) => {
    setResults((r) => ({ ...r, [t.id]: "running" }));
    const result = await runGuardrailTest(appId, t);
    setResults((r) => ({ ...r, [t.id]: result }));
  };

  // "held N times" per policy, derived from the live feed.
  const heldByPolicy = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (e.type === "hook_policy_violation" || e.type === "hook_capability_violation") {
        const sid = e.subjectId ?? "";
        const t = GUARDRAIL_TESTS.find((x) => sid.startsWith(`__guardrail_${x.id}_`));
        if (t) counts[t.policyId] = (counts[t.policyId] ?? 0) + 1;
      }
    }
    return counts;
  }, [events]);

  const policies = manifest?.policies ?? [];
  const platformTests = GUARDRAIL_TESTS.filter((t) => t.policyId === "platform-safety");

  return (
    <main>
      <section className="panel wide">
        <h2>Live enforcement</h2>
        <p className="hint">
          Every applied customization, rejection, and runtime block — newest first, updating live.
          Trigger any guardrail below and watch it land here.
        </p>
        {error && <div className="error">{error}</div>}
        {events.length === 0 ? (
          <p className="muted">No activity yet. Run a guardrail test below.</p>
        ) : (
          <ul className="feed">
            {events.map((e, i) => {
              const h = eventToHuman(e);
              return (
                <li key={i} className={`feed-${h.tone}`}>
                  <span className="feed-icon">{h.icon}</span>
                  <span className="feed-text">{h.text}</span>
                  <span className="muted feed-time">{new Date(e.at).toLocaleTimeString()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel wide">
        <h2>Your invariants</h2>
        <p className="hint">
          Declared in your manifest. Click “Test it” to fire a real violation attempt and prove the
          guardrail holds — either rejected before signing, or neutralized at runtime.
        </p>
        <div className="guardrails">
          {policies.map((p) => {
            const tests = GUARDRAIL_TESTS.filter((t) => t.policyId === p.id);
            return (
              <GuardrailCard
                key={p.id}
                title={describePolicy(p)}
                held={heldByPolicy[p.id] ?? 0}
                tests={tests}
                results={results}
                onRun={runTest}
              />
            );
          })}
          {platformTests.length > 0 && (
            <GuardrailCard
              title="Platform safety (built-in: XSS, locked slots, unknown tokens)"
              held={0}
              tests={platformTests}
              results={results}
              onRun={runTest}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function GuardrailCard({
  title,
  held,
  tests,
  results,
  onRun,
}: {
  title: string;
  held: number;
  tests: GuardrailTest[];
  results: Record<string, GuardrailResult | "running">;
  onRun: (t: GuardrailTest) => void;
}) {
  if (tests.length === 0) {
    return (
      <div className="guardrail-card">
        <div className="guardrail-title">{title}</div>
        <p className="muted">No test available for this invariant yet.</p>
      </div>
    );
  }
  return (
    <div className="guardrail-card">
      <div className="guardrail-title">
        {title} {held > 0 && <span className="held">held ✓ {held}</span>}
      </div>
      {tests.map((t) => {
        const res = results[t.id];
        return (
          <div key={t.id} className="guardrail-test">
            <button onClick={() => onRun(t)} disabled={res === "running"}>
              {res === "running" ? "Testing…" : `Test: ${t.label}`}
            </button>
            <span className={`tag tag-${t.layer}`}>{t.layer}</span>
            {res && res !== "running" && (
              <div className={res.held ? "verdict-held" : "verdict-fail"}>
                {res.held ? "🛡️ " : "❌ "}
                {res.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm -F @invariance/console typecheck`
Expected: PASS. (If `AppManifest` is unused-flagged, it is already imported at the top of App.tsx line 1 — no change needed.)

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/App.tsx
git commit -m "Console: Guardrails view — live feed + per-invariant test buttons"
```

---

## Task 5: Guardrails styles

**Files:**
- Modify: `apps/console/src/styles.css`

- [ ] **Step 1: Append styles**

Append to `apps/console/src/styles.css`:

```css
/* Guardrails view */
.nav-link {
  margin-right: 16px;
  color: var(--accent, #6ea8fe);
  text-decoration: none;
  font-weight: 600;
}
.nav-link:hover { text-decoration: underline; }

.feed { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.feed li {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  font-size: 14px;
}
.feed-block { background: rgba(220, 60, 60, 0.10); border-left-color: #e0564b; }
.feed-warn  { background: rgba(220, 160, 40, 0.10); border-left-color: #d9a648; }
.feed-muted { background: rgba(127, 127, 127, 0.06); }
.feed-icon { font-size: 15px; }
.feed-time { font-size: 12px; white-space: nowrap; }

.guardrails { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.guardrail-card { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 14px; }
.guardrail-title { font-weight: 600; margin-bottom: 10px; }
.guardrail-title .held {
  margin-left: 8px; font-size: 12px; font-weight: 600;
  color: #3fbf6f; background: rgba(63, 191, 111, 0.12);
  padding: 2px 8px; border-radius: 999px;
}
.guardrail-test { margin: 8px 0; }
.guardrail-test button { margin-right: 8px; }
.tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
.tag-authoring { background: rgba(110, 168, 254, 0.16); color: #6ea8fe; }
.tag-runtime { background: rgba(186, 130, 255, 0.16); color: #ba82ff; }
.verdict-held { color: #3fbf6f; font-size: 13px; margin-top: 6px; }
.verdict-fail { color: #e0564b; font-size: 13px; margin-top: 6px; font-weight: 600; }
```

- [ ] **Step 2: Typecheck (CSS has no test; confirm the app still builds)**

Run: `pnpm -F @invariance/console build`
Expected: PASS (vite build succeeds).

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/styles.css
git commit -m "Console: Guardrails styles (feed + invariant cards)"
```

---

## Task 6: Full-stack manual verification

No new code — drive the running app to confirm the demo beat works end-to-end.

- [ ] **Step 1: Boot the stack** (4 terminals or background jobs)

```bash
# control plane (qwen optional here — Guardrails needs no LLM)
PORT=4400 pnpm -F @invariance/control-plane dev
# seed manifest + demo-user mod
pnpm -F @invariance/demo seed
# demo API (must be up for runtime guardrail tests)
PORT=4500 pnpm -F @invariance/demo dev:api
# console
pnpm -F @invariance/console dev   # http://localhost:4600/#/guardrails
```

- [ ] **Step 2: Drive the Guardrails view**

Open `http://localhost:4600/#/guardrails`. Confirm:
- The "Your invariants" section lists titles/maturity/featured/priority/deletes/budgets cards + a "Platform safety" card.
- Click "Test: Rewrite show titles" (runtime) → card shows "🛡️ Neutralized at runtime — the app served canonical data", and the **Live enforcement** feed shows a red "BLOCKED · a mod broke an invariant" line within ~2 s.
- Click "Test: Hook the delete endpoint" (authoring) → card shows "🛡️ Rejected at authoring — … denied endpoint …".
- The "held ✓ N" badge increments on the runtime cards as you re-run.

- [ ] **Step 3: Capture evidence**

Screenshot `http://localhost:4600/#/guardrails` after triggering 2-3 tests (feed populated, verdicts shown). Save to `/tmp/inv-demo-logs/guardrails.png`.

- [ ] **Step 4: Run the full affected test suites**

```bash
pnpm -F @invariance/control-plane test
pnpm -F @invariance/demo test
pnpm -F @invariance/console typecheck
```
Expected: all green (control-plane gains the events-route test; demo gains the guardrails-catalog e2e).

- [ ] **Step 5: Final commit (if any tidy-ups)**

```bash
git add -A && git commit -m "Guardrails: manual verification tidy-ups" || echo "nothing to commit"
```

---

## Self-review notes (already applied)

- **Spec coverage:** `/events` route (Task 1), `/demo-api` proxy + helpers (Task 2), catalog + honesty test covering all 6 manifest policies + platform-safety (Task 3), Guardrails view with live feed + per-invariant test buttons + held-counters (Task 4), styles (Task 5), manual verification (Task 6). Deferred items (contrast card, Approach-C) are explicitly out of scope per spec.
- **Type consistency:** `GuardrailTest`/`GuardrailRuntime`/`GuardrailResult`/`RecentEvent`/`BundlePostResult`/`HumanEvent` are defined once and referenced consistently; `api.events/postBundle/fetchDemo` signatures match their call sites; `eventToHuman` and `GUARDRAIL_TESTS` are imported where used.
- **No placeholders:** every step ships complete code and exact commands.
- **Honesty guarantee:** the catalog is imported by both the console and the demo e2e test, so a manifest change that makes a "cheat" legal fails the test instead of silently breaking the demo.
