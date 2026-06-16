# Invariance — Onboarding & the Governed-Theming Pipeline

> **Status: current design, not finalized.** A forward-looking product +
> architecture design, not a description of what's built today.
>
> **Supersedes** the retired archetype + build-time-applier onboarding plan
> (removed). That model edited the *build output* to inject `<m.slot>` wrappers
> and remapped `tailwind.config`; this one does **neither**. The pivot: a B2B SaaS
> vendor will not let us touch their source, and "users restyling your app" isn't
> a benefit unless the *company* gets one. So this design is built around two hard
> constraints — **the benefit lands on the vendor**, and **we never edit their
> source**.
>
> Downstream, the live customization pipeline is documented in
> [`INVARIANTS-PIPELINE.md`](./INVARIANTS-PIPELINE.md). This doc is **upstream**:
> how a vendor's app reaches the state that pipeline assumes — by the lightest
> possible touch. Where this reuses existing machinery (the design compiler, the
> OKLCH role engine, the per-subject theme store) that's called out; new pieces
> are called out too.

---

## 1. Positioning — what this is, who buys, who customizes

**One-liner.** Invariance lets a **B2B SaaS vendor** offer *governed,
natural-language customization* of their product. The vendor declares the
invariants — brand, accessibility, data integrity — and their customers reshape
the product within those bounds.

**The benefit that makes a company pay.** Every SaaS vendor carries a backlog of
*"can we theme this per customer / match our enterprise client's brand / make X
configurable"* requests they reject because building per-customer theming is
expensive and letting customers change things is risky. **Invariance turns that
backlog into a self-serve, AI-driven, developer-governed capability — without
bespoke settings UIs and without losing control.** We sell the *guardrails*, not
the prompt: *"say yes to customization without the risk."*

**Who customizes (in target order):**

- **North star — tenant admins, self-serve.** A customer org's admin types
  *"make it match our brand — navy + gold, rounded, calmer corners"* and gets a
  governed per-tenant theme applied to all of that org's users, guaranteed
  on-brand and accessible.
- **Landing beachhead — the vendor's own implementation / CS team.** The same
  tool, used *internally* to stand up per-customer themes in minutes instead of a
  services engagement. No customer-facing surface, immediate ROI (kills
  professional-services cost), lowest trust barrier.
- *(Individual end-user personalization rides the same machinery but is the
  weaker, consumer-flavored case — not the wedge.)*

**The ICP qualifier (a feature, not a bug).** The non-invasive mechanism
(§3) works cleanly only for apps that theme through **CSS variables / a
design-token system** — Tailwind v4 (CSS vars by default), shadcn/ui, MUI/Chakra
theme providers, any `--var`-based setup. Apps that bake raw hex into inline
styles or Tailwind-v3 palette classes (`bg-blue-600` compiled to a literal) have
no variable to redefine, and robust no-edit theming there is the fragile
"accessibility overlay" trap we explicitly avoid. So our qualifying ICP is
**"themes through tokens/variables"** — most modern SaaS, and exactly the kind of
vendor that wants per-tenant theming. We qualify on it in the first two minutes of
onboarding (§4 reports coverage honestly).

---

## 2. Scope — three tiers, ship the first

| Tier | What a customer can change | Integration cost | Status |
|---|---|---|---|
| **A — Governed theming** | Per-tenant brand theme: colors, typography, density, radius, light/dark | One snippet + token adoption; **no source edits** | **MVP / the wedge** |
| **B — Governed layout / structure** | Rearrange / swap / edit larger regions | **Open** — structural change is hard to do without touching structure; mechanism deferred | Roadmap |
| **C — Governed logic** | API request/response behavior at the seam | Server middleware + signed bundles + sandbox | Enterprise, deferred |

**This doc designs Tier A in full.** Tier B and C are deliberately out of scope —
see §12.

**Non-goals (Tier A):** no JSX wrapping, no per-component edits, no build-output
rewriting, no `tailwind.config` remap, no API-route wrapping, no signed bundles,
no server sandbox.

---

## 3. The core mechanism — theme by redefining the app's own variables

The entire Tier A mechanism collapses to one sentence:

> **We don't theme by editing anything; we theme by redefining the CSS variables
> the app already uses.**

The vendor's components keep doing `var(--primary)`, `var(--background)`, etc. The
SDK injects a stylesheet that **redefines those variables** with values our
compiler produced, scoped to the current tenant. The cascade does the rest — we
use it instead of fighting it.

```
Vendor component (untouched):     class="bg-[var(--primary)]"
App's own default :root:          --primary: #4f46e5;
Invariance injects (per tenant):  --primary: #1e3a8a;     ← redefinition wins
Result:                           the button is navy — zero source edits
```

**Why this is inherently safe (fail-open by construction).** If Invariance does
nothing — control plane down, fetch fails, theme rejected — *no variables are
redefined* and the app renders with its own defaults. There is no broken state to
fall into; the floor is always the vendor's base design.

**Why themes don't need cryptographic signing.** Unlike Tier C (executable hook
code, which *must* be signed and sandboxed), a Tier A theme is a set of
declarative CSS-variable values. The worst a tampered theme can do is change
colors *within the variable space* — it cannot escape into script. Integrity is
enforced two other ways: (a) the **compiler + verifier** bind the invariants at
authoring time (contrast floor, locked vars, chroma cap — §8), and (b) the client
**re-verifies the theme against the vendor's invariants on load** and drops to
base if it fails. Soft integrity, fail-closed-to-base. *(Signing stays available;
it's required for Tier C.)*

---

## 4. The reworked scanner — variable discovery → role classification

The retired scanner did AST surgery on a repo (parse JSX → find sections → wrap in
`m.slot` → rewrite values → inject SSR). That half was invasive and fragile. The
reframed scanner is dramatically smaller:

> **Discover the app's theme variables and classify each into a design role,
> producing a `variable → role` map.**

That's the whole scanner. It **reuses the existing OKLCH clustering /
role-assignment engine** (`packages/design/src/compiler/cluster.ts`) — just
pointed at *declared variables* instead of *observed JSX colors*.

**Step 1 — discover variables.** Two modes, runtime-first:

- **Runtime discovery (preferred, zero repo access).** The Connect snippet reads
  the live custom properties off the running app —
  `getComputedStyle(document.documentElement)` for every `--*`, plus a walk of
  stylesheet rules for variables defined at non-root scopes. We never see their
  source, only the running result.
- **Static discovery (optional augment).** Point a scanner at the repo / built CSS
  + Tailwind theme config for completeness and to catch variables not present on
  first paint. Reuses today's `scanRepo` (`packages/cli/src/scan.ts`) + the
  ts-morph pass (`packages/cli/src/analysis/*`).

**Step 2 — classify into roles.** Each discovered variable's *value* is normalized
to OKLCH and assigned a design role by the clustering engine: lightness → surface
vs. text; chroma ≥ 0.07 + usage → accent; etc. Non-color roles (radius, font,
density) are matched from their own variables. Output:

```jsonc
// variable → role map  (the key new artifact, stored in the manifest / design-config)
{
  "--background":        { "role": "surface-0",      "scope": ":root", "locked": false },
  "--card":             { "role": "surface-1",      "scope": ":root", "locked": false },
  "--foreground":       { "role": "text-primary",   "scope": ":root", "locked": false },
  "--muted-foreground": { "role": "text-secondary", "scope": ":root", "locked": false },
  "--primary":          { "role": "accent",         "scope": ":root", "locked": true  },  // brand
  "--border":           { "role": "border",         "scope": ":root", "locked": false },
  "--radius":           { "role": "radius-md",      "scope": ":root", "locked": false }
}
```

Plus a **baseline `StyleSpec`** inferred from the current values, so the tenant's
"current" theme is just their existing look and prompts edit relative to it.

**Step 3 — coverage report (honest onboarding output).** The scanner reports what
fraction of the app's color surface is variable-driven: *"we can drive 82% of your
color surface through 14 variables; these 6 components hardcode values and won't
theme."* This is how the vendor (and we) confirm ICP fit **before** committing.

The role-token vocabulary itself already exists
(`packages/design-schema/src/role-tokens.ts`; 13 of the roles are color). The
scanner's job is only to bind *the vendor's variables* to those roles — no JSX
traversal, no section identification, no source rewriting.

---

## 5. Integration surface — the whole footprint

```html
<!-- The entire integration: one snippet in the app shell -->
<script src="https://cdn.invariance.dev/sdk.js"
        data-app="acme-saas"
        data-tenant="acme-corp"></script>      <!-- tenant id from the vendor's own auth -->
```

- For React/Next, the equivalent is a single root provider
  (`<InvarianceProvider appId tenantId>`) added once at the app root — the only
  touch point, and it edits no existing component.
- `data-tenant` (or a `getTenant()` resolver) is whatever the vendor already
  knows: subdomain, JWT claim, org id. Invariance never owns identity.

What the snippet does at runtime:
1. Resolves the tenant.
2. Fetches that tenant's active theme (§7).
3. Injects `<style id="inv-theme">` redefining the mapped variables.
4. Mounts the prompt widget (if the vendor enables the customer-facing surface).

**No-flash SSR is an optional, still-additive upgrade**, not required for MVP: the
vendor can render the tenant's variables into a `<style>` in `<head>` server-side
(a head injection or middleware — additive, no component edit), or rely on the
SDK's cookie/localStorage cache to minimize first-paint flash.

---

## 6. Onboarding flow — vendor-side, ~5 minutes

```
1. ADD SNIPPET            one <script> (or root provider) with appId + tenant resolver
        │
2. CONNECT  ──────────►   scanner reads live --* variables (runtime discovery)
        │                 OKLCH engine classifies each into a role
        │                 → proposes  variable→role map  +  baseline StyleSpec
        │                 → coverage report ("82% of color surface drivable")
        │
3. CONFIRM + GOVERN ──►   vendor dashboard (the Console, reframed):
        │                  • fix any mis-mapped variable (--primary IS the accent ✓)
        │                  • lock brand variables (--primary stays our hue)
        │                  • set the contrast floor (WCAG AA guaranteed)
        │                  • choose allowed modes (light / dark / both)
        │
4. PUBLISH  ──────────►   manifest + design-config (variable→role map + invariants)
        │                 → control plane  (app-level, all tenants)
        │
   READY: tenants (or the vendor's team) type prompts and get governed,
          on-brand, accessible per-tenant themes — fail-open to base.
```

The scanner *proposes*; the vendor *confirms*. Nothing the LLM says is
load-bearing for safety.

---

## 7. Multi-tenant architecture

Tier A reuses the design plane's data path and **needs none of the
business-logic plane's signing/sandbox machinery** — making it light at scale.

**Subject = tenant.** The existing per-subject theme store
(`GET/PUT /v1/apps/:appId/themes`, with `/history` + `/rollback`) keys themes by
subject; we use **tenant id as the subject**. Multi-tenancy is native, not bolted
on. (Per-user personalization, if enabled, is just a finer-grained subject.)

**App-level invariants, declared once.** The vendor's invariants — the
`variable→role` map, locked brand variables, contrast floor, allowed modes — live
in the **manifest / design-config** (`GET/PUT /v1/apps/:appId/design-config`) and
apply to *every* tenant. One governance surface; N tenant themes beneath it.

**What happens when a tenant admin types a prompt** (reuses the live design
pipeline in [`INVARIANTS-PIPELINE.md`](./INVARIANTS-PIPELINE.md) §2):

```
prompt ("match our brand: navy + gold, calmer")
   │
   ▼  control-plane authoring (design path)
Gatekeeper classify  →  Designer LLM → StyleSpec  →  compiler → role token VALUES
   │                                                          │
   │                            map role → vendor's variable via variable→role map
   ▼
DESIGN VERIFY (deterministic): contrast floor met? locked brand vars untouched?
   accent chroma ≤ cap? allowed mode?      ── fail → retry Designer (never relax)
   │ pass
   ▼
store as this TENANT's new theme version (per-subject store, versioned, rollbackable)
   │
   ▼  client SDK for that tenant's users
inject <style id="inv-theme"> redefining the mapped variables  →  paint
   (any fetch/verify failure → inject nothing → vendor's base design)
```

The invariants are enforced by the **compiler + verifier deterministically** — the
LLM only proposes the `StyleSpec`; it can't move what's locked. Same "LLM in the
loop, never in the gate" guarantee as the rest of the system.

**Distribution & scale.** Theme JSON is small, immutable per version, and
CDN-cacheable; the per-tenant pointer is a tiny short-TTL lookup. No production
request transits Invariance; the control plane is touched only for authoring +
fetching the pointer. Control-plane downtime degrades to the last-cached (or base)
theme — never an outage for the vendor's app.

**Drift handling (existing lazy-migration model).** When the vendor changes their
base design or tightens an invariant, tenant themes **re-verify against the new
invariants on next load** and recompile-from-`StyleSpec` or drop to base — no
mass-rebuild, no broken tenants.

---

## 8. The governance model — what the vendor declares

All declared in the dashboard, stored in the manifest/design-config:

- **`variable → role` map** — which of *their* variables each design role drives
  (§4). Vendors who adopt our `--inv-*` names directly get an identity map.
- **Locked variables** — brand-critical variables customization may never change.
  Enforced like `locked_tokens` today: written last in the compiler, re-checked
  byte-identical in the verifier.
- **Contrast floor** — a WCAG minimum the compiler can only *raise*, never lower,
  so every tenant theme is guaranteed accessible.
- **Allowed modes** — light / dark / both.
- **Accent chroma cap** — keeps customer themes from going garish/illegible.

These map directly onto the design plane's existing enforcement (compiler
`packages/design/src/compiler/compile.ts`, verifier
`packages/design/src/verify/compiled-tests.ts`). Tier A is largely a *reframing
and packaging* of machinery that already enforces these, plus the new
variable-mapping indirection.

---

## 9. End-to-end picture

```
   VENDOR (once)                          INVARIANCE                    TENANT (ongoing)
   ────────────                           ──────────                    ────────────────
   add snippet ──────────────────────────►  SDK
   Connect ──► scanner: read live --vars
              classify → variable→role map
              + baseline StyleSpec + coverage
   confirm map + set invariants ─────────►  manifest / design-config
   publish                                  (app-level, all tenants)
                                                  │
                                                  │            tenant admin prompt
                                                  │◄──────────────────────────────
                                            authoring: Gatekeeper → Designer
                                            → StyleSpec → compiler → VERIFY
                                            (contrast / locked / chroma / mode)
                                                  │ pass
                                            store tenant theme version
                                                  │
                                            SDK injects redefined variables ──────►  paint
                                            (fail → nothing → base design)           on-brand,
                                                                                     accessible,
                                                                                     governed
```

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **App doesn't theme via variables** (ICP miss) | Qualify in onboarding via the coverage report; if low, the app isn't a fit — don't force the overlay hack. |
| **Partial variable coverage** (some colors hardcoded) | Coverage report names the gaps *before* commit; themes drive the covered surface, the rest stays base (consistent fallback, not broken). |
| **Variables defined at component scope, not `:root`** | Scanner records each variable's scope; the applier writes at the matching scope (or a higher-specificity layer), not blindly at `:root`. |
| **Flash-of-default on first paint** (client-only apply) | Cookie/localStorage cache; optional SSR head-injection upgrade for no-flash. |
| **"Why not just DIY theming?"** | The moat is *governed* (invariant-verified, contrast-guaranteed, fail-open) + AI-prompt UX + per-tenant management — not raw variable swapping, which a vendor could build but not safely at scale across many tenants. |
| **Tenant theme drift on vendor redesign** | Existing lazy re-validation: re-verify on next load, recompile-or-drop. |

---

## 11. What we reuse vs. build new

**Reuse (already exists):**
- OKLCH clustering / role assignment — `packages/design/src/compiler/cluster.ts`.
- Theme compiler (`StyleSpec` → role token values, contrast solve, locked tokens)
  — `packages/design/src/compiler/compile.ts`.
- Design verifier (contrast floor, locked, chroma cap) —
  `packages/design/src/verify/compiled-tests.ts`.
- Per-subject theme store + versioning + rollback —
  `GET/PUT /v1/apps/:appId/themes`.
- Design-config (look-invariants) — `GET/PUT /v1/apps/:appId/design-config`.
- Client apply via `setProperty` — `packages/design/src/runtime/apply.ts`.
- Authoring design path (Gatekeeper → Designer → compile → verify).

**Build new:**
- **Runtime variable discovery** (read live `--*` from the running app).
- **`variable → role` map** as a first-class manifest artifact + the role→variable
  indirection in the applier (today the applier writes `--inv-*` names; it must
  write the *vendor's* names via the map).
- **Coverage report** in onboarding.
- **The Connect / governance dashboard** flow (reframed Console).
- **The SDK snippet** (tenant resolution + theme injection + widget mount) as a
  drop-in, framework-light artifact.

---

## 12. Out of scope / deferred

- **Pricing & packaging** — deliberately deferred (decide later).
- **Tier B (structural / layout customization)** — genuinely harder to do
  non-invasively than theming. The build-time-applier idea was explored and **set
  aside** (too complex/invasive for the wedge); a non-invasive mechanism is an
  open question, deferred until Tier A is proven.
- **Tier C (business-logic plane)** — the signed-bundle + sandbox path
  (`INVARIANTS-PIPELINE.md` §3); enterprise, deferred.
- **Static vs runtime discovery default** — runtime-first is proposed; confirm
  whether a static repo scan is offered at all for MVP.
- **Non-variable styling families** (CSS modules, styled-components, plain CSS) —
  out of ICP for now; possible adapters later.
