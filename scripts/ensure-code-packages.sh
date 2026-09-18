#!/usr/bin/env bash
# Populate NsJail /pkgs with bash + Python so Code Interpreter can run
# bash_tool. The Mac compose overlay mounts ./data/pkgs read-only; an empty
# tree advertises no runtimes and every execution fails with
# "bash-5.2.0 runtime is unknown".
set -euo pipefail

CODE_DIR="${1:-${CODE_INTERPRETER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../code-interpreter" && pwd)}}"
PKGS="${CODE_DIR}/data/pkgs"
BASH_DEST="${PKGS}/bash/5.2.0"
PY_DEST="${PKGS}/python/3.14.4"
PY_IMAGE="${CODE_PYTHON_IMAGE:-python:3.14.4-bookworm}"

mkdir -p "$BASH_DEST" "$PY_DEST"

write_if_missing() {
  local path="$1"
  local body="$2"
  if [[ ! -f "$path" ]]; then
    printf '%s\n' "$body" > "$path"
  fi
}

write_if_missing "$BASH_DEST/pkg-info.json" '{
    "language": "bash",
    "version": "5.2.0",
    "build_platform": "docker-debian",
    "system_version": "5.2.21",
    "aliases": ["sh"]
}'
write_if_missing "$BASH_DEST/run" $'#!/bin/bash\nbash "$@"'
write_if_missing "$BASH_DEST/.env" 'PATH=/pkgs/python/3.14.4/bin:/pkgs/bun/1.3.14/bin:/pkgs/bun/1.3.14:/pkgs/node/24.15.0/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:.
NODE_PATH=/pkgs/node/24.15.0/node_modules
BUN_INSTALL=/pkgs/bun/1.3.14'
write_if_missing "$BASH_DEST/.package-installed" "$(date +%s)000"
chmod +x "$BASH_DEST/run"

if [[ ! -x "$PY_DEST/bin/python3" && ! -e "$PY_DEST/bin/python3" ]]; then
  echo "Installing $PY_IMAGE into $PY_DEST"
  docker pull "$PY_IMAGE"
  cid=$(docker create "$PY_IMAGE")
  docker cp "$cid:/usr/local/." "$PY_DEST/"
  docker rm "$cid" >/dev/null
fi

write_if_missing "$PY_DEST/pkg-info.json" '{
    "language": "python",
    "version": "3.14.4",
    "build_platform": "docker-debian",
    "aliases": ["py", "py3", "python3", "python3.14"]
}'
write_if_missing "$PY_DEST/run" $'#!/bin/bash\nSCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\nexport LD_LIBRARY_PATH="${SCRIPT_DIR}/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"\n"${SCRIPT_DIR}/bin/python3" "$@"'
write_if_missing "$PY_DEST/.env" 'PATH=/pkgs/python/3.14.4/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:.
LD_LIBRARY_PATH=/pkgs/python/3.14.4/lib'
write_if_missing "$PY_DEST/.package-installed" "$(date +%s)000"
chmod +x "$PY_DEST/run"

echo "Sandbox packages ready in $PKGS"
