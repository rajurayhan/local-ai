#!/usr/bin/env bash
# Stop the LibreChat Docker stack. Leaves Ollama running so other tools can use it.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
  docker compose down
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose down
else
  echo "Docker Compose is required."
  exit 1
fi

echo "RakaAI is stopped. Ollama and the device MCP (if started) are still running."
