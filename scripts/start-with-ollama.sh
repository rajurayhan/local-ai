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
  if ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -qx "$OLLAMA_MODEL"; then
    echo "Model $OLLAMA_MODEL is already present."
    return
  fi

  echo "Pulling $OLLAMA_MODEL (this can take several minutes)..."
  ollama pull "$OLLAMA_MODEL"
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
if changed:
    path.write_text(text)
    print("Set APP_TITLE=RakaAI in .env")
PY
}

ensure_override() {
  local override="$ROOT_DIR/docker-compose.override.yaml"
  if [[ -f "$override" ]]; then
    return
  fi

  cat >"$override" <<'EOF'
services:
  api:
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
EOF
  echo "Wrote docker-compose.override.yaml so RakaAI loads librechat.yaml."
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

if changed:
    yaml_path.write_text(text)
    print(f"Updated librechat.yaml for Ollama ({model}) and RakaAI")
PY
}

wait_for_app() {
  for _ in $(seq 1 60); do
    if curl -sf "$APP_URL/health" >/dev/null 2>&1; then
      echo "RakaAI is ready at $APP_URL"
      echo "Choose endpoint Ollama and model $OLLAMA_MODEL in a new chat."
      echo "Image generation: npm run start:image-gen  (then add the Stable Diffusion tool on an Agent)."
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
  ensure_model
fi
ensure_env
ensure_override
ensure_yaml
echo "Starting RakaAI..."
compose up -d
wait_for_app
