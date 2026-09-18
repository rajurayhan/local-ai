#!/usr/bin/env bash
# Start the host-side MCP gateway so RakaAI agents can act on this Mac.
# Usage: npm run start:device-mcp

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_MCP_DIR="$ROOT_DIR/host-mcp"
PORT="${DEVICE_MCP_PORT:-8765}"
PID_FILE="${TMPDIR:-/tmp}/rakaai-device-mcp.pid"
LOG_FILE="/tmp/rakaai-device-mcp-server.log"
ROOT_FOLDER="${DEVICE_MCP_ROOT:-$HOME/Documents/RakaAI}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd curl
require_cmd python3

mkdir -p "$ROOT_FOLDER/screenshots"
if [[ ! -f "$ROOT_FOLDER/README.txt" ]]; then
  printf '%s\n' 'This folder is what the RakaAI files agent can read on this Mac.' > "$ROOT_FOLDER/README.txt"
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "Created .env from .env.example"
fi

python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import secrets
import sys

path = Path(sys.argv[1])
original = path.read_text()
text = original
if "DEVICE_MCP_TOKEN=" not in text:
    text = text.rstrip() + f"\nDEVICE_MCP_TOKEN={secrets.token_urlsafe(32)}\n"
    print("Added DEVICE_MCP_TOKEN to .env")
if "SLACK_BOT_TOKEN=" not in text:
    text = text.rstrip() + "\nSLACK_BOT_TOKEN=\n"
    print("Added empty SLACK_BOT_TOKEN to .env")
if "SLACK_USER_TOKEN=" not in text:
    text = text.rstrip() + "\nSLACK_USER_TOKEN=\n"
    print("Added empty SLACK_USER_TOKEN to .env")

for line in text.splitlines():
    if line.startswith("DEVICE_MCP_TOKEN=") and len(line.split("=", 1)[1].strip()) == 0:
        token = secrets.token_urlsafe(32)
        text = text.replace("DEVICE_MCP_TOKEN=", f"DEVICE_MCP_TOKEN={token}", 1)
        print("Filled empty DEVICE_MCP_TOKEN in .env")
        break
if text != original:
    path.write_text(text)
PY

TOKEN="$(python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text().splitlines():
    if line.startswith("DEVICE_MCP_TOKEN="):
        print(line.split("=", 1)[1].strip().strip('"').strip("'"))
        break
PY
)"

if [[ -z "$TOKEN" ]]; then
  echo "DEVICE_MCP_TOKEN is missing from .env"
  exit 1
fi

SLACK_TOKEN="$(python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text().splitlines():
    if line.startswith("SLACK_BOT_TOKEN="):
        print(line.split("=", 1)[1].strip().strip('"').strip("'"))
        break
PY
)"

SLACK_USER_TOKEN="$(python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text().splitlines():
    if line.startswith("SLACK_USER_TOKEN="):
        print(line.split("=", 1)[1].strip().strip('"').strip("'"))
        break
PY
)"

if [[ ! -f "$HOST_MCP_DIR/config.json" ]]; then
  python3 - "$HOST_MCP_DIR/config.example.json" "$HOST_MCP_DIR/config.json" "$TOKEN" "$PORT" "$ROOT_FOLDER" <<'PY'
import json
from pathlib import Path
import sys

example, dest, token, port, root = sys.argv[1:6]
data = json.loads(Path(example).read_text())
data["token"] = token
data["port"] = int(port)
data["files"]["root"] = root
data["shell"]["cwdAllow"] = [root]
data["browser"]["userDataDir"] = f"{root}/.browser-profile"
data["desktop"]["screenshotDir"] = f"{root}/screenshots"
Path(dest).write_text(json.dumps(data, indent=2) + "\n")
print(f"Wrote {dest}")
PY
fi

if [[ ! -d "$HOST_MCP_DIR/node_modules" ]]; then
  echo "Installing host-mcp dependencies..."
  (cd "$HOST_MCP_DIR" && npm install)
fi

if [[ -f "$ROOT_DIR/librechat.yaml" ]]; then
  python3 "$ROOT_DIR/scripts/ensure-device-mcp-yaml.py" \
    "$ROOT_DIR/librechat.yaml" \
    "$ROOT_DIR/config/device-mcp.yaml"
fi

if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Device MCP is already running on port $PORT"
  exit 0
fi

echo "Starting device MCP on port $PORT (files root $ROOT_FOLDER)..."
(
  cd "$HOST_MCP_DIR"
  nohup env DEVICE_MCP_TOKEN="$TOKEN" DEVICE_MCP_PORT="$PORT" SLACK_BOT_TOKEN="$SLACK_TOKEN" SLACK_USER_TOKEN="$SLACK_USER_TOKEN" \
    "$HOST_MCP_DIR/node_modules/.bin/tsx" src/server.ts \
    </dev/null >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
)

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "Device MCP is ready at http://127.0.0.1:${PORT}/health"
    echo "Packs: /mcp/files /mcp/shell /mcp/browser /mcp/desktop /mcp/apps"
    echo "Restart the API if librechat.yaml changed: docker compose restart api"
    echo "Then: npm run start:ollama  (reseeds agents) or seed scripts/seed-rakaai-agent.mongo.js"
    echo "Optional click/screenshot in the browser pack: cd host-mcp && npm install playwright && npx playwright install chromium"
    exit 0
  fi
  sleep 0.25
done

echo "Device MCP started but /health is not ready yet. Check $LOG_FILE"
exit 1
