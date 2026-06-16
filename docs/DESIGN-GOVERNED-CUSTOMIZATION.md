# Invariance — Design: Governed Customization for B2B SaaS

> **Status: the active design we are building toward.** This is the canonical
> product + system design for Invariance's current direction. It supersedes the
> framing in [`DESIGN.md`](./DESIGN.md) (the v5 two-plane system design) as the
> *go-to-market* design, while **reusing most of that stack's machinery** — see
> §12. Two companion docs go deeper:
> - [`ONBOARDING-PIPELINE.md`](./ONBOARDING-PIPELINE.md) — the onboarding /
>   governed-theming pipeline in detail.
> - [`INVARIANTS-PIPELINE.md`](./INVARIANTS-PIPELINE.md) — the live
>   prompt→verify→apply pipeline (look + logic) as built.

---

## 1. Thesis — what it is, and why a company pays

**One-liner.** Invariance lets a **B2B SaaS vendor** offer *governed,
natural-language customization* of their product. The vendor declares the
invariants — brand, accessibility, data integrity — and their customers reshape
the product within those bounds.

**The problem we attack.** Every SaaS vendor carries a backlog of *"can we theme
this per customer / match our enterprise client's brand / make X configurable"*
requests. They reject most of them because building per-customer theming and
settings UIs is expensive, and letting customers change things is risky. The work
that does get done becomes professional-services cost and a maintenance tax.

**The benefit (it lands on the vendor, not just the end user).** Invariance turns
that backlog into a **self-serve, AI-driven, developer-governed capability** — no
bespoke settings panels, no loss of brand/data control, and if anything ever fails
it falls open to the base app. We sell the **guardrails**, not the prompt:
*"say yes to customization without the risk."* The vendor pays to stop building N
settings UIs, cut professional-services cost, and safely enable per-tenant
adaptation that drives retention and expansion.

**Why "let users restyle your app" is *not* the pitch.** For most companies that's
a *risk*, not a benefit — they spend heavily controlling their look. The value is
in *governed* customization the company can finally say yes to, because the
guardrails make it safe.

---

## 2. ICP & who customizes

**The buyer / champion:** product + platform engineering leadership at a B2B SaaS
vendor.

**The ICP qualifier (a feature, not a bug).** Our non-invasive mechanism (§5)
works cleanly only for apps that theme through **CSS variables / a design-token
system** — Tailwind v4 (CSS vars by default), shadcn/ui, MUI/Chakra theme
providers, any `--var`-based setup. Apps that bake raw hex into inline styles or
Tailwind-v3 palette classes (`bg-blue-600` compiled to a literal) have no variable
to redefine, and robust no-edit theming there is the fragile "accessibility
overlay" trap we avoid. So our qualifying ICP is **"themes through
tokens/variables"** — most modern SaaS — and onboarding *measures* this in the
first two minutes via a coverage report (§9a).

**Who actually types the prompts** — a north star with a safer beachhead:

- **North star — tenant admins, self-serve.** A customer org's admin types
  *"make it match our brand — navy + gold, rounded, calmer corners"* and gets a
  governed per-tenant theme applied to all of that org's users, guaranteed
  on-brand and accessible. This is the *"can you white-label / theme this per
  customer"* request every SaaS vendor already fields — delivered safely and
  instantly, without the vendor building a theming system.
- **Landing beachhead — the vendor's own implementation / CS team.** The same
  tool, used *internally* to stand up per-customer themes in minutes instead of a
  services engagement. No customer-facing surface, immediate ROI (kills PS cost),
  lowest trust barrier — a clean way to land before exposing prompts to tenants.
- *(Individual end-user personalization rides the same machinery but is the
  weaker, consumer-flavored case — not the wedge.)*

---

## 3. The honest integration promise — non-invasive, not "zero source"

"Zero source" is overselling, and overselling loses a technical buyer in the first
call. Touching *literally* nothing means runtime CSS injection against the
vendor's existing selectors — the fragile overlay approach that breaks on real
apps. The defensible, precise promise:

> **Non-invasive.** The vendor adds our SDK + a single root provider (or one
> `<script>`) and adopts our token layer — or we emit a mapping/Tailwind preset
> onto their existing scale. **We never wrap their components and never touch
> their API routes.** Light touch and robust — not literally zero.

---

## 4. Scope — three tiers, ship the first

| Tier | What a customer can change | Integration cost | Status |
|---|---|---|---|
| **A — Governed theming** | Per-tenant brand theme: colors, typography, density, radius, light/dark | One snippet/provider + token adoption; **no wrapping** | **MVP / the wedge** |
| **B — Governed layout / slots** | Rearrange / swap / edit *declared* regions, each bounded by a level | Visual walkthrough + **non-invasive slot map** + **build-time applier** (transforms build output; **source stays pristine**) | Roadmap (deferred) |
| **C — Governed logic** | API request/response behavior at the seam | Server middleware + signed bundles + sandbox | Enterprise (deferred) |

**This doc builds Tier A in full.** Tier B and C are deferred — but the prior
onboarding work isn't lost: the deterministic color→role engine powers Tier A's
inference, and the visual walkthrough + slot map become Tier B's surface when we
get there. Tier C *is* the existing business-logic plane
(`INVARIANTS-PIPELINE.md` §3).

**Tier A non-goals:** no JSX wrapping, no per-component edits, no build-output
rewriting, no API-route wrapping, no signed bundles, no server sandbox.

---

## 5. The core mechanism — theme by redefining the app's own variables

The entire Tier A mechanism is one sentence:

> **We don't theme by editing anything; we theme by redefining the CSS variables
> the app already uses.**

The vendor's components keep doing `var(--primary)`, `var(--background)`, etc. The
SDK injects a stylesheet that **redefines those variables** with values our
compiler produced, scoped to the current tenant. The cascade does the rest.

```
Vendor component (untouched):     class="bg-[var(--primary)]"
App's own default :root:          --primary: #4f46e5;
Invariance injects (per tenant):  --primary: #1e3a8a;     ← redefinition wins
Result:                           the button is navy — zero source edits
```

**Fail-open by construction.** If Invariance does nothing — control plane down,
fetch fails, theme rejected — *no variables are redefined* and the app renders
with its own defaults. There is no broken state to fall into; the floor is always
the vendor's base design.

**No cryptographic signing needed for themes.** A Tier A theme is declarative
CSS-variable values — it cannot escape into script. Integrity comes from (a) the
**compiler + verifier** binding invariants at authoring time, and (b) the client
**re-verifying against the vendor's invariants on load**, dropping to base on
failure. Soft integrity, fail-closed-to-base. (Signing is reserved for Tier C's
executable hooks.)

---

## 6. System architecture

Three parts, mirroring the existing control-plane / data-plane split — **no
production request transits Invariance.**

```
   VENDOR INFRA (data plane)                 INVARIANCE (control plane)
   ─────────────────────────                 ──────────────────────────
   ┌───────────────────────┐                 ┌──────────────────────────────┐
   │ Vendor's app          │   authoring     │ Authoring (design path)       │
   │  + Invariance SDK     │ ───prompt────▶  │  Gatekeeper→Designer→compile  │
   │   • resolve tenant    │                 │  →VERIFY (invariants)         │
   │   • fetch theme       │ ◀──pointer───   ├──────────────────────────────┤
   │   • inject variables  │   + theme json  │ Governance / Registry         │
   │   • prompt widget     │                 │  • AppManifest + design-config│
   └───────────────────────┘                 │    (variable→role map +       │
            ▲                                 │     invariants), per-app      │
            │ serves base app +               │  • per-TENANT theme store     │
            │ governed theme to               │    (versioned, rollback)      │
            │ that tenant's users             │  • kill-switch / flags         │
                                              ├──────────────────────────────┤
   ┌───────────────────────┐   connect/scan  │ Dashboard (Console, reframed) │
   │ Vendor product/CS team│ ◀──────────────▶│  • Connect + coverage report  │
   │  (governance + setup) │                 │  • mapping confirm + invariants│
   └───────────────────────┘                 │  • tenant theme browser + kill │
                                              ├──────────────────────────────┤
                                              │ Analytics (what tenants change)│
                                              └──────────────────────────────┘
```

- **Control plane (ours).** Authoring (the design pipeline — Gatekeeper → Designer
  → compiler → deterministic verify), governance/registry (the app-level manifest
  + design-config and the per-tenant theme store), kill-switch, analytics.
- **Data plane (vendor's).** The **SDK** — resolve the current tenant, fetch that
  tenant's theme pointer, inject the redefined variables, mount the prompt widget.
  Pure client (Tier A); an optional SSR head-injection for no-flash.
- **Dashboard (the Console, reframed as the vendor's governance surface).**
  Connect/scan + coverage report, the variable→role mapping confirm, the invariant
  editor, a per-tenant theme browser, and the kill-switch.

---

## 7. Data model

**App-level (per `appId`) — declared once, governs all tenants.** Lives in the
AppManifest / design-config:

```jsonc
{
  "appId": "acme-saas",
  "variableRoleMap": {
    "--background":        { "role": "surface-0",      "scope": ":root", "locked": false },
    "--foreground":       { "role": "text-primary",   "scope": ":root", "locked": false },
    "--primary":          { "role": "accent",         "scope": ":root", "locked": true  },  // brand
    "--border":           { "role": "border",         "scope": ":root", "locked": false },
    "--radius":           { "role": "radius-md",      "scope": ":root", "locked": false }
    // … the vendor's variables, each bound to a design role
  },
  "invariants": {
    "lockedVariables": ["--primary"],          // never changed by customization
    "contrastFloor": 4.5,                       // WCAG AA, compiler may only RAISE
    "allowedModes": ["light", "dark"],
    "accentChromaCap": 0.18
  }
}
```

**Per-tenant (subject = `tenantId`) — one per customer org.** Lives in the
per-subject theme store:

```jsonc
{
  "subject": "acme-corp",            // the tenant
  "styleSpec": { /* design intent: mode, accentHue, density, radius, fonts … */ },
  "compiledTheme": { /* role-token VALUES from the compiler */ },
  "seq": 7, "meta": { "prompt": "match our brand: navy + gold", "source": "pipeline" }
}
```

**The applier resolves** `compiledTheme` (role → value) through `variableRoleMap`
(role → vendor variable) into `{ "--primary": "<navy>", "--background": "<…>" }`
and injects it. Vendors who adopt our `--inv-*` names directly get an identity
map. The `variableRoleMap` is the **one genuinely new artifact**; everything else
is the existing theme/StyleSpec model with `subject = tenant`.

---

## 8. Multi-tenant model

- **Subject = tenant.** The existing per-subject theme store
  (`GET/PUT /v1/apps/:appId/themes`, `…/history`, `…/rollback`) keys themes by
  subject; we use the **tenant id** as the subject. Multi-tenancy is native.
  (Per-user personalization, if a vendor enables it, is just a finer-grained
  subject — e.g. `tenant:user`.)
- **App-level invariants, declared once** (§7), apply to every tenant. One
  governance surface; N tenant themes beneath it.
- **Distribution.** Theme JSON is small, immutable per version, CDN-cacheable; the
  per-tenant pointer is a tiny short-TTL lookup. Control-plane downtime degrades to
  the last-cached (or base) theme — never an outage for the vendor's app.
- **Drift / lazy revalidation (existing model).** When the vendor changes their
  base design or tightens an invariant, tenant themes **re-verify against the new
  invariants on next load** and recompile-from-`StyleSpec` or drop to base — no
  mass rebuild, no broken tenants.
- **Tenant isolation.** A tenant only ever fetches its own subject pointer; one
  tenant's theme can never affect another. The vendor's `getTenant()` resolver is
  the only identity input, and Invariance never owns identity.

---

## 9. The three core flows

### 9a. Onboard (vendor, once — ~5 min) — detail in `ONBOARDING-PIPELINE.md`

```
add snippet ─▶ CONNECT (scanner reads live --* vars, OKLCH engine classifies → roles)
            ─▶ coverage report ("82% of color surface drivable") ── confirms ICP fit
            ─▶ CONFIRM mapping + SET invariants (lock brand vars, contrast floor, modes)
            ─▶ PUBLISH manifest + design-config (app-level)
```

The scanner reuses the deterministic color→role engine, pointed at the app's
**declared variables** instead of observed JSX colors. It *proposes*; the vendor
*confirms*. Nothing the LLM says is load-bearing for safety.

### 9b. Customize (tenant admin or vendor CS) — reuses the live design pipeline

```
prompt → Gatekeeper classify → Designer LLM → StyleSpec → compiler → role VALUES
       → map role→variable → DESIGN VERIFY (contrast floor, locked vars, chroma cap, mode)
       → pass: store as this tenant's new theme version   (fail: retry Designer, never relax)
```

Invariants enforced by the **compiler + verifier deterministically** — the LLM
proposes the `StyleSpec`; it cannot move what's locked. "LLM in the loop, never in
the gate."

### 9c. Apply (runtime, per page load) — client, fail-open

```
SDK: resolve tenant → fetch tenant theme pointer (cache:'no-store' on the pointer)
   → inject <style id="inv-theme"> redefining the mapped variables → paint
   → (any fetch/verify failure → inject nothing → vendor's base design)
```

No code executes; only CSS-variable values change. Optional SSR head-injection
removes first-paint flash.

---

## 10. Governance & invariant model

What the vendor declares (dashboard → manifest/design-config), and the guarantee
each gives the *vendor*:

| Invariant | Vendor guarantee | Enforced by |
|---|---|---|
| **`variable → role` map** | "customization drives exactly these variables" | the applier indirection (§7) |
| **Locked variables** | "our brand hue/logo color never changes" | compiler writes locked last; verifier re-checks byte-identical |
| **Contrast floor** | "every tenant theme is WCAG-accessible" | compiler may only *raise* the target; verifier re-checks |
| **Allowed modes** | "light only / dark only / both" | compiler rejects disallowed modes |
| **Accent chroma cap** | "no garish, illegible themes" | verifier rejects over-cap accents |

All of these already exist in the design plane's enforcement (compiler
`packages/design/src/compiler/compile.ts`; verifier
`packages/design/src/verify/compiled-tests.ts`). Tier A mostly *reframes and
packages* them, plus the variable-mapping indirection.

---

## 11. Trust, safety & failure model

- **Fail-open everywhere.** Any failure (fetch, parse, verify, control-plane down)
  → no variables redefined → base app. The vendor's product cannot be broken by us.
- **No code execution in Tier A.** Themes are declarative values; there is no
  sandbox to escape. (The sandbox/signing machinery is Tier C only.)
- **Client re-verification.** The applied theme is re-checked against the vendor's
  invariants on load; a theme that no longer satisfies them (e.g. after the vendor
  tightened a floor) recompiles or drops to base.
- **PII / data.** End-user/tenant prompts live control-plane-side (authoring),
  never in a distributed artifact. Themes are non-PII config (colors, type scale).
  No production request transits Invariance.
- **Kill-switch.** The vendor (or we) can disable a tenant's customization; it
  reverts to base within the pointer TTL.

---

## 12. What we reuse vs. build new

**Reuse (already built — this is a reframing, not a rewrite):**
- OKLCH clustering / role assignment — `packages/design/src/compiler/cluster.ts`.
- Theme compiler (`StyleSpec` → role values, contrast solve, locked tokens) —
  `packages/design/src/compiler/compile.ts`.
- Design verifier (contrast floor, locked, chroma cap, allowed modes) —
  `packages/design/src/verify/compiled-tests.ts`.
- Per-subject theme store + versioning + rollback —
  `GET/PUT /v1/apps/:appId/themes`.
- Design-config (look-invariants) — `GET/PUT /v1/apps/:appId/design-config`.
- Client apply via `setProperty` — `packages/design/src/runtime/apply.ts`.
- Authoring design path (Gatekeeper → Designer → compile → verify).
- Role-token vocabulary — `packages/design-schema/src/role-tokens.ts` (13 color
  roles among them).

**Build new:**
- **`variable → role` map** as a first-class manifest artifact + the role→variable
  indirection in the applier (today the applier writes `--inv-*`; it must write the
  *vendor's* variable names via the map).
- **Runtime variable discovery** — read live `--*` off the running app
  (`getComputedStyle` + stylesheet walk), reusing the role engine to classify.
- **Coverage report** in onboarding (ICP fit, honest gap-naming).
- **The SDK** — a drop-in `<script>` + a React root provider: tenant resolution,
  theme fetch, variable injection, prompt-widget mount; optional SSR head-injection.
- **The governance dashboard** — the Console reframed: connect/scan, mapping
  confirm, invariant editor, per-tenant theme browser, kill-switch.
- **`subject = tenant`** wiring through the theme store + SDK fetch.

---

## 13. Build plan (sequenced, MVP-first)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0 — Schema reframe** | `variableRoleMap` + `invariants` in manifest/design-config; `subject = tenant` confirmed in the theme store | schema + zod types land; existing theme store serves a tenant subject |
| **1 — Scanner rework** | Runtime variable discovery + role classification + coverage report | point at a Tailwind-v4/shadcn sample app → get a proposed `variable→role` map + coverage % |
| **2 — Applier indirection** | Compiler output applied via the map to the *vendor's* variable names | a compiled theme redefines `--primary` etc. and repaints a sample app, no source edits |
| **3 — SDK** | `<script>` + React provider: tenant resolve, fetch, inject, widget mount | drop the snippet into the sample app → per-tenant theme applies; fail-open verified |
| **4 — Governance dashboard** | Console reframe: connect/scan UI, mapping confirm, invariant editor, tenant browser | a vendor can onboard + govern end-to-end in the UI |
| **5 — Reference app (living test)** | A Tailwind-v4/shadcn sample as the integration test (the Nebula analog) | "match our brand" prompt → governed, accessible per-tenant theme, e2e |
| **6 — Hardening** | SSR no-flash option, lazy-revalidation on invariant change, kill-switch, analytics | flash-free first paint; invariant tighten → tenants recompile/drop; kill works |
| **Deferred** | Tier B (walkthrough + slot map + build-time applier), Tier C (logic-plane GTM), pricing | — |

The reference app replaces Nebula's role as the living integration test, scoped to
the ICP (a variable-themed app), so every phase has an end-to-end check.

---

## 14. Risks & what could kill it

| Risk | Mitigation |
|---|---|
| **App doesn't theme via variables** (ICP miss) | Coverage report qualifies in onboarding; if low, not a fit — don't force the overlay hack. |
| **Partial variable coverage** | Report names gaps *before* commit; drive the covered surface, rest stays base (consistent, not broken). |
| **Variables scoped to components, not `:root`** | Scanner records scope; applier writes at the matching scope / higher-specificity layer. |
| **Flash-of-default first paint** | Cookie/localStorage cache; optional SSR head-injection. |
| **"Why not DIY theming?"** | Moat = *governed* (invariant-verified, contrast-guaranteed, fail-open) + AI-prompt UX + per-tenant management at scale — not raw variable swapping. |
| **Tenant theme drift on vendor redesign** | Existing lazy re-validation: re-verify on load, recompile-or-drop. |
| **Buyer doubts the "non-invasive" claim** | Be precise (§3): SDK + token adoption, never components/routes — and show the coverage report on their real app. |

---

## 15. Open questions / deferred

- **Pricing & packaging** — deferred (decide later). Likely usage/seat-based for
  Tier A self-serve; enterprise tiers for B/C.
- **Static vs runtime discovery default** — runtime-first proposed; confirm whether
  a static repo scan ships for MVP.
- **Tier B mechanism** — the visual walkthrough + non-invasive slot map +
  build-time applier (transforms build *output*, source pristine); deferred until
  Tier A is proven.
- **Non-variable styling families** (CSS modules, styled-components, plain CSS) —
  out of ICP for now; possible adapters later.
- **Relationship to the as-built two-plane stack** — the current code (Nebula +
  the look/logic planes) remains the substrate; this design reframes integration
  and GTM around Tier A. A future cleanup may retire demo-specific wiring once the
  reference app exists.
