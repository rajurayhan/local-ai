#!/usr/bin/env python3
"""Idempotently wire the host device MCP gateway into librechat.yaml."""

from pathlib import Path
import sys

yaml_path = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text()
text = yaml_path.read_text()
changed = False

RENAMES = (
    ("rakaai-files", "RakaAI-Files"),
    ("rakaai-shell", "RakaAI-Shell"),
    ("rakaai-browser", "RakaAI-Browser"),
    ("rakaai-desktop", "RakaAI-Desktop"),
    ("rakaai-apps", "RakaAI-Apps"),
)

if "rakaai-files:" in text or "mcp:rakaai-" in text:
    for old, new in RENAMES:
        if old in text:
            text = text.replace(old, new)
            changed = True

if "title: RakaAI-Files" not in text:
    start = text.find("mcpSettings:\n  allowedAddresses:\n    - 'host.docker.internal:8765'")
    end = text.find("# Definition of custom endpoints\n")
    if start != -1 and end != -1 and start < end:
        text = text[:start] + snippet.rstrip() + "\n\n" + text[end:]
        changed = True
    elif "RakaAI-Files:" not in text and "rakaai-files:" not in text:
        needle = "# Definition of custom endpoints\n"
        if needle not in text:
            sys.exit("librechat.yaml has no custom-endpoints marker to attach MCP to.")
        text = text.replace(needle, snippet.rstrip() + "\n\n" + needle, 1)
        changed = True

if "mcp:RakaAI-Apps:slack_send_message" not in text and "mcp:RakaAI-Apps:trigger_hook" in text:
    text = text.replace(
        "        - 'mcp:RakaAI-Apps:trigger_hook'\n",
        "        - 'mcp:RakaAI-Apps:trigger_hook'\n"
        "        - 'mcp:RakaAI-Apps:slack_send_message'\n",
        1,
    )
    changed = True

old_apps = "RakaAI-Apps: Trigger configured app webhooks such as n8n."
new_apps = "RakaAI-Apps: Send Slack messages and trigger configured app webhooks such as n8n."
if old_apps in text:
    text = text.replace(old_apps, new_apps)
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
        "        - 'mcp:RakaAI-Files:list_directory'\n"
        "        - 'mcp:RakaAI-Files:read_file'\n"
        "        - 'mcp:RakaAI-Apps:list_hooks'\n"
        "      ask:\n"
        "        - 'mcp:RakaAI-Files:write_file'\n"
        "        - 'mcp:RakaAI-Shell:*'\n"
        "        - 'mcp:RakaAI-Browser:*'\n"
        "        - 'mcp:RakaAI-Desktop:*'\n"
        "        - 'mcp:RakaAI-Apps:trigger_hook'\n"
        "        - 'mcp:RakaAI-Apps:slack_send_message'\n"
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
