#!/usr/bin/env python3
"""
Generate the Invariance system-design poster as a self-contained SVG (+ HTML wrapper).

Source of truth: docs/INVARIANTS-PIPELINE.md and docs/ONBOARDING-PIPELINE.md, grounded
against the repo. Layout is computed here so spacing/alignment is deterministic and the
output can be validated (well-formed XML, in-bounds, non-overlapping) without a browser.

Run:  python3 docs/diagrams/gen_system_design.py
Out:  docs/diagrams/system-design.svg , docs/diagrams/system-design.html
"""
from html import escape as _esc
import os

# ----------------------------------------------------------------------------- palette
BG0      = "#0a0b0d"
BG1      = "#101216"
PANEL    = "#15171c"
PANEL2   = "#191c22"
BORDER   = "#2a2e37"
INK      = "#e9eaee"
MUTE     = "#9aa0ab"
FAINT    = "#6b7280"

LOOK     = "#56c7f5"   # look / design plane (sky)
LOOK_D   = "#12313f"
LOGIC    = "#f2b545"   # business-logic plane (amber)
LOGIC_D  = "#3a2c10"
GATE     = "#46d6a0"   # deterministic verify gates (emerald)
GATE_D   = "#0f2a22"
LLM      = "#b79bff"   # LLM-proposes (violet)
LLM_D    = "#241d3a"
DET      = "#9aa6b8"   # deterministic (slate)
DET_D    = "#20242c"
APPLY    = "#ffd66b"   # the moment it goes live (gold)
FAIL     = "#fb7185"   # fail-open / reject (rose)
ONB      = "#7fd4b0"   # onboarding band accent

W = 1520
PAD = 46
CX0, CX1 = PAD, W - PAD
CW = CX1 - CX0

# accumulating element list + max-y tracker -----------------------------------
parts = []
defs = []
_maxy = [0.0]
def emit(s): parts.append(s)
def bump(y): _maxy[0] = max(_maxy[0], y)

def esc(t): return _esc(str(t), quote=True)

def rrect(x, y, w, h, r, fill, stroke=None, sw=1.4, opacity=1.0, dash=None, extra=""):
    s = f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r:.1f}" ry="{r:.1f}" fill="{fill}"'
    if stroke: s += f' stroke="{stroke}" stroke-width="{sw}"'
    if opacity != 1.0: s += f' opacity="{opacity}"'
    if dash: s += f' stroke-dasharray="{dash}"'
    if extra: s += " " + extra
    s += "/>"
    bump(y + h)
    return s

def text(x, y, s, size=13, fill=INK, weight="400", anchor="start", mono=False, ls=None, op=None, italic=False):
    fam = "ui-monospace,'SF Mono',Menlo,Consolas,monospace" if mono else \
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif"
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    l = f' letter-spacing="{ls}"' if ls else ""
    o = f' opacity="{op}"' if op else ""
    i = ' font-style="italic"' if italic else ""
    bump(y + size * 0.4)
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}"{a}{l}{o}{i}>{esc(s)}</text>')

def badge(x, y, label, fg, bg, mono=True):
    """small pill, returns width."""
    w = 11 + len(label) * (6.3 if mono else 6.8)
    h = 17
    emit(rrect(x, y, w, h, 5, bg, stroke=fg, sw=1.0, opacity=0.95))
    emit(text(x + w/2, y + 12.4, label, size=10.3, fill=fg, weight="700", anchor="middle", mono=mono, ls="0.3"))
    return w

def varrow(x, y0, y1, color=FAINT, label=None, lw=1.8):
    emit(f'<line x1="{x:.1f}" y1="{y0:.1f}" x2="{x:.1f}" y2="{y1-7:.1f}" stroke="{color}" stroke-width="{lw}"/>')
    emit(f'<path d="M{x-5:.1f},{y1-8:.1f} L{x+5:.1f},{y1-8:.1f} L{x:.1f},{y1:.1f} Z" fill="{color}"/>')
    if label:
        emit(text(x + 9, (y0+y1)/2 + 3.5, label, size=10.5, fill=color, weight="700", mono=True))
    bump(y1)

def path_arrow(d, color=FAINT, lw=1.8, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    emit(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{lw}"{da} marker-end="url(#ah_{color.strip("#")})"/>')

# ensure an arrowhead marker exists for a color
_markers = set()
def need_marker(color):
    if color in _markers: return
    _markers.add(color)
    cid = color.strip("#")
    defs.append(f'<marker id="ah_{cid}" markerWidth="9" markerHeight="9" refX="6.5" refY="3" '
                f'orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6.5,3 L0,6 Z" fill="{color}"/></marker>')
for c in (FAINT, LOOK, LOGIC, GATE, APPLY, ONB, MUTE):
    need_marker(c)

# ============================================================================ DEFS
defs.append(f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{BG1}"/><stop offset="1" stop-color="{BG0}"/></linearGradient>''')
defs.append(f'''<radialGradient id="vig" cx="0.5" cy="0.12" r="0.9">
  <stop offset="0" stop-color="#1b2030" stop-opacity="0.55"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>''')
defs.append('''<pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
  <path d="M34 0 H0 V34" fill="none" stroke="#ffffff" stroke-opacity="0.022" stroke-width="1"/></pattern>''')
for name, col in (("look", LOOK), ("logic", LOGIC), ("gate", GATE), ("apply", APPLY), ("onb", ONB)):
    defs.append(f'''<linearGradient id="lane_{name}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{col}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="{col}" stop-opacity="0.015"/></linearGradient>''')
defs.append(f'<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>')

# ============================================================================ NODE
BADGE_STYLE = {
    "det":   ("det",  DET,   DET_D),
    "llm":   ("LLM",  LLM,   LLM_D),
    "gate":  ("gate", GATE,  GATE_D),
    "apply": ("APPLY",APPLY, "#332a10"),
    "entry": ("entry",MUTE,  "#22252c"),
    "rev":   ("review",ONB,  "#13241d"),
}

def nh(it):
    """Auto height for a node spec: title band + content lines + bottom band."""
    cnt = len(it.get("l") or []) + (1 if it.get("fail") else 0)
    needed = 30 + cnt*15 + 26
    return max(it.get("h", 0), needed)

def node(x, y, w, h, title, lines=None, accent=BORDER, badges=None, file=None,
         fail=None, retry=None, glow=False, title_size=14.5, lab=None, lab_col=None):
    """One box. Returns bottom y. Height auto-grows to fit content."""
    lines = lines or []
    cnt = len(lines) + (1 if fail else 0)
    h = max(h, 30 + cnt*15 + 26)
    if glow:
        emit(rrect(x-5, y-5, w+10, h+10, 16, accent, opacity=0.12))
        emit(rrect(x-5, y-5, w+10, h+10, 16, "none", stroke=accent, sw=1.0, opacity=0.5))
    sw = 2.0 if glow else 1.5
    emit(rrect(x, y, w, h, 11, PANEL, stroke=accent, sw=sw))
    emit(rrect(x, y, 4.5, h, 3, accent))  # left accent bar
    # optional corner ribbon label (e.g. "GATE", "LIVE") — never co-occurs with badges
    if lab:
        lc = lab_col or accent
        lw_ = 11 + len(lab)*7.2
        emit(rrect(x + w - lw_ - 12, y - 9, lw_, 18, 5, BG0, stroke=lc, sw=1.2))
        emit(text(x + w - lw_/2 - 12, y + 3.4, lab, size=10.6, fill=lc, weight="800", anchor="middle", mono=True, ls="0.6"))
    # badges: top-right, on the title row
    if badges:
        bw_tot = 0
        widths = []
        for b in badges:
            lab_, fg, bgc = BADGE_STYLE[b]
            wseg = 11 + len(lab_) * 6.3
            widths.append((lab_, fg, bgc, wseg)); bw_tot += wseg + 6
        bx = x + w - 14 - (bw_tot - 6)
        for lab_, fg, bgc, wseg in widths:
            badge(bx, y + 7, lab_, fg, bgc); bx += wseg + 6
    # title + content
    emit(text(x + 17, y + 20, title, size=title_size, fill=INK, weight="700"))
    ty = y + 35
    for ln in lines:
        emit(text(x + 17, ty, ln, size=11.6, fill=MUTE, weight="400")); ty += 15
    if fail:
        emit(text(x + 17, ty, "↳ " + fail, size=11.2, fill=FAIL, weight="600")); ty += 15
    # bottom band: retry pill (left), file:line (right)
    if retry:
        rw = 13 + len(retry)*6.0
        emit(rrect(x + 15, y + h - 25, rw, 17, 5, "#2a1414", stroke=FAIL, sw=1.0))
        emit(text(x + 15 + rw/2, y + h - 13.2, retry, size=10.0, fill=FAIL, weight="700", anchor="middle", mono=True))
    if file:
        emit(text(x + w - 14, y + h - 12, file, size=10.6, fill=accent, weight="600", anchor="end", mono=True))
    bump(y + h)
    return y + h

# ============================================================================ HEADER
emit(rrect(0, 0, W, 10, 0, "none"))  # noop to seed
y = 40
emit(text(CX0, y + 18, "INVARIANCE", size=15, fill=LOOK, weight="800", ls="3.4", mono=True))
emit(text(CX1, y + 18, "system design · two planes, three pipelines", size=12.5, fill=FAINT, anchor="end", mono=True, ls="0.4"))
y += 34
emit(text(CX0, y + 28, "End-user customization of live web apps — under developer-declared invariants", size=29, fill=INK, weight="800"))
y += 52
emit(text(CX0, y + 14, "The governing rule, everywhere below:  the LLM is in the loop, never in the gate — it only proposes; what's enforced is enforced by deterministic TypeScript + crypto.",
          size=13.5, fill=MUTE, weight="500"))
y += 22
emit(text(CX0, y + 14, "Source: docs/INVARIANTS-PIPELINE.md + docs/ONBOARDING-PIPELINE.md, traced to repo (file:line citations are real).",
          size=11.5, fill=FAINT, weight="400", mono=True))
y += 40

# ============================================================================ BAND 1 — ONBOARDING
band_top = y
# band header
emit(rrect(CX0, y, CW, 30, 8, "url(#lane_onb)", stroke=ONB, sw=1.0, opacity=1))
badge(CX0 + 12, y + 6, "DEVELOPER-TIME · RUNS ONCE", ONB, "#10241c")
emit(text(CX0 + 230, y + 20, "ONBOARDING / SCANNER PIPELINE", size=14.5, fill=INK, weight="800", ls="0.4"))
emit(text(CX0 + 470, y + 20, "raw, un-wired multi-page app  →  governable app", size=12.5, fill=MUTE, weight="500"))
emit(text(CX1 - 12, y + 20, "React + Tailwind · fan-out · design NOT finalized", size=11, fill=FAINT, anchor="end", mono=True))
y += 44

# 7 stage chips
chips = [
    ("1", "Discover archetypes",   ["router walk → route", "patterns; [id] ⇒ 1"], "det"),
    ("2", "Per-archetype map",     ["AST sections;", "LLM names/levels/grammar"], "detllm"),
    ("3", "Reconcile palette",     ["merge clusters → role", "tokens; seed default"], "det"),
    ("4", "Generate artifacts",    ["tailwind.config · manifest", "designSurface · layout.ts"], "det"),
    ("5", "Codemod",               ["repoint classes · wrap", "m.slot · mount provider"], "det"),
    ("6", "Verify",                ["build · verifyV2 · layout", "verifier · visual-QA=before"], "gate"),
    ("7", "Reviewable diff",       ["branch/PR → dev edits", "names/levels → merge"], "rev"),
]
n = len(chips)
gap = 16
chw = (CW - gap*(n-1)) / n
chh = 96
cy = y
for i, (num, ttl, subs, kind) in enumerate(chips):
    cxp = CX0 + i*(chw+gap)
    accent = {"det":DET,"detllm":LLM,"gate":GATE,"rev":ONB}[kind]
    emit(rrect(cxp, cy, chw, chh, 10, PANEL2, stroke=BORDER, sw=1.3))
    emit(rrect(cxp, cy, chw, 4, 2, accent, opacity=0.85))
    emit(text(cxp + 13, cy + 25, num, size=15, fill=accent, weight="800", mono=True))
    emit(text(cxp + 30, cy + 25, ttl, size=12.6, fill=INK, weight="700"))
    yy = cy + 43
    for s in subs:
        emit(text(cxp + 13, yy, s, size=10.0, fill=MUTE)); yy += 13
    # tag(s)
    if kind == "detllm":
        bx = cxp + 12; bx += badge(bx, cy+chh-25, "det", DET, DET_D)+5; badge(bx, cy+chh-25, "LLM", LLM, LLM_D)
    else:
        lab_, fg, bgc = BADGE_STYLE[{"det":"det","gate":"gate","rev":"rev"}[kind]]
        badge(cxp + 12, cy+chh-25, lab_, fg, bgc)
    if i < n-1:  # chevron in gap
        gxc = cxp + chw + gap/2
        gyc = cy + chh/2
        emit(f'<path d="M{gxc-4:.1f},{gyc-6:.1f} L{gxc+4:.1f},{gyc:.1f} L{gxc-4:.1f},{gyc+6:.1f}" fill="none" stroke="{FAINT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')
# barrier note under chip 3
emit(text(CX0 + 2*(chw+gap) + chw/2, cy + chh + 13, "▲ barrier: needs every archetype's palette", size=9.6, fill=FAINT, anchor="middle", italic=True))
# repair loop note under chip 6
emit(text(CX0 + 5*(chw+gap) + chw/2, cy + chh + 13, "↺ fail → bounded repair loop", size=9.6, fill=FAIL, anchor="middle", italic=True))
y = cy + chh + 22

# down arrow to outputs
varrow(CX0 + CW/2, y, y+20, color=ONB)
y += 20

# output bar: three centralization layers → wired app
obh = 86
emit(rrect(CX0, y, CW, obh, 11, PANEL, stroke=BORDER, sw=1.3))
emit(text(CX0 + 18, y + 22, "OUTPUT — three centralization layers (name everything customizable once; later changes edit a name's value, never call sites)",
          size=12.5, fill=INK, weight="700"))
layers = [
    ("Token",     "var(--inv-*) · ~role tokens", "CSS cascade → every page, instantly", LOOK),
    ("Archetype", "designSurface: patterns + sections + levels", "1 template → all its URLs", ONB),
    ("Layout",    "LayoutSpec grammar per archetype", "archetype key → every page of type", LOGIC),
]
lw = (CW*0.62 - 2*14) / 3
lx = CX0 + 16
ly = y + 34
for nm, a, b, col in layers:
    emit(rrect(lx, ly, lw, 40, 8, PANEL2, stroke=col, sw=1.2, opacity=0.95))
    emit(rrect(lx, ly, 3.5, 40, 2, col))
    emit(text(lx + 12, ly + 16, nm, size=11.8, fill=col, weight="800"))
    emit(text(lx + 12, ly + 30, a, size=9.3, fill=MUTE))
    emit(text(lx + 12, ly + 40 - 0, "", size=9))  # spacer
    lx += lw + 14
# arrow → wired app
ax = CX0 + CW*0.62 + 6
emit(f'<path d="M{ax:.1f},{y+obh/2:.1f} L{ax+26:.1f},{y+obh/2:.1f}" stroke="{ONB}" stroke-width="2" marker-end="url(#ah_{ONB.strip("#")})"/>')
wx = ax + 34
ww = CX1 - wx - 16
emit(rrect(wx, y + 16, ww, obh - 32, 9, "url(#lane_onb)", stroke=ONB, sw=1.5))
emit(text(wx + ww/2, y + 36, "WIRED APP", size=13.5, fill=ONB, weight="800", anchor="middle", ls="0.6"))
emit(text(wx + ww/2, y + 52, "role tokens · m.slots · manifest · LayoutSpec", size=10.2, fill=MUTE, anchor="middle"))
y += obh + 8

# handoff connector
hy = y
emit(f'<line x1="{CX0+CW/2:.1f}" y1="{hy:.1f}" x2="{CX0+CW/2:.1f}" y2="{hy+26:.1f}" stroke="{FAINT}" stroke-width="1.8" stroke-dasharray="5 4"/>')
emit(text(CX0 + CW/2 + 12, hy + 17, "hands off to the runtime pipelines  ▼", size=11, fill=FAINT, weight="700", mono=True))
emit(f'<path d="M{CX0+CW/2-5:.1f},{hy+26:.1f} L{CX0+CW/2+5:.1f},{hy+26:.1f} L{CX0+CW/2:.1f},{hy+34:.1f} Z" fill="{FAINT}"/>')
y += 44

# ============================================================================ BAND 2 — RUNTIME
emit(rrect(CX0, y, CW, 30, 8, "#15171c", stroke=BORDER, sw=1.0))
badge(CX0 + 12, y + 6, "END-USER · EVERY PROMPT · LIVE", APPLY, "#332a10")
emit(text(CX0 + 250, y + 20, "RUNTIME — the invariants pipeline", size=14.5, fill=INK, weight="800", ls="0.4"))
emit(text(CX0 + 540, y + 20, "one prompt, classified into two planes with two different “apply” moments", size=12, fill=MUTE))
y += 46

# USER PROMPT node centered
midx = CX0 + CW/2
up_w, up_h = 360, 50
node(midx - up_w/2, y, up_w, up_h, "USER PROMPT", ["typed into the in-app widget"], accent=INK, title_size=15)
emit(text(midx, y + 31, "", size=9))
y += up_h + 14
# classifier
cl_w, cl_h = 470, 40
emit(rrect(midx - cl_w/2, y, cl_w, cl_h, 20, PANEL2, stroke=FAINT, sw=1.4))
emit(text(midx, y + 18, "classify intent", size=11.5, fill=MUTE, anchor="middle", weight="700"))
emit(text(midx, y + 32, "theme / look   ◀——————▶   logic / data", size=12, fill=INK, anchor="middle", weight="700", mono=True))
cl_bottom = y + cl_h
y += cl_h

# lane geometry
laneW = 690
lpad = 24
LX = CX0
RX = CX1 - laneW
node_w = laneW - 2*lpad
lane_head_y = y + 30

# fan-out arrows from classifier to each lane header
lhdr_y = lane_head_y
Lcx = LX + laneW/2
Rcx = RX + laneW/2
path_arrow(f"M{midx-70:.1f},{cl_bottom:.1f} C{Lcx:.1f},{cl_bottom+18:.1f} {Lcx:.1f},{cl_bottom+10:.1f} {Lcx:.1f},{lhdr_y-2:.1f}", color=LOOK, lw=2.0)
path_arrow(f"M{midx+70:.1f},{cl_bottom:.1f} C{Rcx:.1f},{cl_bottom+18:.1f} {Rcx:.1f},{cl_bottom+10:.1f} {Rcx:.1f},{lhdr_y-2:.1f}", color=LOGIC, lw=2.0)

# lane background panels (drawn first, behind). We'll compute heights after, so reserve by drawing later.
# To draw backgrounds behind nodes, we precompute node stacks, then render bg, then nodes.
# Simpladx: build node draw closures.

# ---- LEFT LANE (LOOK) -------------------------------------------------------
def stack(lane_x, start_y, header, header_col, header_sub, items):
    """items: list of dicts. returns bottom y. draws header + nodes + down arrows."""
    cxn = lane_x + lpad
    # header
    hh = 46
    emit(rrect(lane_x + lpad, start_y, node_w, hh, 9, "none", stroke=header_col, sw=1.6))
    emit(rrect(lane_x + lpad, start_y, node_w, hh, 9, f"url(#lane_{header['grad']})", stroke="none"))
    emit(text(cxn + 16, start_y + 20, header["t"], size=15, fill=header_col, weight="800", ls="0.3"))
    emit(text(cxn + 16, start_y + 37, header["s"], size=11, fill=MUTE, weight="500"))
    if header.get("r"):
        emit(text(lane_x + lpad + node_w - 14, start_y + 27, header["r"], size=10.5, fill=header_col, anchor="end", mono=True, weight="700"))
    yy = start_y + hh
    cxc = lane_x + laneW/2
    for it in items:
        if it.get("sub"):  # sub-divider
            yy += 16
            emit(f'<line x1="{cxn:.1f}" y1="{yy:.1f}" x2="{cxn+node_w:.1f}" y2="{yy:.1f}" stroke="{it["col"]}" stroke-width="1" stroke-dasharray="4 4" opacity="0.7"/>')
            emit(rrect(cxn, yy-10, 11+len(it["sub"])*6.6, 20, 5, BG0, stroke=it["col"], sw=1.0))
            emit(text(cxn + (11+len(it["sub"])*6.6)/2, yy+3.6, it["sub"], size=10.4, fill=it["col"], weight="800", anchor="middle", mono=True, ls="0.4"))
            if it.get("note"):
                emit(text(cxn + node_w, yy+3.6, it["note"], size=9.6, fill=FAINT, anchor="end", italic=True))
            yy += 16
            continue
        # arrow gap before node (except right after header/subdivider handled by spacing)
        gaptop = yy
        yy += it.get("gap", 24)
        ac = it.get("col", header_col)
        vcol = it.get("arrow", FAINT)
        vlab = it.get("alab")
        varrow(cxc, gaptop + 4, yy - 2, color=vcol, label=vlab)
        yy = node(cxn, yy, node_w, it["h"], it["t"], it.get("l"), accent=ac,
                  badges=it.get("b"), file=it.get("f"), fail=it.get("fail"),
                  retry=it.get("retry"), glow=it.get("glow", False), lab=it.get("lab"), lab_col=it.get("labc"))
    return yy

look_header = {"t": "LOOK PLANE", "s": "@invariance/design · runs in the browser, live", "grad": "look", "r": "client-side"}
look_items = [
    dict(t="Gatekeeper — level gate", h=70, col=GATE, b=["det","llm"],
         l=["deterministic allowedLevel = min(slot, page);", "LLM only classifies intent (advisory)"],
         f="gatekeeper.ts:62", gap=14),
    dict(t="Designer LLM → StyleSpec", h=62, col=LLM, b=["llm"],
         l=["structured design intent —", "no raw color values"], f="designer.ts:31"),
    dict(t="Compiler → 38 role tokens", h=72, col=DET, b=["det"],
         l=["OKLCH contrast search; locked tokens", "written last & override; chroma cap"], f="compile.ts:27"),
    dict(t="Layout profile", h=56, col=DET, b=["det"],
         l=["vibe axes → grid / standard preset"], f="layout-profile.ts:15"),
    dict(t="verifyV2 — INVARIANT GATE", h=74, col=GATE, glow=False, lab="GATE", labc=GATE,
         l=["7 deterministic tests: tokens present, locked", "byte-equal, contrast floor, chroma cap, fonts"],
         f="compiled-tests.ts:391", retry="✗ → retry ≤2 (re-enter Designer)",
         arrow=GATE, alab="ok ↓"),
    dict(t="persistAndApply → applyAnyTheme", h=52, col=DET,
         l=["save → themeStore.setTheme"], f="pipeline-io.ts:30"),
    dict(t="APPLY  ·  root.style.setProperty(:root)", h=78, col=APPLY, glow=True, lab="LIVE", labc=APPLY,
         l=["the change is visible the instant this runs —", "pure CSS cascade, zero React re-render"],
         f="runtime/apply.ts:34", fail="fail → drop theme, base CSS wins", arrow=APPLY, alab="pass"),
]

# ---- RIGHT LANE (BUSINESS-LOGIC) --------------------------------------------
logic_header = {"t": "BUSINESS-LOGIC PLANE", "s": "control-plane (build) + @invariance/server (run)", "grad": "logic", "r": "signed bundles"}
logic_items = [
    dict(sub="CONTROL PLANE — authoring (build the bundle)", col=LOGIC, note="our infra"),
    dict(t="POST …/subjects/:id/prompts → authorMod", h=56, col=MUTE, b=["entry"],
         l=["prompt ≤2000 chars; no LLM → 503"], f="authoring/pipeline.ts:85", gap=12),
    dict(t="LLM draft: uiOps + hooks + capabilities", h=58, col=LLM, b=["llm"],
         l=["model proposes the mod"], f="generateDraft"),
    dict(t="deriveRepairedWrites (acorn AST)", h=62, col=DET, b=["det"],
         l=["walks each hook; widens under-declared", "writes so they aren't silently dropped"], f="derive-writes.ts"),
    dict(t="VERIFY GATE — deterministic, NO LLM", h=92, col=GATE, lab="GATE", labc=GATE,
         l=["manifest binding · uiOps≤200 · token/CSS safety;", "AST hook legality (no eval/fetch/globalThis…);",
            "immutable-field write containment; budget caps"],
         f="verification/index.ts:22", retry="✗ → retry ≤3 (verifier-in-loop)", arrow=GATE, alab="ok ↓"),
    dict(t="SIGN — canonical JSON + ed25519", h=74, col=APPLY, glow=True, lab="SEALED", labc=APPLY,
         l=["sorted-key serialize → sha256 contentHash →", "ed25519 envelope · prompt → ModRecord, NOT bundle"],
         f="signing.ts:42", arrow=APPLY, alab="ok"),
    dict(t="DISTRIBUTE — two-step", h=66, col=LOGIC,
         l=["immutable bundle @hash on CDN  +  per-subject", "pointer (~5s TTL: active|stale|disabled)"], f="registry.ts:126"),
    dict(sub="CUSTOMER INFRA — runtime (takes effect)", col=LOGIC, note="no prod request transits Invariance"),
    dict(t="real API request → withInvariance(handler)", h=56, col=MUTE,
         l=["e.g. Nebula GET /api/shows"], f="invariance-server.ts:6", gap=12),
    dict(t="fetch pointer (cache:no-store) · active only", h=76, col=GATE, lab="GATE", labc=GATE,
         l=["verifyBundle: re-check sha256 + ed25519", "+ re-parse schema  (cached by hash, immutable)"],
         f="runtime.ts:136", fail="any failure → null → fail-open", arrow=GATE, alab="verified ↓"),
    dict(t="QuickJS-WASM sandbox", h=60, col=DET,
         l=["fresh runtime/hook · CPU+mem budgets ·", "no host bindings · JSON-only boundary"], f="sandbox.ts:33"),
    dict(t="checkCapabilityWrites + checkFieldConstraints", h=76, col=DET, b=["det"],
         l=["per-hook diffPaths bounds writes; immutable", "fields by multiset — reorder OK, edit rejected"],
         f="enforce.ts:19", fail="violation → discard hook / original payload"),
    dict(t="APPLY  ·  current = execution.result → response", h=80, col=APPLY, glow=True, lab="LIVE", labc=APPLY,
         l=["kept only after signature + capability +", "immutable-multiset checks all pass"],
         f="runtime.ts:226", fail="any exception → original payload (fail-open)", arrow=APPLY, alab="pass"),
]

# draw lane background panels sized to content — measure by a dry pass using a temp buffer
def measure_stack(items):
    yy = 46  # header
    for it in items:
        if it.get("sub"):
            yy += 32; continue
        yy += it.get("gap", 24) + nh(it)
    return yy

left_h = measure_stack(look_items)
right_h = measure_stack(logic_items)
lane_bg_top = lane_head_y - 12
lane_bg_h = max(left_h, right_h) + 24
# left/right lane translucent frames
emit(rrect(LX, lane_bg_top, laneW, lane_bg_h, 16, "url(#lane_look)", stroke=LOOK, sw=1.0, opacity=0.9))
emit(rrect(RX, lane_bg_top, laneW, lane_bg_h, 16, "url(#lane_logic)", stroke=LOGIC, sw=1.0, opacity=0.9))

left_bottom = stack(LX, lane_head_y, look_header, LOOK, None, look_items)
right_bottom = stack(RX, lane_head_y, logic_header, LOGIC, None, logic_items)

# terminal captions under each apply node
emit(text(LX + laneW/2, left_bottom + 20, "▸ fewer steps · instant paint · client-side", size=11, fill=LOOK, anchor="middle", weight="700"))
emit(text(RX + laneW/2, right_bottom + 20, "▸ more gates · deferred · effective for THIS request", size=11, fill=LOGIC, anchor="middle", weight="700"))

# Fill the left lane's extra space with two insight cards (look lane is shorter)
ins_y = left_bottom + 40
card_w = node_w
cxn = LX + lpad
emit(rrect(cxn, ins_y, card_w, 86, 11, PANEL, stroke=LOOK, sw=1.2, opacity=0.95))
emit(rrect(cxn, ins_y, 4.5, 86, 3, LOOK))
emit(text(cxn + 16, ins_y + 22, "LIVE RECONCILIATION when the dev tightens an invariant", size=12.5, fill=LOOK, weight="800"))
emit(text(cxn + 16, ins_y + 41, "Keyed on constraintsHash, the currently-applied theme is re-verified;", size=11.3, fill=MUTE))
emit(text(cxn + 16, ins_y + 56, "if it now fails it recompiles under the new constraints — else drops to", size=11.3, fill=MUTE))
emit(text(cxn + 16, ins_y + 71, "base CSS. Invariants win over the user's vibe, live, no reload.", size=11.3, fill=MUTE))
emit(text(cxn + card_w - 14, ins_y + 79, "provider.tsx:162", size=10.4, fill=LOOK, anchor="end", mono=True, weight="600"))

ins2 = ins_y + 86 + 16
emit(rrect(cxn, ins2, card_w, 80, 11, PANEL, stroke=BORDER, sw=1.2))
emit(text(cxn + 16, ins2 + 22, "WHY TWO “APPLY” MOMENTS?", size=12.5, fill=INK, weight="800"))
emit(text(cxn + 16, ins2 + 41, "Look = a value swap in the browser → safe to paint immediately.", size=11.3, fill=MUTE))
emit(text(cxn + 16, ins2 + 56, "Logic = executable code at the API seam → must be signed, verified,", size=11.3, fill=MUTE))
emit(text(cxn + 16, ins2 + 71, "sandboxed & capability-bounded before its result is ever kept.", size=11.3, fill=MUTE))

content_bottom = max(right_bottom + 30, ins2 + 80 + 10)
y = content_bottom + 26

# ============================================================================ FOOTER / LEGEND
fy = y
fh = 150
emit(rrect(CX0, fy, CW, fh, 12, PANEL, stroke=BORDER, sw=1.3))
emit(text(CX0 + 20, fy + 26, "LEGEND", size=12.5, fill=INK, weight="800", ls="1.2"))
# tag chips
lx = CX0 + 110
ty = fy + 18
for lab_, fg, bgc, desc in [
    ("det", DET, DET_D, "deterministic (AST / build / crypto)"),
    ("LLM", LLM, LLM_D, "model proposes — advisory only"),
    ("gate", GATE, GATE_D, "deterministic verify, no LLM"),
    ("APPLY", APPLY, "#332a10", "the moment the change goes live"),
    ("fail-open", FAIL, "#2a1414", "any failure → base app behavior"),
]:
    bw = badge(lx, ty, lab_, fg, bgc)
    emit(text(lx + bw + 8, ty + 12.5, desc, size=11, fill=MUTE))
    lx += bw + 8 + len(desc)*6.0 + 26
    if lx > CX1 - 260:
        lx = CX0 + 110; ty += 26

# two apply moments callouts
my = fy + 70
col_w = (CW - 40) / 2
emit(rrect(CX0 + 20, my, col_w - 14, 64, 9, "url(#lane_look)", stroke=LOOK, sw=1.2))
emit(text(CX0 + 34, my + 21, "LOOK — goes live at:", size=12, fill=LOOK, weight="800"))
emit(text(CX0 + 34, my + 39, "root.style.setProperty(key, value)", size=12, fill=INK, weight="700", mono=True))
emit(text(CX0 + 34, my + 55, "design/src/runtime/apply.ts:34  ·  guarded by verifyV2", size=10.6, fill=MUTE, mono=True))

emit(rrect(CX0 + 20 + col_w + 6, my, col_w - 14, 64, 9, "url(#lane_logic)", stroke=LOGIC, sw=1.2))
emit(text(CX0 + 34 + col_w + 6, my + 21, "BUSINESS-LOGIC — goes live at:", size=12, fill=LOGIC, weight="800"))
emit(text(CX0 + 34 + col_w + 6, my + 39, "current = execution.result", size=12, fill=INK, weight="700", mono=True))
emit(text(CX0 + 34 + col_w + 6, my + 55, "server/src/runtime.ts:226  ·  guarded by verifyBundle + capability + multiset", size=10.6, fill=MUTE, mono=True))

# core invariants strip
iy = my + 64 + 4
emit(text(CX0 + 20, iy + 12, "Core invariants:  runtimes execute only signed+verified bundles  ·  bundles immutable (new revisions supersede via pointer)  ·  user prompts never enter bundles (PII)  ·  verification has no LLM  ·  fail-open everywhere.",
          size=10.8, fill=FAINT, weight="500"))
y = fy + fh + 20

# ============================================================================ ASSEMBLE
H = y + 16
svg = []
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H:.0f}" viewBox="0 0 {W} {H:.0f}" font-family="sans-serif">')
svg.append("<defs>" + "".join(defs) + "</defs>")
svg.append(f'<rect width="{W}" height="{H:.0f}" fill="url(#bg)"/>')
svg.append(f'<rect width="{W}" height="{H:.0f}" fill="url(#grid)"/>')
svg.append(f'<rect width="{W}" height="{H:.0f}" fill="url(#vig)"/>')
svg.extend(parts)
svg.append("</svg>")
svg_str = "\n".join(svg)

here = os.path.dirname(os.path.abspath(__file__))
svg_path = os.path.join(here, "system-design.svg")
with open(svg_path, "w") as f:
    f.write(svg_str)

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invariance — System Design</title>
<style>
  html,body{{margin:0;background:{BG0};color:{INK};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif}}
  .wrap{{max-width:{W}px;margin:0 auto;padding:22px 18px 60px}}
  .bar{{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:0 4px 14px;
    border-bottom:1px solid {BORDER};padding-bottom:12px}}
  .bar h1{{font-size:16px;margin:0;letter-spacing:.3px}}
  .bar .m{{color:{FAINT};font-size:12.5px}}
  .bar code{{color:{LOOK};font-family:ui-monospace,Menlo,monospace;font-size:12px}}
  svg{{width:100%;height:auto;display:block;border:1px solid {BORDER};border-radius:14px;
    box-shadow:0 24px 80px rgba(0,0,0,.55)}}
</style></head><body><div class="wrap">
<div class="bar"><h1>Invariance — System Design</h1>
<span class="m">two planes · three pipelines · the LLM proposes, deterministic gates dispose</span>
<span class="m">source: <code>INVARIANTS-PIPELINE.md</code> + <code>ONBOARDING-PIPELINE.md</code></span></div>
{svg_str}
</div></body></html>"""
html_path = os.path.join(here, "system-design.html")
with open(html_path, "w") as f:
    f.write(html)

print("WROTE", svg_path, f"({len(svg_str)} bytes)")
print("WROTE", html_path)
print("CANVAS", W, "x", round(H), " content_bottom_used:", round(_maxy[0]))
print("LANE_HEIGHTS left:", round(left_h), "right:", round(right_h))
