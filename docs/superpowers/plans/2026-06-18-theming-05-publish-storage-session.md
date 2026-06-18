# Publish + Storage + Authoring Session (MockAgent e2e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic governance half of the theming pipeline — three storage interfaces, the fail-graceful publisher, the append-only version-retention invariant, the authoring session state machine, deterministic failure-UX templates, and the zero-LLM MockAgent end-to-end loop.
**Architecture:** All code lives control-plane-side under `apps/control-plane/src/theming/{publish,authoring}`. The publisher writes `BlobStore` → `PointerStore` → `AuditStore` in that contractual order. The session state machine consumes the pure core from `@invariance/theming` (`parseSpec`, `mergeDelta`, `diffSpecs`, `compile`, `verify`) and exposes `runTurn` / `acknowledge` / `resetToPublished` — the diff-confirm acknowledgment is what advances `draft`. MockAgent implements the Plan-07-owned `Agent` interface to drive the whole loop with canned StyleSpecs and no LLM.
**Tech Stack:** TypeScript strict ESM, zod (schema-first), vitest, in-memory storage stubs for tests.

## Global Constraints
- pnpm workspaces + turborepo; pnpm ONLY (never npm or yarn).
- TypeScript strict mode, ESM (`"type": "module"`).
- Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step.
- zod is the source of truth: export both `XSchema` and `type X = z.infer<typeof XSchema>`.
- Cross-schema integrity checks live in `superRefine` blocks.
- vitest; tests colocated under each package's `test/`. Run e.g. `pnpm -F @invariance/control-plane test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast).
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys).
- DETERMINISM: `compile()`/`verify()`/`renderStyleText()`/`mergeDelta()`/`diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps OUTSIDE the pure core (publisher/audit own timestamps).
- Package layout (exact paths):
  - `packages/theming/` (`@invariance/theming`) — pure core: `src/roles/ src/manifest/ src/spec/ src/session/ src/profile/ src/compile/ src/verify/ src/artifact/`.
  - `apps/control-plane/src/theming/scan/` — Scanner.
  - `apps/control-plane/src/theming/publish/` — storage interfaces, publisher, version retention. (THIS PLAN)
  - `apps/control-plane/src/theming/authoring/` — session orchestration, MockAgent, gatekeeper, designer, failure-UX templates. (THIS PLAN)
  - `packages/client/src/theming/scan-sdk/` — in-browser scan.
  - `apps/<host>/` — data-plane Next.js adapter.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/control-plane/src/theming/publish/stores.ts` | The three storage interfaces (`BlobStore`, `PointerStore`, `AuditStore`), their row/record types (`AuditRow`, `PublishedRecord`), and in-memory implementations (`InMemoryBlobStore`, `InMemoryPointerStore`, `InMemoryAuditStore`) for tests. |
| `apps/control-plane/src/theming/publish/publisher.ts` | `publish(input, stores)` (blob → pointer → audit write order, refuses failed verdict) + `setKillSwitch(tenant, status, pointer)`. |
| `apps/control-plane/src/theming/publish/retention.ts` | The append-only-while-referenced version-retention invariant: `referencedVersions(audit)` + `assertRetained(toDelete, audit)`. |
| `apps/control-plane/src/theming/publish/index.ts` | Barrel re-export of the publish module. |
| `apps/control-plane/src/theming/authoring/failure-ux.ts` | `failureTemplate(failure)` → `FailureMessage`; deterministic templates keyed on every `WallFailureCode` / `VerifyFailureCode`. |
| `apps/control-plane/src/theming/authoring/session.ts` | `Session`, `TurnResult`, `runTurn`, `acknowledge`, `resetToPublished`, `resetToAppDefault`, `APP_DEFAULT_SPEC`. |
| `apps/control-plane/src/theming/authoring/mock-agent.ts` | `MockAgent implements Agent` — feeds canned classifications + sparse StyleSpec JSON. |
| `apps/control-plane/src/theming/authoring/index.ts` | Barrel re-export of the authoring module. |
| `apps/control-plane/src/theming/authoring/agent-types.ts` | **Plan-07-owned stub for THIS plan only** — the dependency-light `Agent` / `Gatekeeper*` / `Designer*` / `GateClassification` / `ConstraintEnvelope` / `buildEnvelope` type declarations Plan 05 imports types-only. (Plan 07 supplies the real impl; this plan creates the type module so MockAgent compiles.) |
| `apps/control-plane/test/theming/publish/stores.test.ts` | In-memory store round-trip + pointer-miss vs disabled distinction. |
| `apps/control-plane/test/theming/publish/publisher.test.ts` | Write-order, fail-graceful-on-crash, refuse-failed-verdict, kill-switch. |
| `apps/control-plane/test/theming/publish/retention.test.ts` | Referenced-version enumeration + delete-while-referenced rejection. |
| `apps/control-plane/test/theming/authoring/failure-ux.test.ts` | Every failure code yields a deterministic, filled template. |
| `apps/control-plane/test/theming/authoring/session.test.ts` | Three turn outcomes, acknowledgment-advances-draft, reset paths. |
| `apps/control-plane/test/theming/authoring/mock-agent.test.ts` | Canned classifications + sparse spec JSON in order; throws on exhaustion. |
| `apps/control-plane/test/theming/authoring/e2e.test.ts` | Zero-LLM end-to-end loop: MockAgent → wall → merge → compile → verify → publish → reset. |
| `apps/control-plane/package.json` | Add `@invariance/theming` workspace dep + ensure vitest/test script (modify). |
| `apps/control-plane/vitest.config.ts` | Vitest config (`test/**/*.test.ts`, node env) — created only if absent (Task 1). |

---

### Task 1: control-plane package wiring + theming dir

**Files:**
- Modify: `apps/control-plane/package.json`
- Create: `apps/control-plane/vitest.config.ts` (only if absent)

**Interfaces:**
- Consumes: nothing yet.
- Produces: a `@invariance/control-plane` package that depends on `@invariance/theming` (workspace) and runs vitest. Establishes `pnpm -F @invariance/control-plane test`.

- [ ] **Step 1: Inspect current package.json** — run the command, read the output to learn the exact current `name`, `dependencies`, `devDependencies`, and `scripts` so the edit is surgical.

  ```bash
  cat /Users/anuraag/invariance/apps/control-plane/package.json
  ```

- [ ] **Step 2: Add the workspace dependency + test script** — open `apps/control-plane/package.json` and ensure these keys exist (merge into the real file; do not clobber unrelated keys). The `"@invariance/theming": "workspace:*"` dep and a vitest `test` script are the only required additions:

  ```jsonc
  {
    "type": "module",
    "scripts": {
      "test": "vitest run",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@invariance/theming": "workspace:*",
      "zod": "^3.25.0"
    },
    "devDependencies": {
      "@types/node": "^22.0.0",
      "typescript": "^5.6.0",
      "vitest": "^3.0.0"
    }
  }
  ```

- [ ] **Step 3: Create vitest config if absent** — only create this file if `apps/control-plane/vitest.config.ts` does not already exist:

  ```ts
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      environment: "node",
    },
  });
  ```

- [ ] **Step 4: Install + verify the dep resolves** — run from the repo root:

  ```bash
  cd /Users/anuraag/invariance && pnpm install
  ```

  Expected: install completes with no error about an unresolvable `@invariance/theming` workspace dep. (If `@invariance/theming` does not yet exist on this branch, Plan 01 has not landed — STOP and surface that this plan depends on Plan 01's package being present.)

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/package.json apps/control-plane/vitest.config.ts && git commit -m "chore(theming): wire @invariance/theming dep + vitest into control-plane"
  ```

---

### Task 2: Storage interfaces + in-memory implementations

**Files:**
- Create: `apps/control-plane/src/theming/publish/stores.ts`
- Test: `apps/control-plane/test/theming/publish/stores.test.ts`

**Interfaces:**
- Consumes (from `@invariance/theming`):
  - `type ThemeArtifact` ; `type Pointer` ; `type StyleSpec` ; `type Verdict`
- Produces (the ledger §9.1–§9.2 verbatim):
  - ```ts
    export interface BlobStore {
      putArtifact(hash: string, artifact: ThemeArtifact): Promise<void>;
      getArtifact(hash: string): Promise<ThemeArtifact | null>;
    }
    export interface PointerStore {
      getPointer(tenant: string): Promise<Pointer | null>;
      putPointer(tenant: string, pointer: Pointer): Promise<void>;
    }
    export interface AuditStore {
      recordAudit(row: AuditRow): Promise<void>;
      getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null>;
    }
    export type AuditRow = {
      tenant: string; hash: string; prompt: string; styleSpec: StyleSpec;
      verifierReport: Verdict; actor: string; timestamp: string;
      vocabVersion: string; profileVersion: string;
    };
    export type PublishedRecord = { styleSpec: StyleSpec; vocabVersion: string; profileVersion: string };
    export class InMemoryBlobStore implements BlobStore { /* ... */ }
    export class InMemoryPointerStore implements PointerStore { /* ... */ }
    export class InMemoryAuditStore implements AuditStore { listAudits(): AuditRow[]; /* ... */ }
    ```

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/publish/stores.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
  import {
    InMemoryBlobStore,
    InMemoryPointerStore,
    InMemoryAuditStore,
    type AuditRow,
  } from "../../../src/theming/publish/stores.js";

  const artifact = (appId: string): ThemeArtifact => ({
    schemaVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    appId,
    modes: { light: { selector: ":root", vars: { "--background": "0 0% 100%" } } },
    meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
  });

  const spec: StyleSpec = { colors: { primary: { l: 0.5, c: 0.2, h: 250 } } };
  const okVerdict: Verdict = { ok: true };

  const row = (tenant: string, hash: string): AuditRow => ({
    tenant,
    hash,
    prompt: "make it blue",
    styleSpec: spec,
    verifierReport: okVerdict,
    actor: "admin@acme",
    timestamp: "2026-06-18T00:00:00.000Z",
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
  });

  describe("InMemoryBlobStore", () => {
    it("round-trips an artifact by hash and is idempotent", async () => {
      const blob = new InMemoryBlobStore();
      await blob.putArtifact("h1", artifact("nebula"));
      await blob.putArtifact("h1", artifact("nebula")); // idempotent
      expect(await blob.getArtifact("h1")).toEqual(artifact("nebula"));
    });

    it("returns null for a missing hash", async () => {
      const blob = new InMemoryBlobStore();
      expect(await blob.getArtifact("nope")).toBeNull();
    });
  });

  describe("InMemoryPointerStore", () => {
    it("returns null for a pointer MISS (distinct from disabled)", async () => {
      const ptr = new InMemoryPointerStore();
      expect(await ptr.getPointer("acme")).toBeNull();
    });

    it("round-trips a live pointer and overwrites on re-put", async () => {
      const ptr = new InMemoryPointerStore();
      const live: Pointer = { hash: "h1", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" };
      await ptr.putPointer("acme", live);
      expect(await ptr.getPointer("acme")).toEqual(live);
      const disabled: Pointer = { hash: "h1", status: "disabled", updatedAt: "2026-06-18T01:00:00.000Z" };
      await ptr.putPointer("acme", disabled);
      expect((await ptr.getPointer("acme"))?.status).toBe("disabled");
    });
  });

  describe("InMemoryAuditStore", () => {
    it("records rows and reads the published spec back by (tenant, hash)", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("acme", "h1"));
      const rec = await audit.getPublishedSpec("acme", "h1");
      expect(rec).toEqual({ styleSpec: spec, vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" });
    });

    it("returns null when the (tenant, hash) pair was never recorded", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("acme", "h1"));
      expect(await audit.getPublishedSpec("acme", "other-hash")).toBeNull();
      expect(await audit.getPublishedSpec("other-tenant", "h1")).toBeNull();
    });

    it("exposes the full append-only log via listAudits()", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("acme", "h1"));
      await audit.recordAudit(row("acme", "h2"));
      expect(audit.listAudits().map((r) => r.hash)).toEqual(["h1", "h2"]);
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- stores
  ```

  Expected failure: `Cannot find module '../../../src/theming/publish/stores.js'` (the file does not exist yet).

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/publish/stores.ts`:

  ```ts
  import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";

  // ─── Row / record types (ledger §9.2) ─────────────────────────────────────
  export type AuditRow = {
    tenant: string;
    hash: string; // the published artifact hash
    prompt: string; // tenant admin prompt — control-plane-side only, never in the bundle
    styleSpec: StyleSpec; // produced spec — STORED (functional read path)
    verifierReport: Verdict;
    actor: string; // tenant admin identity
    timestamp: string; // ISO
    vocabVersion: string; // versions live AT PUBLISH (stamp)
    profileVersion: string;
  };

  export type PublishedRecord = {
    styleSpec: StyleSpec;
    vocabVersion: string;
    profileVersion: string;
  };

  // ─── Interfaces (ledger §9.1) ──────────────────────────────────────────────
  // Content-addressed blob store (R2): immutable artifacts keyed by hash.
  export interface BlobStore {
    putArtifact(hash: string, artifact: ThemeArtifact): Promise<void>; // idempotent (content-addressed)
    getArtifact(hash: string): Promise<ThemeArtifact | null>;
  }

  // Short-TTL mutable pointer store (KV): tenant → Pointer.
  export interface PointerStore {
    getPointer(tenant: string): Promise<Pointer | null>; // null = pointer miss (distinct from disabled)
    putPointer(tenant: string, pointer: Pointer): Promise<void>;
  }

  // Relational governance store (D1): audit trail + functional read path (reset/recompile).
  export interface AuditStore {
    recordAudit(row: AuditRow): Promise<void>;
    getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null>;
  }

  // ─── In-memory implementations (tests) ─────────────────────────────────────
  export class InMemoryBlobStore implements BlobStore {
    private readonly map = new Map<string, ThemeArtifact>();
    async putArtifact(hash: string, artifact: ThemeArtifact): Promise<void> {
      // content-addressed ⇒ idempotent: same hash means same content; last write is identical.
      this.map.set(hash, artifact);
    }
    async getArtifact(hash: string): Promise<ThemeArtifact | null> {
      return this.map.get(hash) ?? null;
    }
  }

  export class InMemoryPointerStore implements PointerStore {
    private readonly map = new Map<string, Pointer>();
    async getPointer(tenant: string): Promise<Pointer | null> {
      return this.map.get(tenant) ?? null;
    }
    async putPointer(tenant: string, pointer: Pointer): Promise<void> {
      this.map.set(tenant, pointer);
    }
  }

  export class InMemoryAuditStore implements AuditStore {
    private readonly rows: AuditRow[] = [];
    async recordAudit(row: AuditRow): Promise<void> {
      this.rows.push(row);
    }
    async getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null> {
      // last-wins read of the matching (tenant, hash) audit row.
      for (let i = this.rows.length - 1; i >= 0; i--) {
        const r = this.rows[i]!;
        if (r.tenant === tenant && r.hash === hash) {
          return { styleSpec: r.styleSpec, vocabVersion: r.vocabVersion, profileVersion: r.profileVersion };
        }
      }
      return null;
    }
    // test/retention helper — the append-only log.
    listAudits(): AuditRow[] {
      return [...this.rows];
    }
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- stores
  ```

  Expected: PASS (all `stores.test.ts` assertions green).

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/publish/stores.ts apps/control-plane/test/theming/publish/stores.test.ts && git commit -m "feat(theming): storage interfaces + in-memory blob/pointer/audit stores"
  ```

---

### Task 3: The publisher (write-order, refuse-failed-verdict, kill-switch)

**Files:**
- Create: `apps/control-plane/src/theming/publish/publisher.ts`
- Test: `apps/control-plane/test/theming/publish/publisher.test.ts`

**Interfaces:**
- Consumes:
  - From `@invariance/theming`: `hashArtifact(artifact: ThemeArtifact): string` ; `type ThemeArtifact` ; `type Pointer` ; `type StyleSpec` ; `type Verdict`
  - From Task 2: `BlobStore`, `PointerStore`, `AuditStore`, `AuditRow`
- Produces (the ledger §9.3 verbatim):
  - ```ts
    export type PublishStores = { blob: BlobStore; pointer: PointerStore; audit: AuditStore };
    export type PublishInput = {
      tenant: string; artifact: ThemeArtifact; styleSpec: StyleSpec; verifierReport: Verdict;
      prompt: string; actor: string; vocabVersion: string; profileVersion: string;
    };
    export type PublishResult = { hash: string; pointer: Pointer };
    export type Clock = { now?: () => string };  // optional deterministic-timestamp injection (ledger widening)
    export function publish(input: PublishInput, stores: PublishStores, clock?: Clock): Promise<PublishResult>;
    export function setKillSwitch(tenant: string, status: "live" | "disabled", pointer: PointerStore, clock?: Clock): Promise<Pointer>;
    ```
  - **Ledger widening (flag when implementing):** both `publish` and `setKillSwitch` accept an OPTIONAL trailing `clock?: { now?: () => string }` argument ONLY for deterministic timestamps in tests (default `() => new Date().toISOString()`). The ledger §9.3 signatures omit it; it is a backward-compatible optional trailing parameter, so a ledger-shaped caller `publish(input, stores)` / `setKillSwitch(tenant, status, pointer)` still type-checks. The timestamp is stamped OUTSIDE the pure core (publisher/audit own timestamps, per Global Constraints).

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/publish/publisher.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
  import { hashArtifact } from "@invariance/theming";
  import {
    InMemoryBlobStore,
    InMemoryPointerStore,
    InMemoryAuditStore,
    type BlobStore,
    type PointerStore,
  } from "../../../src/theming/publish/stores.js";
  import { publish, setKillSwitch, type PublishInput, type PublishStores } from "../../../src/theming/publish/publisher.js";

  const artifact: ThemeArtifact = {
    schemaVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    appId: "nebula",
    modes: { light: { selector: ":root", vars: { "--background": "0 0% 100%" } } },
    meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
  };
  const spec: StyleSpec = { colors: { primary: { l: 0.5, c: 0.2, h: 250 } } };
  const okVerdict: Verdict = { ok: true };

  const input = (over: Partial<PublishInput> = {}): PublishInput => ({
    tenant: "acme",
    artifact,
    styleSpec: spec,
    verifierReport: okVerdict,
    prompt: "make it blue",
    actor: "admin@acme",
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    ...over,
  });

  const stores = (): PublishStores & { blob: InMemoryBlobStore; pointer: InMemoryPointerStore; audit: InMemoryAuditStore } => ({
    blob: new InMemoryBlobStore(),
    pointer: new InMemoryPointerStore(),
    audit: new InMemoryAuditStore(),
  });

  const fixedNow = () => "2026-06-18T12:00:00.000Z";

  describe("publish", () => {
    it("content-addresses the artifact, flips the pointer live, and records audit", async () => {
      const s = stores();
      const res = await publish(input(), s, { now: fixedNow });
      const expectedHash = hashArtifact(artifact);
      expect(res.hash).toBe(expectedHash);
      expect(res.pointer).toEqual({ hash: expectedHash, status: "live", updatedAt: "2026-06-18T12:00:00.000Z" });
      expect(await s.blob.getArtifact(expectedHash)).toEqual(artifact);
      expect(await s.pointer.getPointer("acme")).toEqual(res.pointer);
      const rec = await s.audit.getPublishedSpec("acme", expectedHash);
      expect(rec).toEqual({ styleSpec: spec, vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" });
      const logged = s.audit.listAudits()[0]!;
      expect(logged.prompt).toBe("make it blue");
      expect(logged.actor).toBe("admin@acme");
      expect(logged.timestamp).toBe("2026-06-18T12:00:00.000Z");
    });

    it("refuses a failed verdict — nothing is written anywhere", async () => {
      const s = stores();
      const failVerdict: Verdict = { ok: false, failures: [{ code: "contrast_floor", mode: "light", message: "x" }] };
      await expect(publish(input({ verifierReport: failVerdict }), s)).rejects.toThrow(/verdict/i);
      expect(s.audit.listAudits()).toHaveLength(0);
      expect(await s.pointer.getPointer("acme")).toBeNull();
    });

    it("write order is blob → pointer → audit (no pointer to a missing artifact on a mid-write crash)", async () => {
      const order: string[] = [];
      const expectedHash = hashArtifact(artifact);
      let blobbedHash: string | null = null;
      const blob: BlobStore = {
        async putArtifact(hash) { order.push("blob"); blobbedHash = hash; },
        async getArtifact() { return null; },
      };
      // pointer write throws AFTER blob, BEFORE audit — simulating a crash.
      const pointer: PointerStore = {
        async getPointer() { return null; },
        async putPointer() { order.push("pointer"); throw new Error("kv down"); },
      };
      const audit = new InMemoryAuditStore();
      await expect(
        publish(input(), { blob, pointer, audit }, { now: fixedNow }),
      ).rejects.toThrow(/kv down/);
      // blob ran first (with the content-addressed hash), pointer attempted,
      // audit NEVER ran ⇒ no pointer to a missing artifact.
      expect(order).toEqual(["blob", "pointer"]);
      expect(blobbedHash).toBe(expectedHash);
      expect(audit.listAudits()).toHaveLength(0);
    });
  });

  describe("setKillSwitch", () => {
    it("flips an existing pointer to disabled, preserving the hash", async () => {
      const ptr = new InMemoryPointerStore();
      const live: Pointer = { hash: "h1", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" };
      await ptr.putPointer("acme", live);
      const next = await setKillSwitch("acme", "disabled", ptr, { now: fixedNow });
      expect(next).toEqual({ hash: "h1", status: "disabled", updatedAt: "2026-06-18T12:00:00.000Z" });
      expect((await ptr.getPointer("acme"))?.status).toBe("disabled");
    });

    it("throws when there is no pointer to flip (a kill-switch presupposes a publish)", async () => {
      const ptr = new InMemoryPointerStore();
      await expect(setKillSwitch("acme", "disabled", ptr)).rejects.toThrow(/no pointer/i);
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- publisher
  ```

  Expected failure: `Cannot find module '../../../src/theming/publish/publisher.js'`.

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/publish/publisher.ts`:

  ```ts
  import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
  import { hashArtifact } from "@invariance/theming";
  import type { BlobStore, PointerStore, AuditStore, AuditRow } from "./stores.js";

  export type PublishStores = { blob: BlobStore; pointer: PointerStore; audit: AuditStore };

  export type PublishInput = {
    tenant: string;
    artifact: ThemeArtifact;
    styleSpec: StyleSpec;
    verifierReport: Verdict; // must be { ok: true } — publish refuses a failed verdict
    prompt: string;
    actor: string;
    vocabVersion: string;
    profileVersion: string;
  };

  export type PublishResult = { hash: string; pointer: Pointer };

  // Timestamps are stamped OUTSIDE the pure core; injectable for deterministic tests.
  // Optional trailing arg (ledger §9.3 widening): a ledger-shaped caller omits it.
  export type Clock = { now?: () => string };
  const isoNow = (clock?: Clock): string => (clock?.now ?? (() => new Date().toISOString()))();

  // Write order is load-bearing (§9): artifact to blob FIRST → flip pointer → record audit LAST.
  // A crash between steps never leaves a pointer to a missing artifact.
  export async function publish(input: PublishInput, stores: PublishStores, clock?: Clock): Promise<PublishResult> {
    if (!input.verifierReport.ok) {
      throw new Error("publish refused: verifier verdict is not { ok: true }");
    }
    const hash = hashArtifact(input.artifact);
    const timestamp = isoNow(clock);

    // 1) blob FIRST (content-addressed, idempotent).
    await stores.blob.putArtifact(hash, input.artifact);

    // 2) flip the pointer live.
    const pointer: Pointer = { hash, status: "live", updatedAt: timestamp };
    await stores.pointer.putPointer(input.tenant, pointer);

    // 3) record the audit row LAST (the governance product + functional read path).
    const row: AuditRow = {
      tenant: input.tenant,
      hash,
      prompt: input.prompt,
      styleSpec: input.styleSpec,
      verifierReport: input.verifierReport,
      actor: input.actor,
      timestamp,
      vocabVersion: input.vocabVersion,
      profileVersion: input.profileVersion,
    };
    await stores.audit.recordAudit(row);

    return { hash, pointer };
  }

  // Kill-switch is also a pointer write (§7.3). Preserves the hash; flips status.
  export async function setKillSwitch(
    tenant: string,
    status: "live" | "disabled",
    pointer: PointerStore,
    clock?: Clock,
  ): Promise<Pointer> {
    const existing = await pointer.getPointer(tenant);
    if (!existing) {
      throw new Error(`setKillSwitch: no pointer for tenant "${tenant}"`);
    }
    const next: Pointer = { hash: existing.hash, status, updatedAt: isoNow(clock) };
    await pointer.putPointer(tenant, next);
    return next;
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- publisher
  ```

  Expected: PASS (write-order array `["blob","pointer"]`, refuse-verdict, kill-switch all green).

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/publish/publisher.ts apps/control-plane/test/theming/publish/publisher.test.ts && git commit -m "feat(theming): fail-graceful publisher (blob→pointer→audit) + kill-switch"
  ```

---

### Task 4: Version retention invariant (append-only while referenced)

**Files:**
- Create: `apps/control-plane/src/theming/publish/retention.ts`
- Test: `apps/control-plane/test/theming/publish/retention.test.ts`

**Interfaces:**
- Consumes: from Task 2 — `AuditStore`, `AuditRow`, `InMemoryAuditStore` (its `listAudits()`).
- Produces:
  - ```ts
    export type VersionRef = { vocabVersions: Set<string>; profileVersions: Set<string> };
    export function referencedVersions(audit: AuditStore & { listAudits(): AuditRow[] }): VersionRef;
    export function assertRetained(
      toDelete: { vocabVersion?: string; profileVersion?: string },
      audit: AuditStore & { listAudits(): AuditRow[] },
    ): void; // throws if a deletion target is still referenced by any stored spec
    ```

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/publish/retention.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import type { StyleSpec, Verdict } from "@invariance/theming";
  import { InMemoryAuditStore, type AuditRow } from "../../../src/theming/publish/stores.js";
  import { referencedVersions, assertRetained } from "../../../src/theming/publish/retention.js";

  const spec: StyleSpec = { radius: 8 };
  const okVerdict: Verdict = { ok: true };

  const row = (vocab: string, profile: string): AuditRow => ({
    tenant: "acme",
    hash: `${vocab}-${profile}`,
    prompt: "x",
    styleSpec: spec,
    verifierReport: okVerdict,
    actor: "admin",
    timestamp: "2026-06-18T00:00:00.000Z",
    vocabVersion: vocab,
    profileVersion: profile,
  });

  describe("referencedVersions", () => {
    it("collects every distinct vocab + profile version stamped in stored specs", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
      await audit.recordAudit(row("iv-roles-1", "iv-profile-2"));
      const refs = referencedVersions(audit);
      expect([...refs.vocabVersions].sort()).toEqual(["iv-roles-1"]);
      expect([...refs.profileVersions].sort()).toEqual(["iv-profile-1", "iv-profile-2"]);
    });
  });

  describe("assertRetained", () => {
    it("rejects deleting a profile version still referenced by a stored spec", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
      expect(() => assertRetained({ profileVersion: "iv-profile-1" }, audit)).toThrow(/iv-profile-1.*referenced/i);
    });

    it("rejects deleting a vocab version still referenced", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
      expect(() => assertRetained({ vocabVersion: "iv-roles-1" }, audit)).toThrow(/iv-roles-1.*referenced/i);
    });

    it("allows deleting a version no stored spec references", async () => {
      const audit = new InMemoryAuditStore();
      await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
      expect(() => assertRetained({ profileVersion: "iv-profile-9" }, audit)).not.toThrow();
      expect(() => assertRetained({ vocabVersion: "iv-roles-9" }, audit)).not.toThrow();
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- retention
  ```

  Expected failure: `Cannot find module '../../../src/theming/publish/retention.js'`.

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/publish/retention.ts`:

  ```ts
  import type { AuditStore, AuditRow } from "./stores.js";

  export type VersionRef = { vocabVersions: Set<string>; profileVersions: Set<string> };

  type AuditReadable = AuditStore & { listAudits(): AuditRow[] };

  // Every vocab + profile version stamped in any stored spec. These are the versions
  // retention must keep alive (§9): reset/recompile recompiles a stamped spec against ITS versions.
  export function referencedVersions(audit: AuditReadable): VersionRef {
    const vocabVersions = new Set<string>();
    const profileVersions = new Set<string>();
    for (const row of audit.listAudits()) {
      vocabVersions.add(row.vocabVersion);
      profileVersions.add(row.profileVersion);
    }
    return { vocabVersions, profileVersions };
  }

  // The append-only-while-referenced invariant (§9): a graph/profile version may NEVER be deleted
  // while any stored StyleSpec references it (else a reset becomes a miscompile-or-crash).
  export function assertRetained(
    toDelete: { vocabVersion?: string; profileVersion?: string },
    audit: AuditReadable,
  ): void {
    const refs = referencedVersions(audit);
    if (toDelete.vocabVersion !== undefined && refs.vocabVersions.has(toDelete.vocabVersion)) {
      throw new Error(`retention: vocabVersion "${toDelete.vocabVersion}" is still referenced by a stored spec`);
    }
    if (toDelete.profileVersion !== undefined && refs.profileVersions.has(toDelete.profileVersion)) {
      throw new Error(`retention: profileVersion "${toDelete.profileVersion}" is still referenced by a stored spec`);
    }
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- retention
  ```

  Expected: PASS.

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/publish/retention.ts apps/control-plane/test/theming/publish/retention.test.ts && git commit -m "feat(theming): append-only-while-referenced version retention invariant"
  ```

---

### Task 5: Publish module barrel

**Files:**
- Create: `apps/control-plane/src/theming/publish/index.ts`

**Interfaces:**
- Consumes: Tasks 2–4 modules.
- Produces: a single import surface for Plan 07 and the e2e test:
  - ```ts
    export * from "./stores.js";
    export * from "./publisher.js";
    export * from "./retention.js";
    ```

- [ ] **Step 1: Create the barrel** — create `apps/control-plane/src/theming/publish/index.ts`:

  ```ts
  export * from "./stores.js";
  export * from "./publisher.js";
  export * from "./retention.js";
  ```

- [ ] **Step 2: Verify it compiles + existing tests still pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane typecheck && pnpm -F @invariance/control-plane test -- publish
  ```

  Expected: typecheck clean (no errors) and PASS for the three publish tests.

- [ ] **Step 3: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/publish/index.ts && git commit -m "feat(theming): publish module barrel"
  ```

---

### Task 6: Agent type stub (Plan-07-owned, types-only for this plan)

**Files:**
- Create: `apps/control-plane/src/theming/authoring/agent-types.ts`

**Interfaces:**
- Consumes: from `@invariance/theming` — `type StyleSpec`, `type ContrastTier`, `type SeedId`, `type RoleId`, `type FontStackId`, `type AppManifest`.
- Produces (ledger §10.1–§10.2 verbatim — the dependency-light home so `MockAgent` can implement `Agent` without a build cycle):
  - ```ts
    export interface Agent { gatekeep(input: GatekeeperInput): Promise<GatekeeperResult>; design(input: DesignerInput): Promise<DesignerResult>; }
    export type GateClassification = "in_scope_styling" | "out_of_scope" | "targets_locked_invariant" | "abuse_or_injection";
    export type GatekeeperInput = { prompt: string; envelope: ConstraintEnvelope };
    export type GatekeeperResult = { classification: GateClassification; reason?: string };
    export type DesignerInput = { prompt: string; draft: StyleSpec; envelope: ConstraintEnvelope };
    export type DesignerResult = { specJson: unknown };
    export type ConstraintEnvelope = { contrastFloor: { tier: ContrastTier }; locks: (SeedId | RoleId)[]; allowedFonts: Array<{ id: FontStackId; stack: string }>; chromaCap: number; defaultSeeds: AppManifest["defaultSeeds"]; };
    export function buildEnvelope(manifest: AppManifest): ConstraintEnvelope;
    ```

> **Note for the executor:** This module is owned by Plan 07. If Plan 07 has already landed
> `agent-types.ts` on this branch, SKIP this task and import from the existing file — do not
> duplicate it. This stub exists only so Plan 05 is self-contained when authored first.

- [ ] **Step 1: Check whether Plan 07 already created this file** —

  ```bash
  ls /Users/anuraag/invariance/apps/control-plane/src/theming/authoring/agent-types.ts 2>/dev/null && echo EXISTS || echo MISSING
  ```

  If it prints `EXISTS`, skip to Task 7 and import the existing types. If `MISSING`, continue.

- [ ] **Step 2: Create the type module** — create `apps/control-plane/src/theming/authoring/agent-types.ts`:

  ```ts
  import type { StyleSpec, ContrastTier, SeedId, RoleId, FontStackId, AppManifest } from "@invariance/theming";

  // The non-deterministic stages — BOTH sit BEFORE the wall. MockAgent (Plan 05) and the real
  // qwen-backed agent (Plan 07) implement this. Declarations live here (dependency-light) so Plan 05
  // can implement Agent without a build cycle (ledger §11 circular-name note).
  export interface Agent {
    // Stage 1: Gatekeeper (cheap LLM, NOT the gate) — one classification call.
    gatekeep(input: GatekeeperInput): Promise<GatekeeperResult>;
    // Stage 2: Designer (quality LLM) — the one creative call. Emits a SPARSE StyleSpec as raw JSON.
    design(input: DesignerInput): Promise<DesignerResult>;
  }

  export type GateClassification =
    | "in_scope_styling"
    | "out_of_scope"
    | "targets_locked_invariant"
    | "abuse_or_injection";

  export type GatekeeperInput = { prompt: string; envelope: ConstraintEnvelope };
  export type GatekeeperResult = { classification: GateClassification; reason?: string };

  export type DesignerInput = { prompt: string; draft: StyleSpec; envelope: ConstraintEnvelope };
  // The Designer returns RAW JSON (unknown) — it crosses the wall via parseSpec, never trusted.
  export type DesignerResult = { specJson: unknown };

  // The constraint envelope — manifest invariants fed to the LLM stages so they propose in-bounds.
  // A UX/cost optimization only; the wall + verifier remain the enforcement.
  export type ConstraintEnvelope = {
    contrastFloor: { tier: ContrastTier };
    locks: (SeedId | RoleId)[];
    allowedFonts: Array<{ id: FontStackId; stack: string }>;
    chromaCap: number;
    defaultSeeds: AppManifest["defaultSeeds"];
  };

  export function buildEnvelope(manifest: AppManifest): ConstraintEnvelope {
    return {
      contrastFloor: { tier: manifest.invariants.contrastTier },
      locks: manifest.invariants.locks,
      allowedFonts: manifest.invariants.allowedFonts,
      chromaCap: manifest.invariants.chromaCap,
      defaultSeeds: manifest.defaultSeeds,
    };
  }
  ```

- [ ] **Step 3: Verify it compiles** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane typecheck
  ```

  Expected: typecheck clean.

- [ ] **Step 4: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/authoring/agent-types.ts && git commit -m "feat(theming): Agent/envelope type stub (Plan-07-owned, types-only seam)"
  ```

---

### Task 7: Deterministic failure-UX templates

**Files:**
- Create: `apps/control-plane/src/theming/authoring/failure-ux.ts`
- Test: `apps/control-plane/test/theming/authoring/failure-ux.test.ts`

**Interfaces:**
- Consumes: from `@invariance/theming` — `type WallFailure`, `type WallFailureCode`, `type VerifyFailure`, `type VerifyFailureCode`.
- Produces (ledger §9.6 verbatim):
  - ```ts
    export type FailureMessage = { code: WallFailureCode | VerifyFailureCode; headline: string; detail: string; suggestion?: string };
    export function failureTemplate(failure: WallFailure | VerifyFailure): FailureMessage;
    ```
  - Deterministic: same failure → byte-identical `FailureMessage`. No LLM, no clock, no randomness. The LLM (Plan 07) only *phrases* this output; it never decides it.

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/authoring/failure-ux.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import type { WallFailure, VerifyFailure } from "@invariance/theming";
  import { failureTemplate } from "../../../src/theming/authoring/failure-ux.js";

  describe("failureTemplate — wall codes", () => {
    it("seed_locked names the offending path and is deterministic", () => {
      const f: WallFailure = { code: "seed_locked", path: "colors.primary", message: "primary is locked" };
      const a = failureTemplate(f);
      const b = failureTemplate(f);
      expect(a).toEqual(b); // deterministic
      expect(a.code).toBe("seed_locked");
      expect(a.detail).toContain("colors.primary");
      expect(a.headline.length).toBeGreaterThan(0);
    });

    it("unparseable_color suggests a valid color", () => {
      const f: WallFailure = { code: "unparseable_color", path: "colors.accent", message: "bad" };
      const out = failureTemplate(f);
      expect(out.code).toBe("unparseable_color");
      expect(out.suggestion).toBeTruthy();
    });

    it("font_not_allowed names the path", () => {
      const f: WallFailure = { code: "font_not_allowed", path: "typography.body", message: "no" };
      expect(failureTemplate(f).detail).toContain("typography.body");
    });

    it("covers every wall code without throwing", () => {
      const codes: WallFailure["code"][] = [
        "unknown_key",
        "unparseable_color",
        "font_not_allowed",
        "seed_locked",
        "out_of_range",
        "schema_invalid",
      ];
      for (const code of codes) {
        const out = failureTemplate({ code, path: "x", message: "m" });
        expect(out.code).toBe(code);
        expect(out.headline.length).toBeGreaterThan(0);
        expect(out.detail.length).toBeGreaterThan(0);
      }
    });
  });

  describe("failureTemplate — verifier codes", () => {
    it("contrast_floor fills required + actual + mode", () => {
      const f: VerifyFailure = {
        code: "contrast_floor",
        mode: "dark",
        pair: { fg: "foreground", bg: "background", category: "text" },
        required: 4.5,
        actual: 3.1,
        message: "low contrast",
      };
      const out = failureTemplate(f);
      expect(out.code).toBe("contrast_floor");
      expect(out.detail).toContain("4.5");
      expect(out.detail).toContain("3.1");
      expect(out.detail).toContain("dark");
    });

    it("locked_drift names the role", () => {
      const f: VerifyFailure = { code: "locked_drift", mode: "light", role: "primary", varName: "--primary", message: "drift" };
      expect(failureTemplate(f).detail).toContain("primary");
    });

    it("covers every verifier code without throwing", () => {
      const base = { mode: "light" as const, message: "m" };
      const codes: VerifyFailure["code"][] = [
        "contrast_floor",
        "locked_drift",
        "chroma_cap",
        "mode_not_allowed",
        "unsafe_value",
      ];
      for (const code of codes) {
        const out = failureTemplate({ ...base, code });
        expect(out.code).toBe(code);
        expect(out.headline.length).toBeGreaterThan(0);
        expect(out.detail.length).toBeGreaterThan(0);
      }
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- failure-ux
  ```

  Expected failure: `Cannot find module '../../../src/theming/authoring/failure-ux.js'`.

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/authoring/failure-ux.ts`:

  ```ts
  import type {
    WallFailure,
    WallFailureCode,
    VerifyFailure,
    VerifyFailureCode,
  } from "@invariance/theming";

  // Deterministic templates keyed on wall/verifier failure code. An LLM only phrases, never decides.
  export type FailureMessage = {
    code: WallFailureCode | VerifyFailureCode;
    headline: string; // deterministic
    detail: string; // deterministic, fillable from the failure fields
    suggestion?: string; // optional steer
  };

  function isVerifyFailure(f: WallFailure | VerifyFailure): f is VerifyFailure {
    // VerifyFailure carries `mode`; WallFailure carries `path`.
    return (f as VerifyFailure).mode !== undefined;
  }

  function wallTemplate(f: WallFailure): FailureMessage {
    switch (f.code) {
      case "unknown_key":
        return {
          code: f.code,
          headline: "That change touched a field we do not recognize.",
          detail: `The field "${f.path}" is not part of this app's theming vocabulary, so the change was rejected.`,
          suggestion: "Rephrase the change in terms of colors, radius, density, fonts, or mode.",
        };
      case "unparseable_color":
        return {
          code: f.code,
          headline: "That color could not be read.",
          detail: `The value at "${f.path}" was not a valid color, so the change was rejected.`,
          suggestion: "Try a plain color like a hex code, e.g. #3b82f6.",
        };
      case "font_not_allowed":
        return {
          code: f.code,
          headline: "That font is not on this app's allowlist.",
          detail: `The font requested at "${f.path}" is not an allowed font for this app, so the change was rejected.`,
          suggestion: "Pick a font from the allowed list for this app.",
        };
      case "seed_locked":
        return {
          code: f.code,
          headline: "That part of the theme is locked by the app.",
          detail: `"${f.path}" is locked by the app's invariants and cannot be changed by a theme.`,
          suggestion: "Try customizing a part of the look that is not locked.",
        };
      case "out_of_range":
        return {
          code: f.code,
          headline: "That value is out of the allowed range.",
          detail: `The value at "${f.path}" is outside the range this app permits, so the change was rejected.`,
          suggestion: "Choose a smaller or more moderate value.",
        };
      case "schema_invalid":
        return {
          code: f.code,
          headline: "That change was not in a valid shape.",
          detail: `The change at "${f.path}" did not match the expected structure, so it was rejected.`,
          suggestion: "Describe the visual change you want and we will try again.",
        };
    }
  }

  function verifyTemplate(f: VerifyFailure): FailureMessage {
    switch (f.code) {
      case "contrast_floor":
        return {
          code: f.code,
          headline: "That change would not meet the accessibility contrast floor.",
          detail: `In ${f.mode} mode, ${f.pair ? `${f.pair.fg} on ${f.pair.bg}` : "a color pair"} reached ${f.actual ?? "?"} but needs at least ${f.required ?? "?"}.`,
          suggestion: "Try a lighter or darker shade so text stays legible.",
        };
      case "locked_drift":
        return {
          code: f.code,
          headline: "That change moved a locked part of the theme.",
          detail: `In ${f.mode} mode, the locked role "${f.role ?? "?"}"${f.varName ? ` (${f.varName})` : ""} drifted from the app's fixed value, so the change was rejected.`,
          suggestion: "Customize a part of the look that is not locked.",
        };
      case "chroma_cap":
        return {
          code: f.code,
          headline: "That color is too saturated for this app.",
          detail: `In ${f.mode} mode, ${f.role ?? "a color"} exceeded the app's chroma cap, so the change was rejected.`,
          suggestion: "Try a more muted version of that color.",
        };
      case "mode_not_allowed":
        return {
          code: f.code,
          headline: "That mode is not enabled for this app.",
          detail: `The ${f.mode} mode is not in this app's allowed modes, so the change was rejected.`,
          suggestion: "Customize a mode this app supports.",
        };
      case "unsafe_value":
        return {
          code: f.code,
          headline: "That value contained something we could not safely apply.",
          detail: `In ${f.mode} mode, ${f.role ?? "a value"}${f.varName ? ` (${f.varName})` : ""} did not pass the safe-value check, so the change was rejected.`,
          suggestion: "Use a plain color or number value.",
        };
    }
  }

  export function failureTemplate(failure: WallFailure | VerifyFailure): FailureMessage {
    return isVerifyFailure(failure) ? verifyTemplate(failure) : wallTemplate(failure);
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- failure-ux
  ```

  Expected: PASS (every wall + verifier code yields a filled, deterministic message).

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/authoring/failure-ux.ts apps/control-plane/test/theming/authoring/failure-ux.test.ts && git commit -m "feat(theming): deterministic failure-UX templates keyed on wall/verifier codes"
  ```

---

### Task 8: The authoring session state machine

**Files:**
- Create: `apps/control-plane/src/theming/authoring/session.ts`
- Test: `apps/control-plane/test/theming/authoring/session.test.ts`

**Interfaces:**
- Consumes (from `@invariance/theming`):
  - `parseSpec(json: unknown, manifest: AppManifest): ParseResult` (`ParseResult = { ok: true; spec } | { ok: false; failures }`)
  - `mergeDelta(draft: StyleSpec, delta: StyleSpec): StyleSpec`
  - `canonicalize(spec: StyleSpec): StyleSpec`
  - `diffSpecs(prev: StyleSpec, next: StyleSpec, manifest: AppManifest): FieldDiff[]`
  - `compile(draft: StyleSpec, manifest: AppManifest): CandidateTheme`
  - `verify(theme: CandidateTheme, manifest: AppManifest): Verdict`
  - types: `StyleSpec`, `AppManifest`, `CandidateTheme`, `FieldDiff`, `Verdict`, `WallFailure`, `VerifyFailure`
- Consumes (from Task 2): `AuditStore`.
- Produces (ledger §9.4 verbatim):
  - ```ts
    export type Session = { tenant: string; draft: StyleSpec; candidate?: CandidateTheme; pendingSpec?: StyleSpec; published: string | null };
    export type TurnResult =
      | { kind: "diff"; diff: FieldDiff[]; candidate: CandidateTheme; pendingSpec: StyleSpec }
      | { kind: "no_change" }
      | { kind: "rejected"; failures: (WallFailure | VerifyFailure)[] };
    export function runTurn(session: Session, delta: unknown, manifest: AppManifest): TurnResult;
    export function acknowledge(session: Session): Session;
    export function resetToPublished(session: Session, audit: AuditStore): Promise<Session>;
    export function resetToAppDefault(session: Session): Session;
    export const APP_DEFAULT_SPEC: StyleSpec;
    ```

> **Ledger reconciliation note for the executor:** the ledger signature is
> `runTurn(session, delta: StyleSpec, manifest)`, but §1.2 and §4.4 require the raw Designer JSON to
> cross the wall *inside* the turn (`parseSpec` is step 3 of the turn). This plan takes the wall's
> input type `unknown` for `delta` so `runTurn` owns `parseSpec` — the wall lives in the turn, which
> is the spec's intent. The MockAgent (Task 9) and e2e (Task 10) pass raw JSON; if a caller already
> has a parsed `StyleSpec` it is still `unknown`-assignable. This is the one ledger widening; flag it
> when implementing.

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/authoring/session.test.ts`. It builds a tiny in-test `SHADCN_CAN`-shaped manifest by importing the real fixture, exercising all three outcomes + acknowledgment-advances-draft + reset:

  ```ts
  import { describe, it, expect } from "vitest";
  import { SHADCN_CAN, type StyleSpec } from "@invariance/theming";
  import { InMemoryAuditStore, type AuditRow } from "../../../src/theming/publish/stores.js";
  import {
    runTurn,
    acknowledge,
    resetToPublished,
    resetToAppDefault,
    APP_DEFAULT_SPEC,
    type Session,
  } from "../../../src/theming/authoring/session.js";

  const manifest = SHADCN_CAN;
  const fresh = (): Session => ({ tenant: "acme", draft: APP_DEFAULT_SPEC, published: null });

  describe("runTurn — three outcomes", () => {
    it("a real visual delta returns kind:'diff' with a candidate + pendingSpec, draft UNCHANGED", () => {
      const s = fresh();
      const res = runTurn(s, { radius: 16 }, manifest);
      expect(res.kind).toBe("diff");
      if (res.kind !== "diff") throw new Error("expected diff");
      expect(res.diff.length).toBeGreaterThan(0);
      expect(res.candidate).toBeDefined();
      expect(res.pendingSpec).toEqual({ radius: 16 });
      // unacknowledged turn does NOT advance the draft
      expect(s.draft).toEqual(APP_DEFAULT_SPEC);
    });

    it("a no-op delta (same as current draft) returns kind:'no_change'", () => {
      const s = fresh(); // draft is app default = empty spec
      const res = runTurn(s, {}, manifest); // empty delta ⇒ no change
      expect(res.kind).toBe("no_change");
    });

    it("a wall-rejected delta returns kind:'rejected' with failures, draft UNTOUCHED", () => {
      const s = fresh();
      const res = runTurn(s, { bogusKey: 1 }, manifest); // unknown key ⇒ closed-schema rejection
      expect(res.kind).toBe("rejected");
      if (res.kind !== "rejected") throw new Error("expected rejected");
      expect(res.failures.length).toBeGreaterThan(0);
      expect(s.draft).toEqual(APP_DEFAULT_SPEC);
    });
  });

  describe("acknowledge — commits the candidate into the draft", () => {
    it("advances draft to pendingSpec and clears candidate/pendingSpec", () => {
      const s = fresh();
      const res = runTurn(s, { radius: 16 }, manifest);
      if (res.kind !== "diff") throw new Error("expected diff");
      const staged: Session = { ...s, candidate: res.candidate, pendingSpec: res.pendingSpec };
      const next = acknowledge(staged);
      expect(next.draft).toEqual({ radius: 16 });
      expect(next.candidate).toBeUndefined();
      expect(next.pendingSpec).toBeUndefined();
    });

    it("accumulates acknowledged deltas across turns (composite draft)", () => {
      let s = fresh();
      const r1 = runTurn(s, { radius: 16 }, manifest);
      if (r1.kind !== "diff") throw new Error("expected diff");
      s = acknowledge({ ...s, candidate: r1.candidate, pendingSpec: r1.pendingSpec });
      const r2 = runTurn(s, { density: "compact" }, manifest);
      if (r2.kind !== "diff") throw new Error("expected diff");
      s = acknowledge({ ...s, candidate: r2.candidate, pendingSpec: r2.pendingSpec });
      expect(s.draft).toEqual({ radius: 16, density: "compact" });
    });

    it("throws if there is no pending candidate to acknowledge", () => {
      expect(() => acknowledge(fresh())).toThrow(/no pending/i);
    });
  });

  describe("reset paths", () => {
    it("resetToAppDefault sets the draft to the empty spec and clears pending state", () => {
      const s: Session = { tenant: "acme", draft: { radius: 16 }, candidate: undefined, pendingSpec: { radius: 16 }, published: "h1" };
      const next = resetToAppDefault(s);
      expect(next.draft).toEqual(APP_DEFAULT_SPEC);
      expect(next.pendingSpec).toBeUndefined();
    });

    it("resetToPublished loads the StyleSpec stored with the published hash", async () => {
      const audit = new InMemoryAuditStore();
      const publishedSpec: StyleSpec = { radius: 16, density: "compact" };
      const row: AuditRow = {
        tenant: "acme", hash: "h1", prompt: "x", styleSpec: publishedSpec,
        verifierReport: { ok: true }, actor: "admin", timestamp: "2026-06-18T00:00:00.000Z",
        vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1",
      };
      await audit.recordAudit(row);
      const s: Session = { tenant: "acme", draft: { radius: 4 }, published: "h1" };
      const next = await resetToPublished(s, audit);
      expect(next.draft).toEqual(publishedSpec);
    });

    it("resetToPublished with published=null falls back to app default", async () => {
      const audit = new InMemoryAuditStore();
      const s: Session = { tenant: "acme", draft: { radius: 4 }, published: null };
      const next = await resetToPublished(s, audit);
      expect(next.draft).toEqual(APP_DEFAULT_SPEC);
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- session
  ```

  Expected failure: `Cannot find module '../../../src/theming/authoring/session.js'`.

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/authoring/session.ts`:

  ```ts
  import {
    parseSpec,
    mergeDelta,
    canonicalize,
    diffSpecs,
    compile,
    verify,
    type StyleSpec,
    type AppManifest,
    type CandidateTheme,
    type FieldDiff,
    type WallFailure,
    type VerifyFailure,
  } from "@invariance/theming";
  import type { AuditStore } from "../publish/stores.js";

  // The app default = the empty (canonicalized) spec ≡ "absence = app default everywhere" (§4.2).
  export const APP_DEFAULT_SPEC: StyleSpec = canonicalize({});

  export type Session = {
    tenant: string;
    draft: StyleSpec; // last ACKNOWLEDGED state (null-free, canonicalized); accumulator of acknowledged deltas
    candidate?: CandidateTheme; // pending (unacknowledged) compiled candidate for the current turn
    pendingSpec?: StyleSpec; // merged spec underlying `candidate`, awaiting acknowledgment
    published: string | null; // hash end users see (null = nothing published yet)
  };

  export type TurnResult =
    | { kind: "diff"; diff: FieldDiff[]; candidate: CandidateTheme; pendingSpec: StyleSpec } // non-empty diff
    | { kind: "no_change" } // empty diff: "No visual change from that"
    | { kind: "rejected"; failures: (WallFailure | VerifyFailure)[] }; // wall/verifier reject; draft UNTOUCHED

  // Each turn: parse delta → merge onto draft → compile → verify → produce one of three outcomes.
  // `delta` is raw (unknown) so the WALL (parseSpec) lives inside the turn (§1.2 step 3).
  export function runTurn(session: Session, delta: unknown, manifest: AppManifest): TurnResult {
    // 3) the wall — parse-don't-validate. Failure ⇒ reject, draft untouched.
    const parsed = parseSpec(delta, manifest);
    if (!parsed.ok) {
      return { kind: "rejected", failures: parsed.failures };
    }
    // 4) merge (pure) → the full next draft (canonicalized, null-free).
    const pendingSpec = mergeDelta(session.draft, parsed.spec);
    // empty diff = no visual change (structural after canonicalize).
    const diff = diffSpecs(session.draft, pendingSpec, manifest);
    if (diff.length === 0) {
      return { kind: "no_change" };
    }
    // 5) compile (pure) + 6) verify (the gate). Verifier reject ⇒ draft untouched.
    const candidate = compile(pendingSpec, manifest);
    const verdict = verify(candidate, manifest);
    if (!verdict.ok) {
      return { kind: "rejected", failures: verdict.failures };
    }
    return { kind: "diff", diff, candidate, pendingSpec };
  }

  // Acknowledgment commits the pending candidate into the draft (the prerequisite for publish, §4.4).
  export function acknowledge(session: Session): Session {
    if (session.pendingSpec === undefined) {
      throw new Error("acknowledge: no pending candidate to commit");
    }
    return {
      tenant: session.tenant,
      draft: session.pendingSpec,
      candidate: undefined,
      pendingSpec: undefined,
      published: session.published,
    };
  }

  // Reset (§4.4): draft ← loadPublishedSpec(published) OR draft ← appDefault when nothing published.
  export async function resetToPublished(session: Session, audit: AuditStore): Promise<Session> {
    if (session.published === null) {
      return resetToAppDefault(session);
    }
    const record = await audit.getPublishedSpec(session.tenant, session.published);
    const draft = record ? canonicalize(record.styleSpec) : APP_DEFAULT_SPEC;
    return { tenant: session.tenant, draft, candidate: undefined, pendingSpec: undefined, published: session.published };
  }

  export function resetToAppDefault(session: Session): Session {
    return { tenant: session.tenant, draft: APP_DEFAULT_SPEC, candidate: undefined, pendingSpec: undefined, published: session.published };
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- session
  ```

  Expected: PASS (three outcomes, acknowledgment advances/accumulates, reset paths).

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/authoring/session.ts apps/control-plane/test/theming/authoring/session.test.ts && git commit -m "feat(theming): authoring session state machine (runTurn/acknowledge/reset)"
  ```

---

### Task 9: MockAgent (canned classifications + sparse StyleSpec JSON)

**Files:**
- Create: `apps/control-plane/src/theming/authoring/mock-agent.ts`
- Test: `apps/control-plane/test/theming/authoring/mock-agent.test.ts` (focused unit test; the full loop is additionally exercised in the Task 10 e2e).

**Interfaces:**
- Consumes (from Task 6 `agent-types.ts`): `Agent`, `GatekeeperInput`, `GatekeeperResult`, `DesignerInput`, `DesignerResult`, `GateClassification`.
- Produces (ledger §9.5 verbatim):
  - ```ts
    export class MockAgent implements Agent {
      constructor(canned: Array<{ classification: GateClassification; spec: unknown }>);
      gatekeep(input: GatekeeperInput): Promise<GatekeeperResult>;
      design(input: DesignerInput): Promise<DesignerResult>;
    }
    ```
  - Each `gatekeep`/`design` call consumes the next canned entry in order; `design` returns `{ specJson: entry.spec }` (raw, to cross the wall). Throws if the script is exhausted.

- [ ] **Step 1: Write the failing test** — create `apps/control-plane/test/theming/authoring/mock-agent.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { SHADCN_CAN } from "@invariance/theming";
  import { buildEnvelope } from "../../../src/theming/authoring/agent-types.js";
  import { MockAgent } from "../../../src/theming/authoring/mock-agent.js";

  const envelope = buildEnvelope(SHADCN_CAN);

  describe("MockAgent", () => {
    it("returns canned classifications and sparse spec JSON in order", async () => {
      const agent = new MockAgent([
        { classification: "in_scope_styling", spec: { radius: 16 } },
        { classification: "out_of_scope", spec: {} },
      ]);

      const g1 = await agent.gatekeep({ prompt: "rounder", envelope });
      expect(g1.classification).toBe("in_scope_styling");
      const d1 = await agent.design({ prompt: "rounder", draft: {}, envelope });
      expect(d1.specJson).toEqual({ radius: 16 });

      const g2 = await agent.gatekeep({ prompt: "delete my account", envelope });
      expect(g2.classification).toBe("out_of_scope");
    });

    it("throws when the canned script is exhausted", async () => {
      const agent = new MockAgent([{ classification: "in_scope_styling", spec: { radius: 8 } }]);
      await agent.gatekeep({ prompt: "x", envelope });
      await agent.design({ prompt: "x", draft: {}, envelope });
      await expect(agent.gatekeep({ prompt: "y", envelope })).rejects.toThrow(/exhausted/i);
    });
  });
  ```

- [ ] **Step 2: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- mock-agent
  ```

  Expected failure: `Cannot find module '../../../src/theming/authoring/mock-agent.js'`.

- [ ] **Step 3: Minimal implementation** — create `apps/control-plane/src/theming/authoring/mock-agent.ts`:

  ```ts
  import type {
    Agent,
    GatekeeperInput,
    GatekeeperResult,
    DesignerInput,
    DesignerResult,
    GateClassification,
  } from "./agent-types.js";

  type CannedTurn = { classification: GateClassification; spec: unknown };

  // The zero-LLM test harness for the whole merge → compile → verify → publish half (§8).
  // Each gatekeep + design pair consumes one canned turn, in order.
  export class MockAgent implements Agent {
    private readonly canned: CannedTurn[];
    private cursor = 0;

    constructor(canned: CannedTurn[]) {
      this.canned = canned;
    }

    private next(): CannedTurn {
      const turn = this.canned[this.cursor];
      if (turn === undefined) {
        throw new Error("MockAgent: canned script exhausted");
      }
      return turn;
    }

    async gatekeep(_input: GatekeeperInput): Promise<GatekeeperResult> {
      const turn = this.next();
      return { classification: turn.classification };
    }

    async design(_input: DesignerInput): Promise<DesignerResult> {
      const turn = this.next();
      this.cursor += 1; // advance after the design call completes the turn
      return { specJson: turn.spec };
    }
  }
  ```

- [ ] **Step 4: Run tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- mock-agent
  ```

  Expected: PASS (canned-in-order + exhaustion throw).

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/authoring/mock-agent.ts apps/control-plane/test/theming/authoring/mock-agent.test.ts && git commit -m "feat(theming): MockAgent — canned classifications + sparse StyleSpec JSON"
  ```

---

### Task 10: Authoring module barrel + zero-LLM end-to-end loop

**Files:**
- Create: `apps/control-plane/src/theming/authoring/index.ts`
- Test: `apps/control-plane/test/theming/authoring/e2e.test.ts`

**Interfaces:**
- Consumes: Tasks 6–9 modules + Tasks 2–4 publish modules + `@invariance/theming` (`buildArtifact`, `compile`, `verify`, `SHADCN_CAN`, `parseSpec`).
- Produces:
  - `apps/control-plane/src/theming/authoring/index.ts`:
    ```ts
    export * from "./agent-types.js";
    export * from "./failure-ux.js";
    export * from "./session.js";
    export * from "./mock-agent.js";
    ```
  - A single e2e test proving the whole governance half runs with zero LLM: MockAgent → gatekeep → design → wall → merge → compile → verify → acknowledge → publish → reset reads the stored spec back.

- [ ] **Step 1: Create the authoring barrel** — create `apps/control-plane/src/theming/authoring/index.ts`:

  ```ts
  export * from "./agent-types.js";
  export * from "./failure-ux.js";
  export * from "./session.js";
  export * from "./mock-agent.js";
  ```

- [ ] **Step 2: Write the failing e2e test** — create `apps/control-plane/test/theming/authoring/e2e.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import {
    SHADCN_CAN,
    buildArtifact,
    compile,
    verify,
    parseSpec,
  } from "@invariance/theming";
  import {
    InMemoryBlobStore,
    InMemoryPointerStore,
    InMemoryAuditStore,
  } from "../../../src/theming/publish/stores.js";
  import { publish } from "../../../src/theming/publish/publisher.js";
  import {
    runTurn,
    acknowledge,
    resetToPublished,
    APP_DEFAULT_SPEC,
    type Session,
  } from "../../../src/theming/authoring/session.js";
  import { MockAgent, buildEnvelope, type GateClassification } from "../../../src/theming/authoring/index.js";

  const manifest = SHADCN_CAN;
  const fixedNow = () => "2026-06-18T12:00:00.000Z";

  describe("zero-LLM end-to-end loop", () => {
    it("MockAgent → wall → merge → compile → verify → acknowledge → publish → reset", async () => {
      const envelope = buildEnvelope(manifest);
      const agent = new MockAgent([{ classification: "in_scope_styling", spec: { radius: 16 } }]);

      // Stage 1 + 2: the non-deterministic stages (mocked), BEFORE the wall.
      const gate = await agent.gatekeep({ prompt: "make it rounder", envelope });
      const inScope: GateClassification = "in_scope_styling";
      expect(gate.classification).toBe(inScope);
      const designed = await agent.design({ prompt: "make it rounder", draft: APP_DEFAULT_SPEC, envelope });

      // The deterministic half: the turn owns the wall (parseSpec) internally.
      let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
      const turn = runTurn(session, designed.specJson, manifest);
      expect(turn.kind).toBe("diff");
      if (turn.kind !== "diff") throw new Error("expected diff");

      // Acknowledge commits the candidate into the draft.
      session = acknowledge({ ...session, candidate: turn.candidate, pendingSpec: turn.pendingSpec });
      expect(session.draft).toEqual({ radius: 16 });

      // Publish: re-run the pure core on the acknowledged draft, then write through the stores.
      const parsedDraft = parseSpec(session.draft, manifest);
      if (!parsedDraft.ok) throw new Error("acknowledged draft must parse");
      const candidate = compile(parsedDraft.spec, manifest);
      const verdict = verify(candidate, manifest);
      expect(verdict.ok).toBe(true);
      const artifact = buildArtifact(candidate, manifest, verdict);

      const stores = {
        blob: new InMemoryBlobStore(),
        pointer: new InMemoryPointerStore(),
        audit: new InMemoryAuditStore(),
      };
      const result = await publish(
        {
          tenant: "acme",
          artifact,
          styleSpec: session.draft,
          verifierReport: verdict,
          prompt: "make it rounder",
          actor: "admin@acme",
          vocabVersion: manifest.vocabVersion,
          profileVersion: manifest.profileVersion,
        },
        stores,
        { now: fixedNow },
      );

      // End users now see this hash, live.
      expect((await stores.pointer.getPointer("acme"))).toEqual({
        hash: result.hash,
        status: "live",
        updatedAt: "2026-06-18T12:00:00.000Z",
      });
      // The artifact is retrievable by hash.
      expect(await stores.blob.getArtifact(result.hash)).toEqual(artifact);

      // Reset reads the STORED StyleSpec back (functional read path), not a decompile.
      session.published = result.hash;
      const reset = await resetToPublished(session, stores.audit);
      expect(reset.draft).toEqual({ radius: 16 });
    });

    it("a rejected turn never advances the draft and produces no publish", () => {
      const session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
      const turn = runTurn(session, { notARealField: true }, manifest);
      expect(turn.kind).toBe("rejected");
      expect(session.draft).toEqual(APP_DEFAULT_SPEC);
    });
  });
  ```

- [ ] **Step 3: Run it, verify it fails** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test -- e2e
  ```

  Expected failure: `Cannot find module '../../../src/theming/authoring/index.js'` (until the barrel exists) — or, if the barrel exists, an assertion failure because the e2e wiring is exercised for the first time. Either way: not green.

- [ ] **Step 4: Run all theming tests, verify pass** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test
  ```

  Expected: PASS — all of `stores`, `publisher`, `retention`, `failure-ux`, `session`, `mock-agent`, and `e2e` green.

- [ ] **Step 5: Commit** —

  ```bash
  cd /Users/anuraag/invariance && git add apps/control-plane/src/theming/authoring/index.ts apps/control-plane/test/theming/authoring/e2e.test.ts && git commit -m "feat(theming): authoring barrel + zero-LLM end-to-end loop test"
  ```

---

### Task 11: Typecheck + full-suite green gate

**Files:**
- No new files; verification + any fixups.

**Interfaces:**
- Consumes: everything above.
- Produces: a clean `typecheck` + full `test` run for `@invariance/control-plane`.

- [ ] **Step 1: Typecheck the package** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane typecheck
  ```

  Expected: no errors. If `@invariance/theming` exports a name this plan imported under a slightly different identifier, reconcile against the ledger (§11 dependency table) — the ledger names are canonical.

- [ ] **Step 2: Run the full package test suite** —

  ```bash
  cd /Users/anuraag/invariance && pnpm -F @invariance/control-plane test
  ```

  Expected: PASS for all 7 test files (`stores`, `publisher`, `retention`, `failure-ux`, `session`, `mock-agent`, `e2e`).

- [ ] **Step 3: Run the repo-wide turbo test to confirm no regression** —

  ```bash
  cd /Users/anuraag/invariance && pnpm test
  ```

  Expected: the control-plane theming tests pass alongside the rest of the suite; no package broken by the new workspace dep.

- [ ] **Step 4: Commit any fixups** — only if Steps 1–3 required edits:

  ```bash
  cd /Users/anuraag/invariance && git add -A && git commit -m "chore(theming): typecheck + full-suite green for publish/storage/session"
  ```
