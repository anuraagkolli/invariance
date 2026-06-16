#!/usr/bin/env python3
"""
Generate docs/diagrams/index.html — an INTERACTIVE, full-lifecycle architecture map.

Two tiers on one large pannable/zoomable canvas:
  • DEV-TIME (top): onboard an existing repo via pluggable adapters → a migrated
    repo with invariants baked in; plus EVOLVE (ship a new dev feature → lazy migration).
  • RUNTIME (bottom): the three trust zones; end-user authoring (look + logic),
    serving, and governance.
Click any component for detail; pick a flow to light up its path. Self-contained.

Regenerate:  python3 docs/diagrams/gen_app.py
"""
import os, json, html

HERE = os.path.dirname(os.path.abspath(__file__))
DY = 470          # runtime tier vertical offset (dev-time tier sits above)
VW, VH = 1660, 1100

# ----------------------------------------------------------------- runtime nodes (local coords; shifted by DY)
RT = {  # id -> x,y,w,h,title,sub,zone
 "enduser":  (116,40,148,40,"End user","customizes by prompt","actor"),
 "developer":(956,40,148,40,"Developer","declares invariants","actor"),
 "webapp":   (52,122,268,50,"Customer Web App","your product · React + Tailwind","browser"),
 "client":   (52,182,268,72,"@invariance/client","ModLoader · prompt widget · overlay","browser"),
 "gatekeeper":(64,308,120,40,"Gatekeeper","level-gate","browser"),
 "designer": (188,308,120,40,"Designer","LLM → StyleSpec","browser"),
 "compiler": (64,352,120,40,"Compiler","→ role tokens","browser"),
 "verifyv2": (188,352,120,40,"verifyV2","7-test gate","browser"),
 "applylook":(64,398,244,42,"Apply → :root","instant paint, no reload","browser"),
 "frontend": (388,124,268,56,"Frontend host","serves app + SDK bundles","dev"),
 "apiserver":(388,196,268,120,"API Server","@invariance/server · sandbox · enforce","dev"),
 "backend":  (388,336,268,56,"Customer backend / DB","your real data","dev"),
 "authoring":(844,160,176,42,"Authoring","LLM + verifier-in-loop","cp"),
 "verification":(1036,160,176,42,"Verification","deterministic · no LLM","cp"),
 "registry": (844,210,176,42,"Registry","sign · publish · pointers","cp"),
 "analytics":(1036,210,176,42,"Analytics","events → classification","cp"),
 "designstore":(844,260,368,42,"Design + Themes store","look invariants · history · rollback","cp"),
 "postgres": (828,372,188,52,"Postgres","durable source of truth","cp"),
 "llm":      (1040,372,188,52,"LLM","Ollama / Anthropic · authoring only","cp"),
 "console":  (828,440,400,58,"Console","invariants · kill switches · guardrails","cp"),
 "cdn":      (684,468,116,76,"CDN","signed bundles @hash","cdn"),
}
# ----------------------------------------------------------------- dev-time nodes (absolute, top tier)
MIG = {
 "repo":      (56,150,200,104,"Existing repo","GitHub · any React app","mig"),
 "routesrc":  (304,158,206,46,"RouteSource","Next · React Router · manual","mig"),
 "structscan":(522,158,206,46,"Structure scan","JSX → sections","mig"),
 "styleadapt":(304,212,206,46,"Styling adapter","Tailwind · styled-comp","mig"),
 "codemod":   (522,212,206,46,"Codemod","tokens · m.slot · seam","mig"),
 "scanir":    (772,150,180,104,"Scan → IR","OnboardingPlan","mig"),
 "review":    (980,150,176,104,"Console review","names · levels · invariants","mig"),
 "verifyOnb": (1184,150,168,104,"Verify","build · verifyV2 · visual-QA","mig"),
 "migrated":  (1384,128,216,148,"Migrated repo","invariants baked in","mig"),
 "manifestpub":(1384,300,216,58,"Publish manifest","→ registry · lazy migration","mig"),
}
N = {}
for k,(x,y,w,h,t,s,z) in RT.items(): N[k]=(x,y+DY,w,h,t,s,z)
for k,v in MIG.items(): N[k]=v

# ----------------------------------------------------------------- zones, containers, boundary, headers
ZONES = [
 dict(x=36,y=90,w=1582,h=300,tag="DEV-TIME · ONCE",color="mig",
      label="DEV-TIME — onboard & evolve",sub="existing repo → pluggable adapters → migrated repo with invariants baked in"),
 dict(x=36,y=96+DY,w=300,h=470,tag="DATA PLANE",color="browser",
      label="END-USER BROWSER",sub="runs developer-shipped code"),
 dict(x=372,y=96+DY,w=300,h=470,tag="DATA PLANE",color="dev",
      label="DEVELOPER INFRASTRUCTURE",sub="customer-owned · stores nothing durably"),
 dict(x=812,y=96+DY,w=432,h=470,tag="CONTROL PLANE",color="cp",
      label="INVARIANCE CONTROL PLANE",sub="our infra · authors · verifies · signs"),
]
CONTAINERS = [
 dict(x=288,y=104,w=452,h=210,color="#7fd4b0",label="ADAPTERS · pluggable per stack",
      note="discovery + verify are deterministic · the LLM only proposes names & levels"),
 dict(x=828,y=116+DY,w=400,h=236,color="#9aa0ab",label="control-plane monolith · Hono + Postgres"),
 dict(x=52,y=268+DY,w=268,h=206,color="#7fb6d8",label="look authoring + apply · client-side"),
]
BND = dict(x=742,y1=84+DY,y2=566+DY,lx=742,ly=74+DY,ty=86.5+DY)
HEADERS = [
 dict(x=36,y=556,text="RUNTIME — end users customize the live app; no production request ever transits the control plane",color="#9aa0ab"),
]

# ----------------------------------------------------------------- flows
def shift(flow):
    f = dict(flow)
    f["edges"]=[[[x,y+DY] for x,y in e] for e in flow.get("edges",[])]
    if "dashed" in flow: f["dashed"]=[[[x,y+DY] for x,y in e] for e in flow["dashed"]]
    return f

RT_FLOWS = {
 "look": dict(label="Author a look edit", color="#56c7f5", mk="sky",
   nodes=["enduser","gatekeeper","designer","compiler","verifyv2","applylook","designstore"],
   edges=[[[190,80],[190,88],[44,88],[44,328],[64,328]],
          [[184,328],[188,328]],
          [[248,348],[248,350],[124,350],[124,352]],
          [[184,372],[188,372]],
          [[248,392],[248,395],[186,395],[186,398]],
          [[308,419],[354,419],[354,88],[1028,88],[1028,260]]],
   steps=[("enduser","Type a vibe in the in-app panel (CustomizationPanel) — “make it retro.”"),
          ("gatekeeper","Deterministic level-gate decides what's allowed; the LLM only classifies intent."),
          ("designer","Designer LLM → StyleSpec — structured intent, no raw colors. Look authoring happens here, in the browser."),
          ("compiler","Compile → ~38 role tokens; invariants (locked tokens, contrast floor, chroma cap) applied here, not by the LLM."),
          ("verifyv2","7-test gate; on fail it recompiles via a Designer retry — never an unverified spec."),
          ("applylook","root.style.setProperty(:root): instant paint, zero React re-render."),
          ("designstore","WHAT IT UPDATES: the theme is persisted to design-config / themes (history + rollback). On next load the client re-fetches + applies it.")]),
 "logic": dict(label="Author a logic edit", color="#f2b545", mk="amber",
   nodes=["enduser","client","authoring","verification","registry","cdn","llm"],
   edges=[[[190,80],[190,88],[44,88],[44,218],[52,218]],
          [[320,218],[354,218],[354,92],[932,92],[932,160]],
          [[1020,181],[1036,181]],
          [[1124,202],[1124,206],[932,206],[932,210]],
          [[844,231],[818,231],[818,506],[800,506]]],
   steps=[("enduser","Type a logic/data prompt — “only show events I haven't declined.”"),
          ("client","Client submitPrompt() → POST …/subjects/:id/prompts."),
          ("authoring","LLM drafts uiOps + hooks + capabilities; under-declared writes auto-repaired (acorn AST)."),
          ("verification","Deterministic verify gate — NO LLM. Verifier-in-the-loop (retry ≤3). Rejects immutable-field writes + illegal hooks."),
          ("registry","Sign ed25519 over canonical JSON. The prompt is stored in Postgres — never in the bundle (PII)."),
          ("cdn","WHAT IT UPDATES: publish the immutable bundle @hash + set a short-TTL pointer = active. Served per request (next flow).")]),
 "serve": dict(label="Serve a request (hot path)", color="#46d6a0", mk="emer",
   nodes=["enduser","apiserver","cdn","backend"],
   edges=[[[190,80],[190,96],[354,96],[354,256],[388,256]],
          [[656,256],[742,256],[742,468]],
          [[522,316],[522,336]]],
   dashed=[[[388,236],[366,236],[366,100],[190,100],[190,80]]],
   steps=[("enduser","User hits your app — e.g. GET /api/events."),
          ("apiserver","withInvariance intercepts at your API seam."),
          ("cdn","Fetch pointer (cache:no-store, active only) + signed bundle; verifyBundle locally (sha256 + ed25519 + schema)."),
          ("apiserver","QuickJS-WASM sandbox runs hooks under CPU/mem budgets; capability + immutable-multiset checks. Else original payload."),
          ("enduser","HOW IT'S SERVED: transformed (or original — fail-open) response, straight from your server. No request ever transits Invariance.")]),
 "govern": dict(label="Govern & kill-switch", color="#c9b27a", mk="gold",
   nodes=["developer","console","registry"],
   edges=[[[1030,80],[1030,88],[1244,88],[1244,469],[1228,469]],
          [[828,469],[818,469],[818,231],[844,231]]],
   steps=[("developer","Declare invariants and watch usage in the Console."),
          ("console","Flip a kill switch, republish the manifest (lazy migration), or roll a theme back."),
          ("registry","The pointer flips to disabled/stale within its short TTL — propagating without ever touching prod.")]),
}
MIG_FLOWS = {
 "onboard": dict(label="Onboard / migrate a repo", color="#7fd4b0", mk="onb",
   nodes=["repo","routesrc","structscan","styleadapt","codemod","scanir","review","verifyOnb","migrated"],
   edges=[[[256,202],[284,202],[284,181],[304,181]],
          [[728,235],[750,235],[750,202],[772,202]],
          [[952,202],[980,202]],
          [[1156,202],[1184,202]],
          [[1352,202],[1384,202]],
          [[1420,276],[1420,470],[354,470],[354,566]]],
   steps=[("repo","Point Invariance at your existing repo (e.g. compass-calendar: React + react-router + Tailwind/styled-components + Express)."),
          ("routesrc","RouteSource adapter finds the page archetypes — Next file-routing, a React-Router parser, or a manual route map."),
          ("structscan","Structure scanner segments each page's top-level sections via AST."),
          ("styleadapt","Styling adapter clusters colors/fonts → role tokens. Tailwind works today; styled-components is the adapter compass needs."),
          ("codemod","Codemod repoints palette classes → var(--inv-*), wraps sections in <m.slot>, mounts the provider, wraps the API seam (withInvariance)."),
          ("scanir","Produces the OnboardingPlan IR: archetypes · sections · palette · endpoints — framework-agnostic."),
          ("review","You review/edit in the Console: section names, customization levels, invariants. Nothing is load-bearing for safety until you approve."),
          ("verifyOnb","Gate: build · verifyV2 · visual-QA renders identically to the original. ↺ fail → bounded repair loop (re-scan / re-cluster)."),
          ("migrated","Output: a reviewable PR — a wired repo with invariants baked in (role tokens, m.slots, manifest, withInvariance). Deploy it as your app ↓.")]),
 "evolve": dict(label="Ship a new dev feature", color="#e48ad0", mk="evo",
   nodes=["migrated","manifestpub","registry","enduser","apiserver"],
   edges=[[[1490,276],[1490,300]],
          [[1490,358],[1490,510],[1028,510],[1028,566]]],
   steps=[("migrated","Change your app code and ship features as usual — Invariance lives alongside your normal workflow."),
          ("manifestpub","Re-run onboarding or `manifest publish` — a new manifest version (endpoint/section schema bump)."),
          ("registry","Registry marks mods bound to the old version stale. Nothing breaks: superseded bindings are tracked, not deleted."),
          ("enduser","LAZY MIGRATION: the next user session revalidates — pass → keep the mod · fail → degrade to your base app · or offer an AI re-fix.")]),
}
FLOWS = {**MIG_FLOWS, **{k:shift(v) for k,v in RT_FLOWS.items()}}
GROUPS = [("Migrate", ["onboard","evolve"]), ("Runtime", ["look","logic","serve","govern"])]

# ----------------------------------------------------------------- drawer detail
def D(t, where, wcolor, bullets, files=None, why=None):
    return dict(t=t, where=where, wc=wcolor, b=bullets, f=files or [], why=why)
DATA = {
 "repo": D("Your existing repo","dev-time input","mig",
   ["Any React app. We do not require Next.js.",
    "compass-calendar example: react-router-dom v6, Tailwind v4 + styled-components, Express backend, Lerna monorepo.",
    "Nothing is wired yet — no role tokens, no m.slots, no manifest."],
   why="Migration is a one-time, reviewable codemod — you keep your stack, your repo, your deploy."),
 "routesrc": D("RouteSource adapter","onboarding · pluggable","mig",
   ["Turns the app's routing into page archetypes (one route pattern → one template → one key).",
    "Adapters: Next App Router (today), a React-Router parser, or a manual route map.",
    "This is the seam that decouples onboarding from any one framework."],
   ["apps/control-plane/src/modules/onboarding/scan.ts:84"],
   why="The current scanner assumes Next file-routing — a React-Router/manual adapter is what makes a repo like compass onboard."),
 "structscan": D("Structure scanner","onboarding","mig",
   ["AST-segments each page's top-level sections (the children of the main container).",
    "Works on any React app once RouteSource tells it which files are pages.",
    "Vue/Svelte would be additional adapters."],
   why="Sections become the named, leveled m.slots end users may later customize."),
 "styleadapt": D("Styling adapter","onboarding · pluggable","mig",
   ["Clusters observed colors/fonts and repoints them to ~38 role tokens; seeds the default theme.",
    "Tailwind utility classes today. CSS-in-JS (styled-components) and CSS-modules are future adapters.",
    "compass is Tailwind v4 + styled-components — so it needs a styled-components adapter to fully theme."],
   why="Without this adapter, styled-components colors are invisible to theming — the main look-plane gap for compass."),
 "codemod": D("Codemod","onboarding","mig",
   ["Per-file, isolated rewrite: palette classes → var(--inv-*), sections → <m.slot>, mount provider, wrap the API seam.",
    "The one-time “go through every instance” pass."],
   why="After it, no end-user change ever touches your source again — edits change a token/spec, not call sites."),
 "scanir": D("Scan → IR (OnboardingPlan)","onboarding","mig",
   ["The framework-agnostic intermediate representation: archetypes · sections · tokens · fonts · endpoints.",
    "Everything downstream consumes this, not your framework."],
   ["packages/schema/src/onboarding.ts"],
   why="The IR is where framework specifics stop — adapters feed it; the rest of the system never sees React/Next."),
 "review": D("Console review","developer-in-the-loop","mig",
   ["You edit section names, customization levels (0–4), aliases, and invariants before anything merges.",
    "Onboarding ends in a branch/PR you approve."],
   why="Discovery is advisory; you stay in control of what's customizable and what's locked."),
 "verifyOnb": D("Verify (gate)","onboarding · deterministic","mig",
   ["build / typecheck · verifyV2 (token tests) · layout verifier · visual-QA: renders identically on a default theme.",
    "Failure feeds a bounded repair loop (re-segment / re-cluster / re-generate)."],
   why="The codemod must be look-preserving — your app looks identical the moment it's wired."),
 "migrated": D("Migrated repo","dev-time output → deploy","mig",
   ["A reviewable PR: role tokens, m.slots, AppManifest (designSurface + policies), withInvariance at the seam.",
    "Invariants are declared here; the runtime gates re-enforce every one of them.",
    "Deploy it as your normal app — the runtime tier below."],
   why="Onboarding only declares invariants; a mistake here is a coverage bug, never a safety hole — runtime re-checks."),
 "manifestpub": D("Publish manifest","evolve · dev-time","mig",
   ["A new manifest version when you change endpoints/sections (re-onboard or `manifest publish`).",
    "Mods bound to the old version are marked stale (lazy migration)."],
   why="Shipping features doesn't break live mods — they degrade gracefully and revalidate per user."),
 # ---- runtime nodes ----
 "enduser": D("End user","browser","browser",
   ["Reshapes the app in natural language — both look and business logic.",
    "Sees look changes paint instantly; logic changes arrive as transformed API responses.",
    "Never sees a broken app: every failure path falls open to your base behavior."],
   why="Customization becomes a feature your users drive — no bespoke settings UI to build."),
 "developer": D("Developer (you)","control plane","cp",
   ["Declare invariants once (immutable fields, locked tokens, contrast floors, allowed endpoints).",
    "Watch what users change; kill any mod instantly.",
    "The LLM can only propose within your guardrails — it is never in the gate."],
   why="You ship user-customizability without giving up control of your product."),
 "webapp": D("Customer Web App","browser","browser",
   ["Your real product (React + Tailwind), shipped by you.",
    "Components read var(--inv-*) role tokens; customizable regions wrapped in &lt;m.slot&gt;.",
    "Wiring is one-time (the onboarding codemod, above)."],
   why="Onboarding names everything customizable once; later edits change a value, never your call sites."),
 "client": D("@invariance/client — Tier-0 SDK","browser","browser",
   ["ModLoader: fetch signed bundle → verify signature → cache per user + version.",
    "UI overlay engine: token theming · scoped styles · slot swaps.",
    "Prompt widget (submitPrompt) + async telemetry, off the request path."],
   ["packages/client/src/core/loader.ts"],
   why="A thin drop-in. The browser only ever runs static, signature-verified artifacts."),
 "gatekeeper": D("Gatekeeper — look level-gate","browser (look authoring)","browser",
   ["Deterministic permission gate: allowedLevel = min(slot level, page level).",
    "The LLM only classifies intent (THEME / SLOT / clarify / reject) — advisory."],
   ["packages/design/src/agent/gatekeeper.ts:62"],
   why="What's allowed is decided by TypeScript — the model can't widen your permissions."),
 "designer": D("Designer — look authoring LLM","browser (look authoring)","browser",
   ["Turns the prompt into a StyleSpec: structured design intent, no raw color values.",
    "Calls the shared LLM (qwen2.5 via Ollama / Anthropic)."],
   ["packages/design/src/agent/designer.ts:31"],
   why="This is where look authoring happens — client-side, not in the control plane."),
 "compiler": D("Compiler — StyleSpec → tokens","browser (look authoring)","browser",
   ["Deterministically derives ~38 role tokens; locked tokens written last; OKLCH contrast search; chroma cap.",
    "Maps vibe → layout profile (grid / standard)."],
   ["packages/design/src/compiler/compile.ts:27"],
   why="Your look invariants are applied by code at compile time — the model only proposed the vibe."),
 "verifyv2": D("verifyV2 — look invariant gate","browser (look authoring)","browser",
   ["7 deterministic tests: tokens present, locked byte-identical, contrast floor, chroma cap, fonts, vars resolve.",
    "On fail → recompile via a Designer retry (max 2)."],
   ["packages/design/src/verify/compiled-tests.ts:391"],
   why="Same rule as logic — LLM proposes, a deterministic gate disposes — just client-side and bundle-free."),
 "applylook": D("Apply → :root","browser (look apply)","browser",
   ["root.style.setProperty(:root): tokens repaint with zero React re-render.",
    "Fail-open: drop the theme → base CSS. Live-reconciles if you later tighten an invariant."],
   ["packages/design/src/runtime/apply.ts:34"],
   why="No signing, no server round-trip — a value swap in the browser is safe to paint immediately."),
 "frontend": D("Frontend host","developer infra","dev",
   ["Serves your app plus the bundled Invariance client/design SDKs.","Static hosting; holds no Invariance state."],
   why="Nothing new to operate — it’s still just your frontend."),
 "apiserver": D("API Server · @invariance/server — Tier-1","developer infra","dev",
   ["withInvariance / Express middleware wraps your API seam; everything fails open.",
    "InvarianceRuntime: fetch pointer (cache:no-store) + verifyBundle before anything runs.",
    "QuickJS-WASM sandbox: hard CPU/mem budgets, no host bindings, JSON-only boundary.",
    "Enforce: capability writes + immutable fields by multiset (reorder OK, edits rejected)."],
   ["packages/server/src/runtime.ts:226","packages/server/src/enforce.ts:19"],
   why="compass has an Express backend → this works today. Untrusted user logic runs sandboxed at your seam."),
 "backend": D("Customer backend / DB","developer infra","dev",
   ["Your real data and services — the payloads hooks transform on the way out.",
    "Completely untouched unless an active mod matches the endpoint."],
   why="Mods transform responses at the edge; your core stays exactly as it is."),
 "authoring": D("Authoring","control plane","cp",
   ["prompt → LLM draft (uiOps + hooks + capabilities) → derive-writes (acorn) → verifier-in-the-loop.",
    "Agents: qwen2.5 via Ollama (default) or Anthropic (opt-in)."],
   ["apps/control-plane/src/modules/authoring/pipeline.ts:85"],
   why="Generation is paired with the verifier in a repair loop — weak/cheap models still clear your invariants."),
 "verification": D("Verification","control plane","cp",
   ["Deterministic static analysis — literally “no LLM anywhere.”",
    "Rejects illegal hooks (no eval/Function/globalThis/fetch…); immutable-field write containment; budget caps."],
   ["apps/control-plane/src/modules/verification/index.ts:22"],
   why="What’s enforced is enforced by code + crypto, not by a model’s good intentions."),
 "registry": D("Registry","control plane","cp",
   ["Signs (ed25519) and publishes bundles to the CDN; per-subject pointers; kill-switch; lazy migration.",
    "New revisions supersede via the pointer; superseded mods can’t flip back on."],
   ["packages/schema/src/signing.ts:42"],
   why="Two-step distribution: a kill-switch or rollback propagates in seconds while bundles stay cacheable forever."),
 "analytics": D("Analytics","control plane","cp",
   ["Ingests async events; classifies mods by surface touched + capabilities used."],
   why="You see how your product is being customized in aggregate."),
 "designstore": D("Design-config + Themes store","control plane","cp",
   ["Look invariants (design-config) the app reads per request; theme version history + rollback."],
   why="Look governance lives next to your data invariants — one surface, the Console."),
 "postgres": D("Postgres","control plane","cp",
   ["Durable source of truth: manifests, mod revisions, pointers, themes, events.",
    "User prompts (PII) live here — never in a published bundle."],
   why="Prompts (PII) stay control-plane-side; bundles are public-ish and contain none of them."),
 "llm": D("LLM — authoring brain","control plane","cp",
   ["qwen2.5 via Ollama (default, no key) or Anthropic (opt-in).",
    "Used only in authoring. Never in verification, never on the production request path."],
   why="The model is a proposal engine. Pull the plug and your gates + prod path are unaffected."),
 "console": D("Console — developer dashboard","control plane","cp",
   ["The single invariants surface: data invariants + look invariants.",
    "Mods + kill switches · Guardrails (live tests) · Themes/rollback · analytics · onboarding review."],
   why="One place to declare guardrails, test them live, and govern every user’s mods."),
 "cdn": D("CDN — immutable signed bundles","shared / static","cdn",
   ["Content-addressed @hash, cache-control: immutable. Ours or mirrored into your bucket.",
    "Both the browser (look) and your server (logic) read from here at runtime."],
   why="The only thing on your prod path besides your own server — just static, signed bytes."),
}

PITCH = {
 "head":"Let users make your app theirs — without losing control.",
 "items":[
  ("One-time migration","Point us at your existing repo. Pluggable adapters wire it — role tokens, slots, manifest, API seam — as a reviewable PR. You keep your stack.","#7fd4b0"),
  ("Customization as a feature","Users restyle the UI and rewire business logic by prompt. No bespoke settings screens, no forks.","#56c7f5"),
  ("You define the guardrails","Declare invariants — immutable fields, locked tokens, contrast floors, allowed endpoints. The LLM only proposes; deterministic checks + crypto enforce.","#f2b545"),
  ("It can’t break your app","Every failure falls open to your base behavior. Bad mod, bad signature, control-plane down → users just see your original app.","#46d6a0"),
  ("Zero runtime dependency on us","Prod traffic is Browser ↔ your server ↔ CDN. We do authoring + distribution — never request serving.","#9aa6ff"),
  ("Evolve freely","Ship features as usual; a manifest bump marks old mods stale and lazy-migrates them per user — pass, degrade-to-base, or AI re-fix.","#e48ad0"),
 ],
 "foot":"Pick a flow above to watch it light up · click any component for detail · scroll/zoom the canvas to explore."
}

# ================================================================= CSS
CSS = r'''
:root{--bg0:#0a0b0d;--bg1:#0e1014;--panel:#14161b;--panel2:#181b21;--bd:#262a31;--ink:#e9eaee;
--mute:#9aa0ab;--faint:#6b7280;--browser:#56c7f5;--dev:#46d6a0;--cp:#f2b545;--cdn:#9aa6ff;--llm:#b79bff;--mig:#7fd4b0;
--mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 520px at 50% -200px,rgba(86,150,200,.10),transparent 70%),linear-gradient(var(--bg1),var(--bg0));
color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
code{font-family:var(--mono);font-size:.85em;background:#1c2027;border:1px solid var(--bd);border-radius:5px;padding:.5px 5px;color:#cdd3db}
header.top{position:sticky;top:0;z-index:40;backdrop-filter:blur(10px);background:rgba(10,11,13,.85);border-bottom:1px solid var(--bd)}
.top-in{margin:0 auto;padding:9px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:.4px;font-size:14px;white-space:nowrap}.brand .d{color:var(--cp)}
.seg{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.seg-lbl{font:700 9.5px var(--mono);letter-spacing:.6px;text-transform:uppercase;color:var(--faint);margin:0 2px 0 8px}
.seg button{font-size:12px;color:var(--mute);background:#141821;border:1px solid var(--bd);border-radius:8px;
padding:5px 10px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px}
.seg button:hover{color:var(--ink);background:#1b1f28}
.seg button.on{color:#0a0b0d;font-weight:700;background:#cfd4dc;border-color:transparent}
.seg button .sw{width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.9}
.seg button.on .sw{display:none}
.spacer{flex:1}
.zoom{display:flex;gap:3px;align-items:center}
.zoom button{width:28px;height:28px;border-radius:7px;border:1px solid var(--bd);background:#141821;color:var(--mute);cursor:pointer;font-size:14px}
.zoom button:hover{color:var(--ink)}
.ghost{font-size:12px;color:var(--mute);background:transparent;border:1px solid var(--bd);border-radius:8px;padding:6px 10px;cursor:pointer;font-family:inherit}
.ghost:hover{color:var(--ink);border-color:#3a4150}
.hero{padding:14px 20px 2px}
.hero h1{font-size:21px;margin:0 0 3px;font-weight:850;letter-spacing:-.2px}
.hero p{margin:0;color:var(--mute);font-size:13.5px;max-width:1000px}
.stage{padding:12px 18px 26px;display:flex;gap:14px;align-items:flex-start}
.diagram{flex:1;min-width:0}
.frame{background:#0c0e12;border:1px solid var(--bd);border-radius:14px;padding:8px;box-shadow:0 24px 80px rgba(0,0,0,.5);
overflow:auto;max-height:80vh}
svg#map{display:block;border-radius:10px;background:#0c0e12}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin:10px 4px 0;color:var(--faint);font-size:11.5px;align-items:center}
.legend b{color:var(--mute);font-weight:600}.legend .k{display:inline-flex;align-items:center;gap:6px}
.legend .dot{width:9px;height:9px;border-radius:3px;display:inline-block}
.zone{fill-opacity:.045;stroke-opacity:.5}
.zone-l{font:700 12px var(--sans);letter-spacing:.4px}.zone-s{font:500 10px var(--mono)}
.hdr{font:800 12.5px var(--sans);letter-spacing:.2px}
.mono-box{fill:#0f1217;stroke:#2b313b;stroke-dasharray:3 4}
.bnd{stroke:#5a6473;stroke-width:1.4;stroke-dasharray:3 6}.bnd-l{font:700 10px var(--mono);fill:#8b93a1}
.node{cursor:pointer}
.node rect{fill:var(--panel);stroke:#39414e;stroke-width:1.4;transition:stroke .12s,fill .12s}
.node:hover rect{fill:#1b1f28;stroke:#5b6473}
.node .nt{font:800 13px var(--sans);fill:#eef0f3}
.node .ns{font:500 10px var(--mono);fill:#8d94a1}
.node.actor rect{fill:#11151b;stroke-width:1.6}
.node.hero rect{stroke-width:1.8}
.node.dim{opacity:.20}
.node.hl rect{stroke-width:2.6;filter:drop-shadow(0 0 7px var(--hlc))}
.edge{fill:none;stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:8 7;animation:dash 1s linear infinite}
@keyframes dash{to{stroke-dashoffset:-30}}
.drawer{width:384px;flex:none;background:var(--panel);border:1px solid var(--bd);border-radius:14px;
padding:18px;position:sticky;top:64px;max-height:calc(100vh - 80px);overflow:auto}
.dr-pitch h2{font-size:16.5px;margin:.1em 0 .5em;font-weight:850;line-height:1.25}
.pitch-item{display:flex;gap:11px;padding:8px 0;border-top:1px solid var(--bd)}
.pitch-item:first-of-type{border-top:none}
.pi-bar{width:3px;border-radius:3px;flex:none}
.pi-t{font-weight:800;font-size:12.7px}.pi-d{font-size:11.7px;color:var(--mute);margin-top:2px;line-height:1.45}
.dr-foot{margin-top:12px;font-size:11.5px;color:var(--faint);border-top:1px solid var(--bd);padding-top:10px}
.dr-eyebrow{font:700 11px var(--mono);letter-spacing:.5px;text-transform:uppercase}
.dr-title{font-size:17px;font-weight:850;margin:3px 0 8px;line-height:1.2}
.where{display:inline-block;font:600 10.5px var(--mono);padding:2px 9px;border-radius:20px;border:1px solid;margin-bottom:12px}
.w-browser{color:var(--browser);border-color:#1c3a47}.w-dev{color:var(--dev);border-color:#1c4536}
.w-cp{color:var(--cp);border-color:#4d3f15}.w-cdn{color:var(--cdn);border-color:#34406b}.w-mig{color:var(--mig);border-color:#1c4536}
ul.db{margin:.2em 0;padding-left:1.05em;list-style:none}
ul.db li{position:relative;margin:.5em 0;font-size:12.5px;color:var(--mute);line-height:1.5}
ul.db li::before{content:"▹";position:absolute;left:-1em;color:var(--faint)}
.files{margin-top:12px;display:flex;flex-direction:column;gap:5px}
.files code{font-size:11px;color:var(--browser);background:#10222b;border-color:#1c3a47;display:inline-block}
.why{margin-top:14px;border:1px solid var(--bd);border-left:3px solid var(--cp);border-radius:9px;padding:10px 12px;
background:linear-gradient(90deg,rgba(242,181,69,.06),transparent)}
.why .l{font:700 10px var(--mono);letter-spacing:.5px;color:var(--cp);text-transform:uppercase}
.why .t{font-size:12.5px;color:#e7e2d4;margin-top:3px;line-height:1.5}
.steps{counter-reset:s}
.step{display:flex;gap:11px;padding:8px 0;border-top:1px solid var(--bd)}
.step:first-child{border-top:none}
.step .sn{counter-increment:s;flex:none;width:23px;height:23px;border-radius:50%;border:2px solid var(--sc);
color:var(--sc);font:800 11px var(--sans);display:flex;align-items:center;justify-content:center}
.step .sn::before{content:counter(s)}
.step .sx{font-size:12.4px;color:var(--mute);line-height:1.48}.step .sx b{color:var(--ink)}
.back{margin-top:14px}
@media(max-width:1100px){.stage{flex-direction:column}.drawer{width:100%;position:relative;top:0;max-height:none}}
.modal{position:fixed;inset:0;z-index:60;background:rgba(5,6,8,.82);display:none;padding:30px}
.modal.open{display:flex;flex-direction:column}
.modal .mh{display:flex;justify-content:space-between;align-items:center;color:var(--mute);margin-bottom:10px}
.modal .mbody{flex:1;overflow:auto;background:#0a0b0d;border:1px solid var(--bd);border-radius:12px}
.modal svg{display:block;min-width:1400px;width:100%;height:auto}
'''

# ================================================================= JS
JS = r'''
const N=/*N*/, ZONES=/*ZONES*/, CONTAINERS=/*CONTAINERS*/, BND=/*BND*/, HEADERS=/*HEADERS*/, FLOWS=/*FLOWS*/, DATA=/*DATA*/, PITCH=/*PITCH*/, VW=/*VW*/, VH=/*VH*/;
const NS="http://www.w3.org/2000/svg";
const map=document.getElementById("map");
const ZC={browser:"#56c7f5",dev:"#46d6a0",cp:"#f2b545",cdn:"#9aa6ff",actor:"#aeb6c2",mig:"#7fd4b0"};
function E(tag,at,parent){const e=document.createElementNS(NS,tag);for(const k in at)e.setAttribute(k,at[k]);if(parent)parent.appendChild(e);return e;}
const gZ=E("g",{},map),gMono=E("g",{},map),gNd=E("g",{},map),gEd=E("g",{},map);
// zones
for(const z of ZONES){
 E("rect",{x:z.x,y:z.y,width:z.w,height:z.h,rx:14,class:"zone",fill:ZC[z.color],stroke:ZC[z.color]},gZ);
 const t=E("text",{x:z.x+15,y:z.y+23,class:"zone-l",fill:ZC[z.color]},gZ);t.textContent=z.label;
 const s=E("text",{x:z.x+15,y:z.y+39,class:"zone-s",fill:"#8b93a1"},gZ);s.textContent=z.sub;
 const pw=z.tag.length*6+14;
 E("rect",{x:z.x+z.w-pw-12,y:z.y+14,width:pw,height:17,rx:5,fill:"#0a0b0d",stroke:ZC[z.color],"stroke-width":1},gZ);
 const pt=E("text",{x:z.x+z.w-pw/2-12,y:z.y+26,"text-anchor":"middle",class:"zone-s",fill:ZC[z.color]},gZ);pt.textContent=z.tag;
}
for(const hd of HEADERS){const t=E("text",{x:hd.x,y:hd.y,class:"hdr",fill:hd.color},gZ);t.textContent=hd.text;}
// containers + boundary
for(const c of CONTAINERS){
 E("rect",{x:c.x,y:c.y,width:c.w,height:c.h,rx:11,class:"mono-box"},gMono);
 const t=E("text",{x:c.x+14,y:c.y+19,class:"zone-s",fill:c.color},gMono);t.textContent=c.label;
 if(c.note){const n=E("text",{x:c.x+14,y:c.y+c.h-11,class:"zone-s",fill:"#6b7280"},gMono);n.textContent=c.note;}
}
E("line",{x1:BND.x,y1:BND.y1,x2:BND.x,y2:BND.y2,class:"bnd"},gMono);
E("rect",{x:BND.lx-92,y:BND.ly,width:184,height:18,rx:5,fill:"#0a0b0d",stroke:"#3a4150"},gMono);
const bl=E("text",{x:BND.lx,y:BND.ty,"text-anchor":"middle",class:"bnd-l"},gMono);bl.textContent="data plane  ┊  control plane";
// markers
const defs=E("defs",{},map);
for(const k in FLOWS){const f=FLOWS[k];const m=E("marker",{id:"mk_"+f.mk,markerWidth:9,markerHeight:9,refX:6.5,refY:3,orient:"auto",markerUnits:"userSpaceOnUse"},defs);E("path",{d:"M0,0 L6.5,3 L0,6 Z",fill:f.color},m);}
// nodes
const nodeEls={};
for(const id in N){
 const[x,y,w,h,t,s,zone]=N[id];
 const g=E("g",{class:"node"+(zone=="actor"?" actor":"")+((id=="apiserver"||id=="migrated")?" hero":""),"data-id":id},gNd);
 g.style.setProperty("--hlc",ZC[zone]);
 E("rect",{x,y,width:w,height:h,rx:zone=="actor"?20:9},g);
 E("rect",{x,y,width:4,height:h,rx:2,fill:ZC[zone],stroke:"none"},g);
 if(zone=="actor"){E("circle",{cx:x+20,cy:y+15,r:4,fill:ZC[zone]},g);E("path",{d:`M${x+12},${y+30} a8,7 0 0 1 16,0`,fill:"none",stroke:ZC[zone],"stroke-width":1.6},g);}
 const tx=zone=="actor"?x+38:x+16;
 const nt=E("text",{x:tx,y:y+(s?(zone=="actor"?20:22):h/2+4),class:"nt"},g);nt.textContent=t;
 if(s){const ns=E("text",{x:tx,y:y+(zone=="actor"?33:38),class:"ns"},g);ns.textContent=s;}
 g.addEventListener("click",()=>openNode(id));
 nodeEls[id]=g;
}
// interactions
const drawer=document.getElementById("drawer");
function clearEdges(){gEd.innerHTML="";}
function clearBtns(){document.querySelectorAll(".seg button").forEach(b=>{b.style.background="";b.classList.remove("on");});}
function setDim(keep){for(const id in nodeEls){nodeEls[id].classList.toggle("dim",keep&&!keep.has(id));nodeEls[id].classList.toggle("hl",!!(keep&&keep.has(id)));}}
function poly(pts,color,mk){E("path",{d:"M"+pts.map(p=>p[0]+","+p[1]).join(" L"),class:"edge",stroke:color,"marker-end":"url(#mk_"+mk+")"},gEd);}
function showPitch(){
 clearBtns();document.querySelector('.seg button[data-f="overview"]').classList.add("on");
 clearEdges();setDim(null);
 let h='<div class="dr-pitch"><h2>'+PITCH.head+'</h2>';
 for(const[t,d,c] of PITCH.items)h+='<div class="pitch-item"><div class="pi-bar" style="background:'+c+'"></div><div><div class="pi-t">'+t+'</div><div class="pi-d">'+d+'</div></div></div>';
 h+='<div class="dr-foot">'+PITCH.foot+'</div></div>';drawer.innerHTML=h;
}
function openNode(id){
 const d=DATA[id];if(!d)return;clearEdges();clearBtns();
 for(const nid in nodeEls){nodeEls[nid].classList.remove("dim");nodeEls[nid].classList.toggle("hl",nid==id);}
 let h='<div class="dr-eyebrow" style="color:'+ZC[d.wc]+'">component</div><div class="dr-title">'+d.t+'</div>';
 h+='<span class="where w-'+d.wc+'">'+d.where+'</span><ul class="db">';
 for(const b of d.b)h+="<li>"+b+"</li>";h+="</ul>";
 if(d.f.length){h+='<div class="files">';for(const f of d.f)h+="<code>"+f+"</code>";h+="</div>";}
 if(d.why)h+='<div class="why"><div class="l">why it matters</div><div class="t">'+d.why+'</div></div>';
 h+='<div class="back"><button class="ghost" onclick="showPitch()">‹ back to overview</button></div>';drawer.innerHTML=h;
}
function selectFlow(k){
 const f=FLOWS[k];clearBtns();
 const onb=document.querySelector('.seg button[data-f="'+k+'"]');if(onb){onb.classList.add("on");onb.style.background=f.color;}
 clearEdges();setDim(new Set(f.nodes));
 (f.edges||[]).forEach(e=>poly(e,f.color,f.mk));(f.dashed||[]).forEach(e=>poly(e,f.color,f.mk));
 let h='<div class="dr-eyebrow" style="color:'+f.color+'">flow</div><div class="dr-title">'+f.label+'</div><div class="steps" style="--sc:'+f.color+'">';
 for(const[nid,tx] of f.steps)h+='<div class="step"><div class="sn"></div><div class="sx"><b>'+N[nid][4]+'.</b> '+tx+'</div></div>';
 h+='</div><div class="back"><button class="ghost" onclick="showPitch()">‹ back to overview</button></div>';drawer.innerHTML=h;
}
document.querySelectorAll(".seg button").forEach(b=>{b.addEventListener("click",()=>{const f=b.dataset.f;f=="overview"?showPitch():selectFlow(f);});});
document.querySelectorAll(".seg button").forEach(b=>{if(b.dataset.f!="overview")b.querySelector(".sw").style.color=FLOWS[b.dataset.f].color;});
// zoom + pan
const frame=document.querySelector(".frame");let zoom=1;
function applyZoom(){map.style.width=(VW*zoom)+"px";map.style.height=(VH*zoom)+"px";}
function fit(){zoom=Math.max(.3,Math.min(1.3,(frame.clientWidth-18)/VW));applyZoom();}
document.getElementById("zin").onclick=()=>{zoom=Math.min(2.2,zoom*1.18);applyZoom();};
document.getElementById("zout").onclick=()=>{zoom=Math.max(.25,zoom/1.18);applyZoom();};
document.getElementById("zfit").onclick=fit;
// poster modal
const modal=document.getElementById("modal");
document.getElementById("posterBtn").addEventListener("click",()=>modal.classList.add("open"));
document.getElementById("posterClose").addEventListener("click",()=>modal.classList.remove("open"));
modal.addEventListener("click",e=>{if(e.target==modal)modal.classList.remove("open");});
fit();showPitch();
'''

def inject(js):
    for k,v in {"/*N*/":N,"/*ZONES*/":ZONES,"/*CONTAINERS*/":CONTAINERS,"/*BND*/":BND,"/*HEADERS*/":HEADERS,
                "/*FLOWS*/":FLOWS,"/*DATA*/":DATA,"/*PITCH*/":PITCH,"/*VW*/":VW,"/*VH*/":VH}.items():
        js = js.replace(k, json.dumps(v))
    return js

# flow buttons (grouped dev-time vs runtime)
flow_btns = '<button data-f="overview" class="on">Overview</button>'
for gl, ks in GROUPS:
    flow_btns += f'<span class="seg-lbl">{gl}</span>'
    flow_btns += "".join(f'<button data-f="{k}"><span class="sw"></span>{html.escape(FLOWS[k]["label"])}</button>' for k in ks)

poster = ""
p = os.path.join(HERE,"system-design.svg")
if os.path.exists(p): poster = open(p).read()

HTML = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width, initial-scale=1">'
 '<title>Invariance — Interactive Architecture</title><style>'+CSS+'</style></head><body>'
 '<header class="top"><div class="top-in"><span class="brand">INVARIANCE<span class="d"> ·</span> lifecycle</span>'
 '<div class="seg">'+flow_btns+'</div><div class="spacer"></div>'
 '<div class="zoom"><button id="zout">−</button><button id="zfit">fit</button><button id="zin">+</button></div>'
 '<button class="ghost" id="posterBtn">Pipeline poster ↗</button></div></header>'
 '<div class="hero"><h1>From an existing repo to a live, user-customizable app — click to explore</h1>'
 '<p>Top tier = <b>dev-time</b>: onboard an existing repo through pluggable adapters into a migrated repo with invariants baked in (and how new features evolve). '
 'Bottom tier = <b>runtime</b>: end users author look + logic changes, and how those are served. Pick a flow to light up its path; scroll / zoom to explore.</p></div>'
 '<div class="stage"><div class="diagram"><div class="frame">'
 '<svg id="map" viewBox="0 0 '+str(VW)+' '+str(VH)+'" xmlns="http://www.w3.org/2000/svg"></svg></div>'
 '<div class="legend"><span class="k"><b>Zones:</b></span>'
 '<span class="k"><span class="dot" style="background:#7fd4b0"></span>dev-time (onboard/evolve)</span>'
 '<span class="k"><span class="dot" style="background:#56c7f5"></span>browser</span>'
 '<span class="k"><span class="dot" style="background:#46d6a0"></span>developer infra</span>'
 '<span class="k"><span class="dot" style="background:#f2b545"></span>control plane</span>'
 '<span class="k"><span class="dot" style="background:#9aa6ff"></span>CDN</span>'
 '<span class="k" style="margin-left:auto">drag/scroll the canvas · − fit + to zoom</span></div></div>'
 '<aside class="drawer" id="drawer"></aside></div>'
 '<div class="modal" id="modal"><div class="mh"><span>Detailed pipeline poster — the same system as a single dense diagram (scroll)</span>'
 '<button class="ghost" id="posterClose">Close ✕</button></div><div class="mbody">'+poster+'</div></div>'
 '<script>'+inject(JS)+'</script></body></html>')

out = os.path.join(HERE,"index.html")
open(out,"w").write(HTML)
print("WROTE", out, f"({len(HTML)} bytes) · nodes:{len(N)} flows:{len(FLOWS)} canvas:{VW}x{VH}")
