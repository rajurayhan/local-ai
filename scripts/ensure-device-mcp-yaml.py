#!/usr/bin/env python3
"""Idempotently wire the host device MCP gateway into librechat.yaml."""

from pathlib import Path
import sys

yaml_path = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text()
text = yaml_path.read_text()
changed = False

if "rakaai-files:" not in text:
    needle = "# Definition of custom endpoints\n"
    if needle not in text:
        sys.exit("librechat.yaml has no custom-endpoints marker to attach MCP to.")
    text = text.replace(needle, snippet.rstrip() + "\n\n" + needle, 1)
    changed = True

if "host.docker.internal:8765" not in text.split("endpoints:", 1)[-1]:
    needle = "    - '127.0.0.1:7860'\n"
    extra = (
        "    - '127.0.0.1:7860'\n"
        "    - 'host.docker.internal:8765'\n"
        "    - '127.0.0.1:8765'\n"
    )
    if needle in text:
        text = text.replace(needle, extra, 1)
        changed = True

if "\n    toolApproval:\n" not in text:
    needle = "    requireExplicitImageRequest: true\n"
    extra = (
        "    requireExplicitImageRequest: true\n"
        "    toolApproval:\n"
        "      enabled: true\n"
        "      mode: default\n"
        "      allow:\n"
        "        - 'mcp:rakaai-files:list_directory'\n"
        "        - 'mcp:rakaai-files:read_file'\n"
        "        - 'mcp:rakaai-apps:list_hooks'\n"
        "      ask:\n"
        "        - 'mcp:rakaai-files:write_file'\n"
        "        - 'mcp:rakaai-shell:*'\n"
        "        - 'mcp:rakaai-browser:*'\n"
        "        - 'mcp:rakaai-desktop:*'\n"
        "        - 'mcp:rakaai-apps:trigger_hook'\n"
        "      reason: 'Review {tool} before it runs on this Mac.'\n"
    )
    if needle in text:
        text = text.replace(needle, extra, 1)
        changed = True

if "  mcpServers:\n    use: true" not in text:
    needle = "    public: false\n  # Scheduled chats"
    extra = (
        "    public: false\n"
        "  mcpServers:\n"
        "    use: true\n"
        "    create: false\n"
        "    share: false\n"
        "    public: false\n"
        "  # Scheduled chats"
    )
    if needle in text:
        text = text.replace(needle, extra, 1)
        changed = True

if changed:
    yaml_path.write_text(text)
    print("Updated librechat.yaml for the host device MCP gateway")
else:
    print("librechat.yaml already has device MCP wiring")
