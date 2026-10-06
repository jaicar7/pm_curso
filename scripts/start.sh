#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="pm-mvp"

docker build -t "$NAME" "$PROJECT_ROOT"
docker rm -f "$NAME" >/dev/null 2>&1 || true
mkdir -p "$PROJECT_ROOT/data"
docker run -d --name "$NAME" -p 8000:8000 \
  --env-file "$PROJECT_ROOT/.env" \
  -v "$PROJECT_ROOT/data:/app/data" \
  "$NAME" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "App is running on http://127.0.0.1:8000"
    exit 0
  fi
  sleep 1
done

echo "App did not start. Check: docker logs $NAME" >&2
exit 1
