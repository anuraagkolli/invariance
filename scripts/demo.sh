#!/usr/bin/env bash
# One-command Invariance demo launcher.
#
# Brings the whole stack up in the right order with health gating, baking in the
# fragility-avoidance learned the hard way:
#   - control plane FIRST, then seed, then Nebula, then Console (per-process
#     signing keys mean order matters);
#   - pin the LLM to the model that's actually pulled (qwen2.5:latest), not the
#     code default;
#   - build @invariance/design (its consumers import from dist/);
#   - start from a clean slate (stop any old stack + clear Nebula's Next fetch
#     cache) so a stale cached signing key can never cause silent hook no-ops.
#
# Usage:  pnpm demo        (or: bash scripts/demo.sh)
# Stop:   pnpm demo:stop   (or: bash scripts/demo-stop.sh)
#
# IMPORTANT: don't restart the control plane mid-demo — the in-memory store
# loses applied themes/mods on restart. If anything looks off, just re-run this.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEMO_DIR="$ROOT/.demo"
LOG_DIR="$DEMO_DIR/logs"
PID_FILE="$DEMO_DIR/pids"
mkdir -p "$LOG_DIR"

REGISTRY="http://localhost:4400"
NEBULA="http://localhost:4321"
CONSOLE="http://localhost:4600"
OLLAMA="${LLM_BASE_URL:-http://localhost:11434/v1}"
MODEL="${LLM_MODEL:-qwen2.5:latest}"

say()  { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# Poll a URL until it answers (any HTTP status) or we time out.
wait_for() { # name url timeout_s
  local name="$1" url="$2" timeout="$3" i
  for ((i = 0; i < timeout; i++)); do
    if curl -sf -o /dev/null "$url" 2>/dev/null || curl -s -o /dev/null "$url" 2>/dev/null; then
      ok "$name is up ($url)"
      return 0
    fi
    sleep 1
  done
  die "$name did not come up within ${timeout}s — see $LOG_DIR"
}

start() { # name "command" logfile
  local name="$1" cmd="$2" log="$3"
  say "starting ${name}…"
  # nohup + disown so the dev servers outlive this launcher (and `pnpm demo`).
  nohup bash -c "$cmd" > "$log" 2>&1 &
  echo "$!" >> "$PID_FILE"
  disown 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 0) Preflight
# ---------------------------------------------------------------------------
command -v pnpm >/dev/null || die "pnpm not found (this repo is pnpm-only)."

OLLAMA_TAGS="${OLLAMA%/v1}/api/tags"
if curl -sf "$OLLAMA_TAGS" >/dev/null 2>&1; then
  if curl -s "$OLLAMA_TAGS" | grep -q "qwen2.5"; then
    ok "Ollama reachable with a qwen2.5 model (theme prompts will work)"
  else
    warn "Ollama is up but no qwen2.5 model found. Run: ollama pull qwen2.5"
    warn "Theme PACK chips still work without it; typed vibes need the model."
  fi
else
  warn "Ollama not reachable at ${OLLAMA%/v1}. Theme PACK chips still work;"
  warn "typed-vibe prompts won't. Start it with: ollama serve  (then: ollama pull qwen2.5)"
fi

# ---------------------------------------------------------------------------
# 1) Clean slate (stop old stack + clear Nebula's Next fetch cache)
# ---------------------------------------------------------------------------
say "clean slate: stopping any existing stack…"
bash "$ROOT/scripts/demo-stop.sh" >/dev/null 2>&1 || true
rm -f "$PID_FILE"
# Belt-and-suspenders against a stale cached signing key (the runtime now sets
# cache:no-store, but clearing keeps a fresh demo deterministic).
rm -rf "$ROOT/apps/nebula/.next/cache/fetch-cache" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 2) Build @invariance/design (its consumers import from dist/)
# ---------------------------------------------------------------------------
say "building @invariance/design-schema + @invariance/design (consumers import dist/)…"
pnpm -F @invariance/design-schema build >/dev/null 2>&1 \
  && pnpm -F @invariance/design build >/dev/null 2>&1 && ok "design built" \
  || die "design build failed — run: pnpm -F @invariance/design-schema build && pnpm -F @invariance/design build"

# ---------------------------------------------------------------------------
# 3) Control plane :4400  → seed manifest
# ---------------------------------------------------------------------------
start "control plane" "PORT=4400 pnpm -F @invariance/control-plane dev" "$LOG_DIR/control-plane.log"
wait_for "control plane" "$REGISTRY/healthz" 40

say "seeding the Nebula manifest…"
INVARIANCE_REGISTRY="$REGISTRY" pnpm -F @invariance/nebula seed >"$LOG_DIR/seed.log" 2>&1 \
  && ok "manifest seeded" || die "seed failed — see $LOG_DIR/seed.log"

# ---------------------------------------------------------------------------
# 4) Nebula :4321  (showcase app — design plane + governed API)
# ---------------------------------------------------------------------------
start "Nebula" \
  "LLM_BASE_URL='$OLLAMA' LLM_MODEL='$MODEL' INVARIANCE_REGISTRY='$REGISTRY' NEXT_PUBLIC_INVARIANCE_REGISTRY='$REGISTRY' pnpm -F @invariance/nebula dev" \
  "$LOG_DIR/nebula.log"
wait_for "Nebula" "$NEBULA/" 90

# ---------------------------------------------------------------------------
# 5) Console :4600  (developer surface: invariants, themes, guardrails)
# ---------------------------------------------------------------------------
start "Console" \
  "CONSOLE_PORT=4600 INVARIANCE_REGISTRY='$REGISTRY' DEMO_API_URL='$NEBULA' pnpm -F @invariance/console dev" \
  "$LOG_DIR/console.log"
wait_for "Console" "$CONSOLE/" 40

# ---------------------------------------------------------------------------
# Ready
# ---------------------------------------------------------------------------
cat <<EOF

$(ok "Invariance demo is up.")

  Showcase (end user)   $NEBULA
  Console (developer)   $CONSOLE/#/invariants   ·   $CONSOLE/#/themes   ·   $CONSOLE/#/guardrails
  Control plane API     $REGISTRY

  LLM: ${MODEL} via ${OLLAMA%/v1}   (theme PACK chips work even without it)

  Demo script:  docs/DEMO-RUNBOOK.md
  Logs:         .demo/logs/{control-plane,nebula,console}.log
  Stop:         pnpm demo:stop

  ⚠  Don't restart the control plane while demoing — the in-memory store loses
     applied themes/mods on restart. If anything looks off, re-run: pnpm demo
EOF
