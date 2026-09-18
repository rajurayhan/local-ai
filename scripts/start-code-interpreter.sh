#!/usr/bin/env bash
# Start the local ClickHouse/LibreChat Code Interpreter stack for RakaAI.
# Usage: npm run start:code-interpreter
#
# Expects a checkout at CODE_INTERPRETER_DIR (default: ../code-interpreter).
# On macOS this uses docker-compose.mac.yml (NsJail, no /dev/kvm).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODE_DIR="${CODE_INTERPRETER_DIR:-$ROOT_DIR/../code-interpreter}"
CODE_URL="${CODE_URL:-http://127.0.0.1:3112/v1}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd docker
require_cmd curl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required."
  exit 1
fi

if [[ ! -d "$CODE_DIR" ]]; then
  echo "Cloning LibreChat-AI/code-interpreter v1.2.0 into $CODE_DIR"
  git clone --branch v1.2.0 --depth 1 https://github.com/LibreChat-AI/code-interpreter.git "$CODE_DIR"
fi

if [[ ! -f "$CODE_DIR/.env" ]]; then
  cp "$CODE_DIR/.env.example" "$CODE_DIR/.env"
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Create $ROOT_DIR/.env first (cp .env.example .env)."
  exit 1
fi

if ! grep -q '^CODEAPI_AUTH_PROVIDER=librechat-jwt' "$ROOT_DIR/.env"; then
  node "$CODE_DIR/scripts/setup-local-auth-env.js" \
    --librechat "$ROOT_DIR" \
    --base-url "http://host.docker.internal:3112/v1"
fi

python3 - "$ROOT_DIR/.env" "$CODE_DIR/.env" <<'PY'
from pathlib import Path
import secrets
import sys

lc = Path(sys.argv[1])
code = Path(sys.argv[2])
lc_text = lc.read_text()
code_text = code.read_text()
changed_lc = False
changed_code = False

def upsert(text, key, value):
    import re
    pattern = re.compile(rf"^{key}=.*$", re.M)
    line = f"{key}={value}"
    if pattern.search(text):
        return pattern.sub(line, text, count=1), True
    return text.rstrip() + "\n" + line + "\n", True

def ensure(text, key, value, force=False):
    import re
    if re.search(rf"^{key}=.+$", text, re.M) and not force:
        return text, False
    return upsert(text, key, value)

lc_text, c = ensure(lc_text, "LIBRECHAT_CODE_BASEURL", "http://host.docker.internal:3112/v1")
changed_lc = changed_lc or c
lc_text, c = ensure(lc_text, "CODE_ENVIRONMENT_DECISION_VERSION", "1")
changed_lc = changed_lc or c
lc_text, c = ensure(lc_text, "CODEAPI_JWT_ENABLED", "true")
changed_lc = changed_lc or c

code_text, c = ensure(code_text, "KVM_ENABLED", "false", force=True)
changed_code = changed_code or c
code_text, c = ensure(code_text, "LOCAL_MODE", "false", force=True)
changed_code = changed_code or c
code_text, c = ensure(code_text, "COMPOSE_FILE", "docker-compose.yaml:docker-compose.mac.yml")
code_text, c2 = ensure(code_text, "CODEAPI_RUNTIME_SESSION_MODE", "stateless")
changed_code = changed_code or c2
changed_code = changed_code or c
if not any(line.startswith("CODEAPI_BRIDGE_TOKEN=") and line.split("=", 1)[1].strip() for line in code_text.splitlines()):
    token = secrets.token_hex(32)
    code_text, _ = upsert(code_text, "CODEAPI_BRIDGE_TOKEN", token)
    lc_text, _ = upsert(lc_text, "CODEAPI_BRIDGE_TOKEN", token)
    changed_code = True
    changed_lc = True

if changed_lc:
    lc.write_text(lc_text)
if changed_code:
    code.write_text(code_text)
PY

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yaml:docker-compose.mac.yml}"
export KVM_ENABLED=false
export CODEAPI_RUNTIME_SESSION_MODE=stateless

echo "Starting Code Interpreter at $CODE_DIR (first sandbox build can take a long time)"
docker compose --project-name rakaai-codeapi --project-directory "$CODE_DIR" up -d --build

wait_for() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 90); do
    if curl -sf "$url/health" >/dev/null 2>&1; then
      echo "$label is ready at $url"
      return 0
    fi
    sleep 2
  done
  echo "$label did not become ready at $url/health"
  return 1
}

wait_for "$CODE_URL" "Code Interpreter"
