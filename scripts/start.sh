#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/backend"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to start the app." >&2
  exit 1
fi

if ! python3 -c "import fastapi" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  python3 -m pip install -r requirements.txt >/dev/null
fi

LOG_FILE="$PROJECT_ROOT/.local_backend.log"
PID_FILE="$PROJECT_ROOT/.backend.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend is already running on http://127.0.0.1:8000"
  exit 0
fi

python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
printf '%s\n' "$SERVER_PID" > "$PID_FILE"

echo "Backend starting..."
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/boards/me >/dev/null 2>&1; then
    echo "Backend is running on http://127.0.0.1:8000"
    curl -fsS http://127.0.0.1:8000/
    exit 0
  fi
  sleep 1
done

echo "Backend did not start successfully. Check $LOG_FILE" >&2
exit 1
