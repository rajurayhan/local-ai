#!/usr/bin/env bash
# Start Ollama and the RakaAI Docker stack together.
# Usage: npm run start:ollama
# Optional: OLLAMA_MODEL=llama3.1:8b npm run start:ollama
#
# Image generation is a separate process (does not pull while another ollama
# pull is running):
#   npm run start:image-gen
# Then in Agents, enable the Stable Diffusion tool.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
APP_URL="${APP_URL:-http://localhost:3080}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd docker
require_cmd ollama
require_cmd curl

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "Docker Compose is required."
  exit 1
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

ollama_ready() {
  curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1
}

start_ollama() {
  if ollama_ready; then
    echo "Ollama is already running at $OLLAMA_URL"
    return
  fi

  if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q '^ollama'; then
    echo "Starting Ollama via Homebrew..."
    brew services start ollama
  else
    echo "Starting ollama serve in the background..."
    nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
  fi

  for _ in $(seq 1 40); do
    if ollama_ready; then
      echo "Ollama is ready at $OLLAMA_URL"
      return
    fi
    sleep 1
  done

  echo "Ollama did not become ready at $OLLAMA_URL"
  exit 1
}

ensure_model() {
  local model="$1"
  if ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -qx "$model"; then
    echo "Model $model is already present."
    return
  fi

  echo "Pulling $model (this can take several minutes)..."
  ollama pull "$model"
}

ensure_env() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "Created .env from .env.example"
  fi

  python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
changed = False
if "APP_TITLE=" not in text:
    text += "\nAPP_TITLE=RakaAI\n"
    changed = True
elif "APP_TITLE=LibreChat" in text:
    text = text.replace("APP_TITLE=LibreChat", "APP_TITLE=RakaAI", 1)
    changed = True
if "SD_WEBUI_URL=" not in text.splitlines() and "SD_WEBUI_URL=" not in text:
    text += "\nSD_WEBUI_URL=http://host.docker.internal:7860\n"
    changed = True
if "SEARCH=false" in text:
    text = text.replace("SEARCH=false", "SEARCH=true", 1)
    changed = True
if "MEILI_MASTER_KEY=\n" in text or text.rstrip().endswith("MEILI_MASTER_KEY="):
    text = text.replace("MEILI_MASTER_KEY=", "MEILI_MASTER_KEY=rakaai-meili-2026-09-18-local", 1)
    changed = True
if "EMBEDDINGS_PROVIDER=ollama" not in text:
    text += (
        "\nEMBEDDINGS_PROVIDER=ollama\n"
        "OLLAMA_BASE_URL=http://host.docker.internal:11434\n"
        "EMBEDDINGS_MODEL=nomic-embed-text\n"
    )
    changed = True
if "DEVICE_MCP_TOKEN=" not in text:
    import secrets
    text += f"\nDEVICE_MCP_TOKEN={secrets.token_urlsafe(32)}\n"
    changed = True
if changed:
    path.write_text(text)
    print("Updated .env for RakaAI, search, and local RAG")
PY
}

ensure_override() {
  local override="$ROOT_DIR/docker-compose.override.yaml"
  if [[ ! -f "$override" ]]; then
    cat >"$override" <<'EOF'
services:
  api:
    environment:
      - DEVICE_MCP_TOKEN=${DEVICE_MCP_TOKEN}
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
  rag_api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - EMBEDDINGS_PROVIDER=ollama
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - EMBEDDINGS_MODEL=nomic-embed-text
EOF
    echo "Wrote docker-compose.override.yaml so RakaAI loads librechat.yaml."
    return
  fi

  if ! grep -q 'DEVICE_MCP_TOKEN' "$override"; then
    python3 - "$override" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
needle = "  api:\n    volumes:\n"
extra = (
    "  api:\n"
    "    environment:\n"
    "      - DEVICE_MCP_TOKEN=${DEVICE_MCP_TOKEN}\n"
    "    volumes:\n"
)
if needle in text:
    path.write_text(text.replace(needle, extra, 1))
    print("Added DEVICE_MCP_TOKEN to docker-compose.override.yaml")
PY
  fi

  if grep -q 'EMBEDDINGS_PROVIDER=ollama' "$override"; then
    return
  fi

  cat >>"$override" <<'EOF'
  rag_api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - EMBEDDINGS_PROVIDER=ollama
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - EMBEDDINGS_MODEL=nomic-embed-text
EOF
  echo "Added rag_api Ollama embeddings to docker-compose.override.yaml."
}

ensure_yaml() {
  local yaml="$ROOT_DIR/librechat.yaml"
  local snippet="$ROOT_DIR/config/ollama-endpoint.yaml"

  if [[ ! -f "$yaml" ]]; then
    cp "$ROOT_DIR/librechat.example.yaml" "$yaml"
    echo "Created librechat.yaml from librechat.example.yaml"
  fi

  python3 - "$yaml" "$snippet" "$OLLAMA_MODEL" <<'PY'
from pathlib import Path
import sys

yaml_path = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text()
model = sys.argv[3]
text = yaml_path.read_text()
changed = False

if "name: 'Ollama'" not in text:
    needle = "  custom:\n"
    if needle not in text:
        sys.exit("librechat.yaml has no endpoints.custom block to attach Ollama to.")
    text = text.replace(needle, needle + snippet + "\n", 1)
    changed = True

if "host.docker.internal:11434" not in text:
    endpoints = "endpoints:\n"
    if endpoints not in text:
        sys.exit("librechat.yaml has no endpoints block.")
    allow = (
        "endpoints:\n"
        "  allowedAddresses:\n"
        "    - 'host.docker.internal:11434'\n"
        "    - '127.0.0.1:11434'\n"
        "    - 'host.docker.internal:7860'\n"
        "    - '127.0.0.1:7860'\n"
    )
    text = text.replace(endpoints, allow, 1)
    changed = True
elif "host.docker.internal:7860" not in text and "allowedAddresses:" in text:
    needle = "    - '127.0.0.1:11434'\n"
    extra = (
        "    - '127.0.0.1:11434'\n"
        "    - 'host.docker.internal:7860'\n"
        "    - '127.0.0.1:7860'\n"
    )
    if needle in text:
        text = text.replace(needle, extra, 1)
        changed = True

if "Welcome to LibreChat!" in text:
    text = text.replace(
        "Welcome to LibreChat! Enjoy your experience.",
        "Welcome to RakaAI! Enjoy your experience.",
        1,
    )
    changed = True

if "defaultPinnedTools:" not in text:
    needle = "  # defaultPinnedTools:\n"
    pinned = (
        "  defaultPinnedTools:\n"
        "    - 'file_search'\n"
    )
    if needle in text:
        text = text.replace(needle, pinned, 1)
        changed = True

if changed:
    yaml_path.write_text(text)
    print(f"Updated librechat.yaml for Ollama ({model}) and RakaAI")
PY
}

wait_for_app() {
  for _ in $(seq 1 60); do
    if curl -sf "$APP_URL/health" >/dev/null 2>&1; then
      echo "RakaAI is ready at $APP_URL"
      echo "Chat: endpoint RakaAI, or a RakaAI Agent for files, images, or device tools."
      echo "Image generation: npm run start:image-gen  (Flux proxy on :7860)."
      echo "Device actions:   npm run start:device-mcp (host MCP on :8765)."
      return
    fi
    sleep 2
  done

  echo "RakaAI started but /health is not ready yet. Try $APP_URL in a moment."
}

start_ollama
if pgrep -f 'ollama pull' >/dev/null 2>&1 && ! ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -qx "$OLLAMA_MODEL"; then
  echo "An Ollama pull is already running; not starting another. Using whatever models are already local."
else
  ensure_model "$OLLAMA_MODEL"
fi
ensure_model "$EMBED_MODEL"
ensure_env
ensure_override
ensure_yaml
python3 "$ROOT_DIR/scripts/ensure-device-mcp-yaml.py" "$ROOT_DIR/librechat.yaml" "$ROOT_DIR/config/device-mcp.yaml"
echo "Starting RakaAI..."
compose up -d
wait_for_app
if docker exec chat-mongodb mongosh --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
  docker exec -i chat-mongodb mongosh LibreChat --quiet < "$ROOT_DIR/scripts/seed-rakaai-agent.mongo.js"
fi
