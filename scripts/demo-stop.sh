#!/usr/bin/env bash
# Tear down the Invariance demo stack (control plane :4400, Nebula :4321,
# Console :4600). Safe to run anytime; idempotent.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.demo"
PORTS=(4400 4321 4600)

echo "Stopping the Invariance demo stack…"

# 1) Kill tracked PIDs (the process groups we launched).
if [[ -f "$PID_DIR/pids" ]]; then
  while read -r pid; do
    [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
  done < "$PID_DIR/pids"
  rm -f "$PID_DIR/pids"
fi

# 2) Backstop: free the ports regardless of how things were started.
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  [[ -n "$pids" ]] && echo "$pids" | xargs -r kill -9 2>/dev/null || true
done

# 3) Catch dev servers by command pattern (next dev / vite / tsx main).
pkill -9 -f "apps/control-plane.*src/main.ts" 2>/dev/null || true
pkill -9 -f "next dev -p 4321" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

sleep 1
down=1
for port in "${PORTS[@]}"; do
  if curl -sf -o /dev/null "http://localhost:$port/" 2>/dev/null; then
    echo "  WARNING: something is still listening on :$port"
    down=0
  fi
done
[[ "$down" == 1 ]] && echo "Stack stopped." || echo "Stack mostly stopped (see warnings above)."
