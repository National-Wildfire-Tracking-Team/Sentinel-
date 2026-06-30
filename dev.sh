#!/usr/bin/env bash
# Starts all dev services:
#   1. IPAWS CAP/EAS poller      (Node.js  — port 3847)
#   2. NEXRAD radar microservice (Python   — port 8765)
#   3. Vite dev server           (frontend — port 3000)

# ── IPAWS server ──────────────────────────────────────────────────────────────
node server/ipaws-server.js &
IPAWS_PID=$!
echo "ipaws-server started (PID: $IPAWS_PID) on port 3847"

# ── NEXRAD radar service ──────────────────────────────────────────────────────
RADAR_PORT="${RADAR_SERVICE_PORT:-8765}"
RADAR_PID=""

if [ -d "radar_service" ]; then
  # Create venv on first run
  if [ ! -d "radar_service/.venv" ]; then
    echo "Creating Python venv for radar service…"
    python3 -m venv radar_service/.venv
    radar_service/.venv/bin/pip install --quiet --upgrade pip
    radar_service/.venv/bin/pip install --quiet -r radar_service/requirements.txt
  fi

  (cd radar_service && RADAR_SERVICE_PORT="$RADAR_PORT" .venv/bin/uvicorn radar_service:app \
    --host 127.0.0.1 \
    --port "$RADAR_PORT" \
    --log-level info \
    --no-access-log) &
  RADAR_PID=$!
  echo "NEXRAD radar service started (PID: $RADAR_PID) on port $RADAR_PORT"
else
  echo "radar_service/ not found — skipping radar service (IEM fallback will be used)"
fi

# ── Vite dev server ───────────────────────────────────────────────────────────
bun run dev

# ── Cleanup ───────────────────────────────────────────────────────────────────
kill $IPAWS_PID 2>/dev/null || true
[ -n "$RADAR_PID" ] && kill $RADAR_PID 2>/dev/null || true
