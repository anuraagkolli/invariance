#!/usr/bin/env python3
"""
Generate docs/diagrams/index.html — the COMPLETE Invariance system design as a
single, self-contained, scrollable web page (no network, no external assets).

Content is grounded in the repo and the two design docs (INVARIANTS-PIPELINE.md,
ONBOARDING-PIPELINE.md). The dense pipeline poster (system-design.svg) is inlined
as a zoomable appendix. Regenerate:  python3 docs/diagrams/gen_page.py
"""
import os, html

HERE = os.path.dirname(os.path.abspath(__file__))
def esc(t): return html.escape(str(t))

# ---------- small HTML helpers ----------------------------------------------
def badge(txt, kind="det"):
    return f'<span class="b b-{kind}">{esc(txt)}</span>'

def chips(items):
    """items: list of (label, kind). label may contain '||' for a second line."""
    out = ['<div class="flow">']
    for i, (label, kind) in enumerate(items):
        if i: out.append('<span class="chev">&rsaquo;</span>')
        main, _, sub = label.partition("||")
        s = f'<div class="step s-{kind}"><span class="st">{esc(main)}</span>'
        if sub: s += f'<span class="ss">{esc(sub)}</span>'
        s += '</div>'
        out.append(s)
    out.append('</div>')
    return "".join(out)

def card(title, accent, rows, tag=None, where=None):
    h = [f'<div class="card c-{accent}">']
    h.append('<div class="card-h">')
    h.append(f'<span class="card-t">{title}</span>')
    if tag: h.append(f'<span class="tag t-{accent}">{esc(tag)}</span>')
    h.append('</div>')
    if where: h.append(f'<div class="where">{where}</div>')
    h.append('<ul class="bul">')
    for r in rows: h.append(f'<li>{r}</li>')
    h.append('</ul></div>')
    return "".join(h)

def cite(t): return f'<code class="cite">{esc(t)}</code>'
def code(t): return f'<code>{esc(t)}</code>'

# ---------- sections ---------------------------------------------------------
S = []

# ===== OVERVIEW =====
S.append(('overview', 'Overview', '''
<p class="lead">Invariance lets <b>end users</b> of an existing web app customize it with natural-language prompts —
both its <b>look</b> (tokens, styles, layout, slots) and its <b>business logic</b> at the API seam — while the app's
<b>developers stay in control</b> through declared <i>invariants</i>. Two independent planes do this, and they answer
the question <i>"when is the change actually live?"</i> in two different ways.</p>

<div class="callout c-llm">
  <b>The one rule that makes it safe:</b> the LLM is <u>in the loop, never in the gate</u>. The model only
  <i>proposes</i>; everything that is enforced is enforced by deterministic TypeScript + cryptography. Verification
  contains no LLM. Every failure path falls open to the base app.
</div>

<h3>The two planes at a glance</h3>
<div class="tbl-wrap"><table class="cmp">
<thead><tr><th></th><th class="look">LOOK plane</th><th class="logic">BUSINESS-LOGIC plane</th></tr></thead>
<tbody>
<tr><td>Package</td><td>''' + code('@invariance/design') + '''</td><td>''' + code('control-plane') + ' + ' + code('@invariance/server') + '''</td></tr>
<tr><td>Changes</td><td>tokens, colors, fonts, layout profile, slots</td><td>API request/response <i>data</i> (filter / transform shows, featured…)</td></tr>
<tr><td>Runs where</td><td>the browser (+ SSR cookie mirror)</td><td>the customer's server, inside a QuickJS-WASM sandbox</td></tr>
<tr><td>Authoring brain</td><td>Gatekeeper + Designer LLM</td><td>qwen2.5 (Ollama) / Anthropic LLM</td></tr>
<tr><td>The gate</td><td>deterministic level-gate + <code>verifyV2</code> (7 tests)</td><td>deterministic <code>verifyBundleAgainstManifest</code> + Zod <code>superRefine</code></td></tr>
<tr><td>Signed bundle?</td><td><span class="no">No</span> — theme JSON, stored + cookie-mirrored</td><td><span class="yes">Yes</span> — ed25519 over canonical JSON, content-addressed</td></tr>
<tr><td><b>Goes live when…</b></td><td><code>root.style.setProperty()</code> runs — <b>immediate paint</b></td><td>runtime sets <code>current = execution.result</code> — <b>per request</b>, after crypto + capability checks</td></tr>
<tr><td>Failure mode</td><td>drop theme → base CSS wins</td><td>fail-open → original payload returned</td></tr>
</tbody></table></div>
'''))

# ===== TRUST ZONES =====
zones = (
    card("END-USER BROWSER", "browser", [
        f'{badge("client","browser")} <b>Customer web app</b> — React+Tailwind, developer-shipped; components read {code("var(--inv-*)")} tokens, regions wrapped in {code("&lt;m.slot&gt;")}.',
        f'{badge("client","browser")} <b>@invariance/client</b> (Tier-0): ModLoader (fetch→verify→cache bundle), UI overlay engine, prompt widget {code("submitPrompt()")}, async telemetry.',
        f'{badge("client","browser")} <b>@invariance/design</b> (look plane): CustomizationPanel + m.slots, Gatekeeper + Designer, compiler, <code>verifyV2</code>, apply → <code>:root</code>.',
    ], where='data plane · runs developer-shipped code'),
    card("DEVELOPER INFRASTRUCTURE", "dev", [
        f'{badge("server","dev")} <b>Frontend host</b> — serves the app + bundled Invariance SDKs; holds no Invariance state.',
        f'{badge("server","dev")} <b>API server · @invariance/server</b> (Tier-1): {code("withInvariance")}/Express middleware, runtime (fetch pointer + <code>verifyBundle</code>), QuickJS-WASM sandbox, capability + field enforcement.',
        f'{badge("server","dev")} <b>Customer backend / DB</b> — the real data hooks transform on the way out; untouched unless a mod is active.',
    ], where='data plane · customer-owned · stores nothing durably'),
    card("INVARIANCE CONTROL PLANE", "cp", [
        f'{badge("our cloud","cp")} <b>control-plane monolith</b> (Hono+Postgres): Authoring (LLM + verifier-in-loop) · Verification (no LLM) · Registry (sign · publish · pointers · kill-switch · lazy-migrate) · Analytics · Design-config + Themes store.',
        f'{badge("our cloud","cp")} <b>Postgres</b> — durable source of truth: manifests, mod revisions, pointers, prompts (PII), themes, events.',
        f'{badge("Next.js","cp")} <b>Console</b> — manifest + Invariants surface, mods + kill switches, Guardrails, Themes/rollback.',
    ], where='control plane · our infra'),
)
S.append(('zones', 'Trust zones — who runs what', '''
<p class="lead">Three zones across a hard <b>control-plane / data-plane</b> boundary. The control plane (our infra)
authors, verifies, signs and distributes. The data plane (the developer's own servers + the user's browser) only ever
loads <i>static, signed</i> artifacts and verifies them locally.</p>
<div class="grid grid-3">''' + "".join(zones) + '''</div>
<div class="grid grid-2" style="margin-top:14px">
''' + card("CDN", "cdn", [
    'Immutable, content-addressed signed bundles served at <code>/bundles/:hash</code> with <code>cache-control: immutable</code>.',
    'Static — ours or mirrored into the customer&rsquo;s bucket. Trust comes from the <b>signature</b>, not the host.',
], where='shared static artifact store') + card("LLM", "llmc", [
    '<b>qwen2.5 via Ollama</b> (OpenAI-compatible, default, no key) or <b>Anthropic</b> (opt-in).',
    'Used <b>only</b> in authoring. Never in verification, never on the production request path.',
], where='authoring brain') + '''</div>
<div class="callout c-cp" style="margin-top:14px">
  <b>No production request ever transits Invariance.</b> The prod path is <span class="hot">Browser ↔ Developer&rsquo;s server ↔ CDN</span>
  (static fetch + local signature check). Control-plane downtime can never break the customer app — distribution is a
  short-TTL mutable <b>pointer</b> ("active modset = hash X") in front of <b>immutable</b> signed bundles.
</div>
'''))

# ===== COMPONENTS =====
comps = (
    card("@invariance/schema", "look", [
        'The keystone: zod schemas + types every component shares.',
        'AppManifest (tokens, endpoints, invariants/policies), ModBundle (uiOps, hooks, capability manifest), ed25519 signing, path/diff utils.',
        f'Cross-schema integrity in {code("superRefine")} — the first verification layer.',
    ], tag="shared", where='imported everywhere'),
    card("@invariance/client", "browser", [
        'Tier-0 SDK (React provider + vanilla build).',
        f'{code("ModLoader")} · UI overlay engine · prompt widget ({code("submitPrompt")}/{code("requestRefix")}) · {code("verifyEnvelope")} · telemetry.',
    ], tag="browser", where='end-user browser'),
    card("@invariance/design", "browser", [
        'The entire LOOK plane: authoring + compile + verify + apply, client-side.',
        f'{code("agent/")} (gatekeeper, designer, pipeline) · {code("compiler/")} · {code("verify/")} · {code("runtime/apply.ts")} · {code("panel/")} · {code("primitives/")} (m.slot).',
    ], tag="browser", where='browser (+ server export: callDesigner)'),
    card("@invariance/server", "dev", [
        'Tier-1 SDK — wraps the customer API seam; everything fails open.',
        f'{code("withInvariance")}/{code("createInvarianceMiddleware")} · {code("InvarianceRuntime")} · {code("executeHook")} (QuickJS sandbox) · {code("checkCapabilityWrites")}/{code("checkFieldConstraints")}.',
    ], tag="server", where='developer&rsquo;s API server'),
    card("apps/control-plane", "cp", [
        'Modular monolith (Hono + Postgres). Modules: authoring · verification · registry · analytics.',
        f'Agents: {code("OpenAiCompatAgent")} (Ollama/qwen) · {code("AnthropicAgent")} · design-aware wrap. Stores: mods, manifests, pointers, themes, events.',
    ], tag="our cloud", where='control plane'),
    card("apps/console", "cp", [
        'Developer dashboard (Next.js) — the single invariants surface.',
        'Manifest, mods + kill switches, analytics, Guardrails (live enforcement tests), Invariants view (data + look), Themes (history + rollback).',
    ], tag="Next.js", where='control plane'),
    card("packages/cli", "gate", [
        f'The {code("invariance")} bin — developer-time.',
        f'{code("init")} (scan repo, wire SDKs, draft manifest as a PR) · {code("manifest publish")} · {code("dev")} (local control plane).',
    ], tag="build-time", where='developer&rsquo;s machine / CI'),
)
S.append(('components', 'Packages & components', '''
<p class="lead">Workspace packages export TypeScript source directly (no build step). Schema is the source of truth;
types come from <code>z.infer</code>.</p>
<div class="grid grid-3">''' + "".join(comps) + '''</div>
'''))

# ===== CONTROL-PLANE API =====
routes = [
    ("POST", "/v1/apps/:appId/manifest", "publish a manifest version (marks affected mods stale → lazy migration)"),
    ("GET", "/v1/apps/:appId/manifest", "current manifest"),
    ("POST", "…/subjects/:subjectId/prompts", "author a mod from a prompt (the authoring pipeline)"),
    ("POST", "…/subjects/:subjectId/bundles", "publish a hand-authored bundle (dev/test)"),
    ("GET", "…/subjects/:subjectId/pointer", "the per-subject pointer: status + contentHash"),
    ("POST", "…/subjects/:subjectId/revalidate", "re-check a stale subject against the live manifest"),
    ("POST", "…/subjects/:subjectId/refix", "AI re-fix a degraded mod"),
    ("GET", "/v1/apps/:appId/bundles/:hash", "immutable signed bundle (CDN origin, cache-control: immutable)"),
    ("GET/PUT", "/v1/apps/:appId/design-config", "look invariants (design plane); Nebula reads per request"),
    ("GET/PUT", "/v1/apps/:appId/themes", "current theme; + …/themes/history, …/themes/rollback"),
    ("GET", "/v1/apps/:appId/mods", "all mods; + …/subjects/:id/overview"),
    ("POST", "/v1/apps/:appId/mods/:modId/kill", "kill switch → pointer disabled; + …/restore"),
    ("POST", "/v1/apps/:appId/events", "telemetry ingest; + GET …/analytics/summary, GET …/events"),
    ("GET", "/v1/apps/:appId/signing-key", "public key for client/server verification"),
]
api_rows = "".join(
    f'<tr><td><span class="m m-{("get" if "GET" in m and "PUT" not in m else "post" if m=="POST" else "mix")}">{esc(m)}</span></td>'
    f'<td>{code(p)}</td><td>{esc(d)}</td></tr>' for (m, p, d) in routes)
S.append(('api', 'Control-plane API surface', '''
<p class="lead">One Hono monolith, versioned under <code>/v1/apps/:appId/…</code>. Authoring, distribution,
look-config, governance and analytics all live here; the data plane only calls the pointer + bundle endpoints.</p>
<div class="tbl-wrap"><table class="routes"><thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead>
<tbody>''' + api_rows + '''</tbody></table></div>
'''))

# ===== LIFECYCLE =====
flows = [
    ("1", "gov", "Onboard", "dev-time, once",
     "CLI scans + wires the app, drafts the manifest; developer declares invariants in the Console.",
     "@invariance/cli → control-plane registry + Console"),
    ("2", "look", "Author a LOOK edit", "live, in browser",
     "the in-browser design pipeline applies instantly; the theme is persisted to the control-plane design-config / themes store.",
     "browser · @invariance/design → control plane (persist)"),
    ("3", "logic", "Author a LOGIC edit", "browser → our cloud",
     "prompt → control-plane authoring → verifier-in-the-loop → ed25519 sign. The prompt stays in Postgres, never in the bundle.",
     "submitPrompt → POST …/prompts → Registry"),
    ("4", "cdn", "Distribute", "control plane → CDN",
     "Registry writes the immutable bundle to the CDN and sets a short-TTL per-subject pointer (active|stale|disabled).",
     "Registry → CDN + pointer"),
    ("5", "look", "Serve LOOK", "runtime, client",
     "ModLoader fetches the pointer + bundle, verifies the signature in the browser, applies overlay + tokens.",
     "CDN → @invariance/client"),
    ("6", "dev", "Serve LOGIC", "runtime · hot path",
     "user request → developer&rsquo;s API server → fetch pointer (no-store) + bundle → verify → sandbox → response. No control-plane transit.",
     "user → @invariance/server ↔ CDN → user"),
    ("7", "gov", "Telemetry", "off the request path",
     "client + server emit async events → control-plane Analytics → Console.",
     "client/server → Analytics → Console"),
    ("8", "gov", "Govern", "control plane",
     "Console kill-switch flips the pointer to disabled; manifest republish marks mods stale (lazy migration); theme rollback.",
     "Console → Registry → pointer"),
]
lc = "".join(
    f'<div class="lc"><div class="lc-n n-{k}">{n}</div><div class="lc-b">'
    f'<div class="lc-t">{esc(name)} <span class="lc-w">{esc(when)}</span></div>'
    f'<div class="lc-d">{gist}</div><div class="lc-hop">{code(hop)}</div></div></div>'
    for (n, k, name, when, gist, hop) in flows)
S.append(('lifecycle', 'End-to-end lifecycle', '''
<p class="lead">Eight flows tie the zones together. Authoring crosses into the control plane; serving never does.</p>
<div class="lc-grid">''' + lc + '''</div>
'''))

# ===== ONBOARDING =====
S.append(('onboarding', 'Onboarding / scanner pipeline', '''
<p class="kicker-note">''' + badge("developer-time · runs once", "gate") + ''' &nbsp;<i>current design, not finalized · React+Tailwind this round</i></p>
<p class="lead">The upstream step that turns a raw, un-wired multi-page app into a <b>governable</b> one: everything
customizable is <i>named once</i> here, so later end-user changes edit a name&rsquo;s value, never the call sites.</p>
''' + chips([
    ("Discover archetypes||router walk → patterns", "det"),
    ("Per-archetype map||AST sections + LLM names/levels", "llm"),
    ("Reconcile palette||clusters → role tokens (barrier)", "det"),
    ("Generate artifacts||tailwind.config · manifest · layout", "det"),
    ("Codemod||repoint classes · wrap m.slot", "det"),
    ("Verify||build · verifyV2 · visual-QA = before", "gate"),
    ("Reviewable diff||branch/PR → dev edits → merge", "rev"),
]) + '''
<p class="note-line">Stages 2 &amp; 5 fan out (per-archetype / per-file); a failed verify feeds a bounded
<span class="fail">repair loop</span> (re-segment / re-cluster / re-generate).</p>
<h3>Output — three centralization layers</h3>
<div class="tbl-wrap"><table class="cmp">
<thead><tr><th>Layer</th><th>The "name" created</th><th>One change fans out via</th></tr></thead>
<tbody>
<tr><td class="look">Token</td><td><code>var(--inv-*)</code> role tokens</td><td>CSS cascade → every page, instantly</td></tr>
<tr><td class="cdn">Archetype</td><td><code>designSurface</code>: route patterns + sections + levels</td><td>one template component → all its URLs</td></tr>
<tr><td class="logic">Layout</td><td><code>LayoutSpec</code> grammar per archetype</td><td>archetype key → every page of that type</td></tr>
</tbody></table></div>
'''))

# ===== LOOK PLANE =====
S.append(('look', 'LOOK plane — design pipeline', '''
<p class="lead">All client-side and live. Entry: <code>runPipeline</code> (''' + cite("packages/design/src/agent/pipeline.ts:114") + '''),
driven by the CustomizationPanel widget.</p>
''' + chips([
    ("prompt + history", "in"),
    ("Gatekeeper||level-gate (LLM classifies)", "gate"),
    ("Designer LLM||StyleSpec, no raw colors", "llm"),
    ("Compiler||→ 38 role tokens (OKLCH)", "det"),
    ("Layout profile||vibe → grid/standard", "det"),
    ("verifyV2||7 deterministic tests", "gate"),
    ("persistAndApply", "det"),
    ("apply :root||→ instant paint", "apply"),
]) + '''
<div class="grid grid-2" style="margin-top:14px">
''' + card("Where invariants are enforced", "gate", [
    f'<b>Compiler, not the LLM</b>: {code("allowed_modes")}/{code("font_registry")}/{code("locked_tokens")} violations throw; locked tokens are written last and override every computed value ({cite("compiler/compile.ts")}).',
    f'Contrast solved by OKLCH search; the developer floor can only <i>raise</i> the target.',
    f'<b>verifyV2</b> (7 tests): all 38 tokens present · locked byte-identical · contrast floor · chroma cap · fonts in registry · all <code>var(--inv-…)</code> resolve ({cite("verify/compiled-tests.ts:391")}).',
]) + card("How it stays correct", "look", [
    f'<b>Recompile-on-fail = Designer retry</b> (max 2) — there is no path that relaxes a constraint or applies an unverified spec.',
    f'<b>Goes live</b> the instant {code("root.style.setProperty(key,value)")} runs — pure CSS cascade, zero React re-render ({cite("runtime/apply.ts:34")}).',
    f'<b>Live reconciliation</b>: when the dev tightens an invariant, the applied theme is re-verified and recompiled-or-dropped, no reload ({cite("context/provider.tsx:162")}).',
]) + '''</div>
'''))

# ===== LOGIC PLANE =====
S.append(('logic', 'BUSINESS-LOGIC plane — signed bundles', '''
<p class="lead">The novel half: authoring builds a verified, signed bundle (control plane); runtime executes it
sandboxed, per request, on the customer&rsquo;s server (data plane).</p>
<h3>Authoring &nbsp;<span class="sub-h">prompt → verified, signed bundle</span></h3>
<p class="note-line">Entry: <code>POST …/subjects/:id/prompts</code> → <code>authorMod</code>
(''' + cite("apps/control-plane/src/modules/authoring/pipeline.ts:85") + ''').</p>
''' + chips([
    ("prompt ≤2000", "in"),
    ("LLM draft||uiOps + hooks + capabilities", "llm"),
    ("deriveRepairedWrites||acorn AST widens writes", "det"),
    ("VERIFY GATE||deterministic · NO LLM", "gate"),
    ("SIGN||canonical JSON + ed25519", "apply"),
    ("DISTRIBUTE||CDN @hash + pointer", "cdn"),
]) + '''
<p class="note-line"><b>Verifier-in-the-loop</b> (retry ≤3): failed reasons become feedback. The verifier rejects writes
to immutable fields, dangerous CSS/HTML, illegal hooks (no <code>eval</code>/<code>Function</code>/<code>globalThis</code>/<code>fetch</code>…),
and over-budget hooks. The user&rsquo;s prompt is stored in <code>ModRecord</code> — <b>never</b> in the signed bundle (PII).</p>

<h3>Runtime &nbsp;<span class="sub-h">real request → verified, sandboxed execution</span></h3>
<p class="note-line">A real request — e.g. Nebula&rsquo;s <code>GET /api/shows</code> wrapped by <code>withInvariance</code>.</p>
''' + chips([
    ("user request", "in"),
    ("fetch pointer||cache:no-store · active only", "gate"),
    ("verifyBundle||sha256 + ed25519 + schema", "gate"),
    ("QuickJS sandbox||budgets · no host bindings", "det"),
    ("capability + field checks||immutable multiset", "det"),
    ("current = execution.result||→ response", "apply"),
]) + '''
<div class="grid grid-2" style="margin-top:14px">
''' + card("Defense in depth", "gate", [
    f'<b>Only <code>status==='+"'active'"+'</code> executes</b>; {code("verifyBundle")} re-checks hash + signature + schema before any hook runs ({cite("packages/schema/src/signing.ts:69")}).',
    f'<b>Per-hook capability bounding</b>: {code("checkCapabilityWrites")} discards any changed path not declared ({cite("packages/server/src/enforce.ts:19")}).',
    f'<b>Immutable fields by multiset</b>: reorder OK, any add/remove/rewrite → return the ORIGINAL payload (all-or-nothing).',
]) + card("The apply line", "logic", [
    f'Kept only when the hook succeeded <i>and</i> capability check passed <i>and</i> field-constraint check passed: <b><code>current = execution.result</code></b> ({cite("packages/server/src/runtime.ts:226")}).',
    f'Any exception anywhere → original payload. <b>Fail-open everywhere.</b>',
    f'An already-verified bundle is cached by <code>contentHash</code> (immutable, so sound).',
]) + '''</div>
'''))

# ===== DISTRIBUTION =====
statuses = [
    ("active", "ok", "executes — the live modset for this subject"),
    ("stale", "warn", "manifest changed; base behavior until the next client session revalidates"),
    ("degraded", "warn", "verification/migration downgraded it; base behavior, AI re-fix offered"),
    ("disabled", "bad", "kill switch flipped; base behavior (superseded mods cannot flip)"),
    ("none", "muted", "no mod for this subject; base app"),
]
st_rows = "".join(f'<tr><td><span class="pill p-{c}">{esc(s)}</span></td><td>{esc(d)}</td></tr>' for (s, c, d) in statuses)
S.append(('distribution', 'Distribution model', '''
<p class="lead">Two-step, so a kill-switch or supersession propagates within the pointer TTL while bundles stay
cacheable forever.</p>
<div class="grid grid-2">
''' + card("Mutable side — pointer", "cdn", [
    'Short-TTL (~5s) per-subject pointer: "active modset = hash X".',
    'Manifest publish marks active mods <b>stale</b> (lazy migration); kill-switch flips <b>disabled</b>/<b>active</b>; superseded mods cannot flip.',
    f'Runtime fetches it with <code>cache:'+"'no-store'"+'</code> — a stale cache here once silently no-op&rsquo;d all hooks.',
]) + card("Immutable side — bundle", "look", [
    f'ed25519-signed envelope over canonical JSON (sorted keys at every depth); {code("contentHash = sha256(payload)")}.',
    'Served content-addressed with <code>cache-control: immutable</code>. New revisions supersede via the pointer.',
    'Trust is in the signature → bundles can be mirrored into the customer&rsquo;s own CDN.',
]) + '''</div>
<h3>Pointer status</h3>
<div class="tbl-wrap"><table class="routes"><thead><tr><th>Status</th><th>Runtime behavior</th></tr></thead>
<tbody>''' + st_rows + '''</tbody></table></div>
<div class="callout c-dev" style="margin-top:14px"><b>Developer release path:</b> new manifest version → registry marks
affected bindings stale → next user session revalidates → pass / degrade-to-base / offer AI re-fix. The prod path touches
only static CDN artifacts + a local signature check.</div>
'''))

# ===== ENFORCEMENT =====
S.append(('enforcement', 'Enforcement semantics', '''
<p class="lead">The <i>same</i> path / diff semantics run at verify-time (control plane) and run-time (data plane) —
defense in depth. These are the rules both engines share.</p>
<div class="grid grid-2">
''' + card("Paths & diffs", "logic", [
    f'<code>diffPaths</code> treats a pure array permutation as a write to the array <i>itself</i>, not its element fields — so "sort my list" mods are possible ({cite("paths.ts:64")}).',
    'Immutable-field policies compare the <b>multiset</b> of values at the path: reordering is legal; rewriting/adding/hiding a protected value is not.',
]) + card("Write declarations", "gate", [
    'The verifier rejects declared writes targeting an immutable field (descendant-or-equal path) and whole-body writes on such endpoints — but allows strict-ancestor declarations (e.g. <code>shows</code>).',
    f'<code>fields:undefined</code> = whole-body write (allowed unless the endpoint has immutable fields); <code>fields:[]</code> = explicitly rejected.',
    f'<code>statusCode ≥ 400</code> responses are never transformed; GET endpoints reject request-phase hooks.',
]) + '''</div>
<h3>The two "apply" moments</h3>
<div class="grid grid-2">
  <div class="apply-card c-look"><div class="ac-h">LOOK — goes live at</div>
    <code class="big">root.style.setProperty(key, value)</code>
    <div class="ac-f">''' + cite("packages/design/src/runtime/apply.ts:34") + ''' · guarded by <code>verifyV2</code> · fail-open = base CSS</div></div>
  <div class="apply-card c-logic"><div class="ac-h">BUSINESS-LOGIC — goes live at</div>
    <code class="big">current = execution.result</code>
    <div class="ac-f">''' + cite("packages/server/src/runtime.ts:226") + ''' · guarded by verifyBundle + capability + multiset · fail-open = original payload</div></div>
</div>
'''))

# ===== INVARIANTS & EDGES =====
inv = [
    "Runtimes execute <b>only</b> signed, verified Mod Bundles (<code>verifyBundle</code> before anything).",
    "Bundles are immutable; new revisions supersede via the registry pointer.",
    "User prompts never go into bundles (PII) — they live control-plane-side.",
    "Verification is deterministic — no LLM in the verify step.",
    "Hooks run sandboxed with hard budgets, touching only declared endpoints/fields.",
    "Any fetch/verify failure fails open to base app behavior. The developer's infra stores nothing durably.",
]
edges = [
    ("Signing-key durability", "Without persisted <code>INVARIANCE_SIGNING_*</code>, keys regenerate on restart → every bundle fails verification → universal silent no-op. Open hand-off footgun."),
    ("Auto-repair widens writes", "The final <code>writes</code> set is partly acorn-inferred; safety rests on the verifier&rsquo;s immutable-field check running on the <i>repaired</i> bundle."),
    ("Two look-plane verifiers", "THEME/SLOT_F1 use <code>verifyV2</code> (7 tests); F2–F4 use the older v5 engine. Confirm overlap."),
    ("Kill-switch latency", "A disabled mod can keep executing until the cached pointer expires (~5s)."),
    ("One-shot drop warning", "After warning once, a weak model is trusted to drop existing customizations (prevents non-convergence)."),
]
inv_html = "".join(f'<li>{x}</li>' for x in inv)
edge_html = "".join(f'<div class="edge"><div class="edge-t">{t}</div><div class="edge-d">{d}</div></div>' for (t, d) in edges)
S.append(('invariants', 'Core invariants & sharp edges', '''
<div class="grid grid-2">
  <div><h3>System invariants</h3><ul class="bul big-bul">''' + inv_html + '''</ul></div>
  <div><h3>Sharp edges the trace surfaced</h3><div class="edges">''' + edge_html + '''</div></div>
</div>
'''))

# ---------- inline the dense poster as a zoomable appendix -------------------
poster_svg = ""
try:
    poster_svg = open(os.path.join(HERE, "system-design.svg")).read()
except Exception:
    poster_svg = "<p class='note-line'>(poster SVG not found — run gen_system_design.py)</p>"
S.append(('poster', 'Appendix — the pipeline poster', '''
<p class="lead">The same look + business-logic pipelines as a single dense, zoomable diagram (scroll sideways).</p>
<details open><summary>Show / hide the full pipeline poster</summary>
<div class="poster-scroll">''' + poster_svg + '''</div></details>
'''))

# ---------- nav + assemble ---------------------------------------------------
NAV = [
    ("overview", "Overview"), ("zones", "Trust zones"), ("components", "Components"),
    ("api", "API"), ("lifecycle", "Lifecycle"), ("onboarding", "Onboarding"),
    ("look", "Look plane"), ("logic", "Logic plane"), ("distribution", "Distribution"),
    ("enforcement", "Enforcement"), ("invariants", "Invariants"), ("poster", "Poster"),
]
nav_html = "".join(f'<a href="#{i}" data-sec="{i}">{esc(t)}</a>' for (i, t) in NAV)
sections_html = "".join(
    f'<section id="{sid}"><div class="sec-kicker">{i+1:02d}</div><h2>{esc(title)}</h2>{body}</section>'
    for i, (sid, title, body) in enumerate(S))

CSS = r'''
:root{
  --bg0:#0a0b0d; --bg1:#0e1014; --panel:#14161b; --panel2:#191c22; --bd:#262a31;
  --ink:#e9eaee; --mute:#9aa0ab; --faint:#6b7280;
  --look:#56c7f5; --logic:#f2b545; --gate:#46d6a0; --llm:#b79bff; --cdn:#9aa6ff;
  --apply:#ffd66b; --fail:#fb7185; --browser:#56c7f5; --dev:#46d6a0; --cp:#f2b545; --gov:#c9b27a; --rev:#7fd4b0;
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:
  radial-gradient(1100px 480px at 50% -160px, rgba(86,150,200,.10), transparent 70%),
  linear-gradient(var(--bg1),var(--bg0));
  color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
code{font-family:var(--mono);font-size:.86em;background:#1c2027;border:1px solid var(--bd);
  border-radius:5px;padding:.5px 5px;color:#cdd3db}
code.cite{color:var(--look);background:#10222b;border-color:#1c3a47}
.cite{white-space:nowrap}

/* header / nav */
header.top{position:sticky;top:0;z-index:50;backdrop-filter:blur(10px);
  background:rgba(10,11,13,.82);border-bottom:1px solid var(--bd)}
.top-in{max-width:1240px;margin:0 auto;padding:11px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:.5px;font-size:14px;white-space:nowrap}
.brand .dot{color:var(--logic)}
nav{display:flex;gap:3px;flex-wrap:wrap;overflow-x:auto}
nav a{font-size:12px;color:var(--mute);padding:5px 9px;border-radius:7px;white-space:nowrap;border:1px solid transparent}
nav a:hover{color:var(--ink);background:#181b21}
nav a.active{color:var(--ink);background:#1d2128;border-color:var(--bd)}

main{max-width:1240px;margin:0 auto;padding:30px 22px 90px}
.hero{padding:26px 0 8px}
.hero h1{font-size:34px;margin:.1em 0 .15em;letter-spacing:-.3px;font-weight:850}
.hero .tagline{color:var(--mute);font-size:15px;max-width:880px}
.hero .meta{margin-top:12px;color:var(--faint);font-size:12px;font-family:var(--mono)}

section{padding:30px 0;border-top:1px solid var(--bd);scroll-margin-top:64px}
.sec-kicker{font-family:var(--mono);font-size:12px;color:var(--logic);font-weight:700;letter-spacing:2px}
section h2{font-size:23px;margin:.15em 0 .5em;font-weight:800}
section h3{font-size:15px;margin:1.4em 0 .6em;color:var(--ink);font-weight:800}
.sub-h{color:var(--mute);font-weight:500;font-size:13px}
.lead{color:var(--mute);max-width:920px;margin:.2em 0 1em}
.note-line{color:var(--mute);font-size:13.5px;max-width:980px;margin:.6em 0}
.kicker-note{margin:.2em 0 .6em;color:var(--mute);font-size:13px}

/* grids + cards */
.grid{display:grid;gap:14px}
.grid-2{grid-template-columns:repeat(2,1fr)}
.grid-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:980px){.grid-3{grid-template-columns:1fr}.grid-2{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--bd);border-radius:12px;padding:15px 16px;position:relative;
  border-left-width:3px}
.card.c-browser,.card.c-look{border-left-color:var(--look)}
.card.c-dev{border-left-color:var(--dev)}
.card.c-cp,.card.c-logic{border-left-color:var(--cp)}
.card.c-cdn{border-left-color:var(--cdn)}
.card.c-llmc{border-left-color:var(--llm)}
.card.c-gate{border-left-color:var(--gate)}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
.card-t{font-weight:800;font-size:14.5px}
.where{font-size:11px;color:var(--faint);font-family:var(--mono);margin-bottom:8px}
ul.bul{margin:.3em 0 0;padding-left:1.05em;list-style:none}
ul.bul li{position:relative;margin:.42em 0;font-size:13px;color:var(--mute);padding-left:.1em}
ul.bul li::before{content:"▹";position:absolute;left:-1em;color:var(--faint)}
ul.bul li b{color:var(--ink);font-weight:700}
ul.big-bul li{font-size:13.5px;margin:.55em 0}

/* badges + tags */
.b{display:inline-block;font-family:var(--mono);font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:5px;
  border:1px solid;vertical-align:middle;letter-spacing:.3px}
.b-det{color:#aeb6c2;border-color:#39414e;background:#1b1f26}
.b-llm{color:var(--llm);border-color:#3a3160;background:#211b34}
.b-gate{color:var(--gate);border-color:#1c4536;background:#0f261d}
.b-apply{color:var(--apply);border-color:#4d3f15;background:#241d09}
.b-browser{color:var(--browser);border-color:#1c3a47;background:#102029}
.b-dev{color:var(--dev);border-color:#1c4536;background:#0f261d}
.b-cp{color:var(--cp);border-color:#4d3f15;background:#241d09}
.tag{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid;white-space:nowrap}
.t-browser,.t-look{color:var(--look);border-color:#1c3a47}.t-dev{color:var(--dev);border-color:#1c4536}
.t-cp,.t-logic{color:var(--cp);border-color:#4d3f15}.t-cdn{color:var(--cdn);border-color:#34406b}
.t-llmc{color:var(--llm);border-color:#3a3160}.t-gate{color:var(--gate);border-color:#1c4536}

/* callouts */
.callout{border:1px solid var(--bd);border-left-width:3px;border-radius:10px;padding:13px 15px;font-size:13.5px;color:var(--mute)}
.callout b{color:var(--ink)} .callout u{text-decoration-color:var(--llm)}
.callout.c-llm{border-left-color:var(--llm);background:linear-gradient(90deg,rgba(183,155,255,.06),transparent)}
.callout.c-cp{border-left-color:var(--cp);background:linear-gradient(90deg,rgba(242,181,69,.06),transparent)}
.callout.c-dev{border-left-color:var(--dev);background:linear-gradient(90deg,rgba(70,214,160,.06),transparent)}
.hot{color:var(--apply);font-weight:700}

/* flow chips */
.flow{display:flex;align-items:stretch;flex-wrap:wrap;gap:7px;margin:.6em 0}
.step{background:var(--panel2);border:1px solid var(--bd);border-radius:9px;padding:8px 11px;min-width:96px;
  display:flex;flex-direction:column;justify-content:center;border-top-width:2px}
.step .st{font-size:12px;font-weight:700;color:var(--ink)}
.step .ss{font-size:10px;color:var(--mute);margin-top:1px;font-family:var(--mono)}
.s-in{border-top-color:var(--faint)} .s-det{border-top-color:#9aa6b8}
.s-llm{border-top-color:var(--llm)} .s-llm .st{color:#d7c9ff}
.s-gate{border-top-color:var(--gate);background:#0e1a16} .s-gate .st{color:#9befcf}
.s-apply{border-top-color:var(--apply);background:#1c1808} .s-apply .st{color:var(--apply)}
.s-cdn{border-top-color:var(--cdn)} .s-cdn .st{color:#c3cbff}
.s-rev{border-top-color:var(--rev)}
.chev{align-self:center;color:var(--faint);font-size:18px;font-weight:700}
.fail{color:var(--fail);font-weight:700}

/* lifecycle */
.lc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:980px){.lc-grid{grid-template-columns:1fr}}
.lc{display:flex;gap:13px;background:var(--panel);border:1px solid var(--bd);border-radius:11px;padding:13px 15px}
.lc-n{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:14px;border:2px solid}
.n-look{color:var(--look);border-color:var(--look)} .n-logic{color:var(--cp);border-color:var(--cp)}
.n-dev{color:var(--dev);border-color:var(--dev)} .n-cdn{color:var(--cdn);border-color:var(--cdn)}
.n-gov{color:var(--gov);border-color:var(--gov)}
.lc-t{font-weight:800;font-size:14px}
.lc-w{font-family:var(--mono);font-size:10.5px;color:var(--faint);font-weight:600;margin-left:6px}
.lc-d{font-size:12.5px;color:var(--mute);margin:3px 0 5px}
.lc-hop code{font-size:11px}

/* tables */
.tbl-wrap{overflow-x:auto;border:1px solid var(--bd);border-radius:11px}
table{border-collapse:collapse;width:100%;font-size:13px;min-width:560px}
table th,table td{text-align:left;padding:9px 13px;border-bottom:1px solid var(--bd);vertical-align:top}
table th{color:var(--faint);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#101318}
table tr:last-child td{border-bottom:none}
table.cmp td:first-child{color:var(--faint);font-weight:600;white-space:nowrap;width:120px}
th.look,td.look{color:var(--look)} th.logic,td.logic{color:var(--logic)} td.cdn{color:var(--cdn)}
.yes{color:var(--gate);font-weight:700} .no{color:var(--fail);font-weight:700}
.m{font-family:var(--mono);font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:5px;border:1px solid}
.m-get{color:var(--gate);border-color:#1c4536} .m-post{color:var(--apply);border-color:#4d3f15}
.m-mix{color:var(--cdn);border-color:#34406b}
.pill{font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;border:1px solid}
.p-ok{color:var(--gate);border-color:#1c4536} .p-warn{color:var(--apply);border-color:#4d3f15}
.p-bad{color:var(--fail);border-color:#5a2330} .p-muted{color:var(--faint);border-color:var(--bd)}

/* apply cards + edges */
.apply-card{border:1px solid var(--bd);border-radius:11px;padding:14px 16px;border-top-width:3px}
.apply-card.c-look{border-top-color:var(--look);background:linear-gradient(180deg,rgba(86,199,245,.06),transparent)}
.apply-card.c-logic{border-top-color:var(--logic);background:linear-gradient(180deg,rgba(242,181,69,.06),transparent)}
.ac-h{font-size:12px;font-weight:800;letter-spacing:.4px;color:var(--mute);margin-bottom:8px}
.c-look .ac-h{color:var(--look)} .c-logic .ac-h{color:var(--logic)}
code.big{display:block;font-size:15px;color:var(--ink);background:#0e1116;border:1px solid var(--bd);
  border-radius:8px;padding:10px 12px}
.ac-f{font-size:11.5px;color:var(--faint);margin-top:8px}
.edges{display:flex;flex-direction:column;gap:9px}
.edge{border:1px solid var(--bd);border-left:3px solid var(--fail);border-radius:9px;padding:9px 13px;background:var(--panel)}
.edge-t{font-weight:800;font-size:13px;color:#ffd0d6}
.edge-d{font-size:12.5px;color:var(--mute);margin-top:2px}

/* poster */
details{border:1px solid var(--bd);border-radius:12px;background:var(--panel);overflow:hidden}
summary{cursor:pointer;padding:12px 16px;font-weight:700;font-size:13px;color:var(--mute);user-select:none}
summary:hover{color:var(--ink)}
.poster-scroll{overflow:auto;max-height:80vh;padding:0 12px 12px;background:#0a0b0d}
.poster-scroll svg{display:block;min-width:1400px;width:100%;height:auto}

footer{max-width:1240px;margin:0 auto;padding:24px 22px 60px;color:var(--faint);font-size:12px;border-top:1px solid var(--bd)}
footer code{font-size:11px}
'''

JS = r'''
const links=[...document.querySelectorAll('nav a')];
const map=new Map(links.map(a=>[a.dataset.sec,a]));
const obs=new IntersectionObserver((es)=>{
  es.forEach(e=>{ if(e.isIntersecting){ links.forEach(l=>l.classList.remove('active'));
    const a=map.get(e.target.id); if(a)a.classList.add('active'); }});
},{rootMargin:'-45% 0px -50% 0px',threshold:0});
document.querySelectorAll('section[id]').forEach(s=>obs.observe(s));
'''

HTML = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Invariance — Complete System Design</title><style>' + CSS + '</style></head><body>'
        '<header class="top"><div class="top-in"><span class="brand">INVARIANCE<span class="dot"> ·</span> system design</span>'
        '<nav>' + nav_html + '</nav></div></header>'
        '<main>'
        '<div class="hero"><h1>The complete system design</h1>'
        '<div class="tagline">End-user customization of a live web app — UI <i>and</i> business logic — under developer-declared invariants. '
        'Two planes, three trust zones, deterministic gates, fail-open everywhere.</div>'
        '<div class="meta">grounded in the repo · sources: docs/INVARIANTS-PIPELINE.md + docs/ONBOARDING-PIPELINE.md + docs/DESIGN.md</div></div>'
        + sections_html +
        '</main>'
        '<footer>Generated by <code>docs/diagrams/gen_page.py</code> — a single self-contained page (no external assets). '
        'Citations are real <code>file:line</code> references; the onboarding pipeline is current design, not yet finalized.</footer>'
        '<script>' + JS + '</script></body></html>')

out = os.path.join(HERE, "index.html")
with open(out, "w") as f:
    f.write(HTML)
print("WROTE", out, f"({len(HTML)} bytes)", "· sections:", len(S))
