#!/usr/bin/env python3
"""Idempotently wire the host device MCP gateway into librechat.yaml."""

from pathlib import Path
import sys

yaml_path = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text()
text = yaml_path.read_text()
changed = False

# Normalize legacy lowercase and prior RakaAI pack names to current Sulus-* ids.
RENAMES = (
    ("rakaai-files", "Sulus-Files"),
    ("rakaai-shell", "Sulus-Shell"),
    ("rakaai-browser", "Sulus-Browser"),
    ("rakaai-desktop", "Sulus-Desktop"),
    ("rakaai-apps", "Sulus-Apps"),
    ("rakaai-calendar", "Sulus-Calendar"),
    ("RakaAI-Files", "Sulus-Files"),
    ("RakaAI-Shell", "Sulus-Shell"),
    ("RakaAI-Browser", "Sulus-Browser"),
    ("RakaAI-Desktop", "Sulus-Desktop"),
    ("RakaAI-Apps", "Sulus-Apps"),
    ("RakaAI-Calendar", "Sulus-Calendar"),
    ("sulus-files", "Sulus-Files"),
    ("sulus-shell", "Sulus-Shell"),
    ("sulus-browser", "Sulus-Browser"),
    ("sulus-desktop", "Sulus-Desktop"),
    ("sulus-apps", "Sulus-Apps"),
    ("sulus-calendar", "Sulus-Calendar"),
)

if any(old in text for old, _ in RENAMES):
    for old, new in RENAMES:
        if old in text:
            text = text.replace(old, new)
            changed = True
if "Authored by RakaAI" in text:
    text = text.replace("Authored by RakaAI", "Authored by Sulus Personal AI")
    changed = True

CALENDAR_SERVER = (
    "  Sulus-Calendar:\n"
    "    title: Sulus-Calendar\n"
    "    description: 'Sulus-Calendar: List and create Calendar events and Reminders on this Mac. Authored by Sulus Personal AI <raju@sulus.ai>.'\n"
    "    type: streamable-http\n"
    "    url: http://host.docker.internal:8765/mcp/calendar\n"
    "    timeout: 60000\n"
    "    apiKey:\n"
    "      source: admin\n"
    "      authorization_type: bearer\n"
    "      key: '${DEVICE_MCP_TOKEN}'\n"
)

if "Sulus-Calendar:" not in text and "Sulus-Apps:" in text:
    apps_end = text.find("# Definition of custom endpoints\n")
    if apps_end != -1:
        text = text[:apps_end] + CALENDAR_SERVER + "\n" + text[apps_end:]
        changed = True

if "title: Sulus-Files" not in text:
    start = text.find("mcpSettings:\n  allowedAddresses:\n    - 'host.docker.internal:8765'")
    end = text.find("# Definition of custom endpoints\n")
    if start != -1 and end != -1 and start < end:
        text = text[:start] + snippet.rstrip() + "\n\n" + text[end:]
        changed = True
    elif "Sulus-Files:" not in text and "sulus-files:" not in text:
        needle = "# Definition of custom endpoints\n"
        if needle not in text:
            sys.exit("librechat.yaml has no custom-endpoints marker to attach MCP to.")
        text = text.replace(needle, snippet.rstrip() + "\n\n" + needle, 1)
        changed = True

if "mcp:Sulus-Apps:slack_list_users" not in text and "mcp:Sulus-Apps:list_hooks" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Apps:list_hooks'\n",
        "        - 'mcp:Sulus-Apps:list_hooks'\n"
        "        - 'mcp:Sulus-Apps:slack_list_users'\n"
        "        - 'mcp:Sulus-Apps:slack_search_users'\n"
        "        - 'mcp:Sulus-Apps:slack_list_channels'\n",
        1,
    )
    changed = True

if "mcp:Sulus-Apps:slack_send_message" not in text and "mcp:Sulus-Apps:trigger_hook" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Apps:trigger_hook'\n",
        "        - 'mcp:Sulus-Apps:trigger_hook'\n"
        "        - 'mcp:Sulus-Apps:slack_send_message'\n",
        1,
    )
    changed = True

if "mcp:Sulus-Files:find_files" not in text and "mcp:Sulus-Files:read_file" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Files:read_file'\n",
        "        - 'mcp:Sulus-Files:read_file'\n"
        "        - 'mcp:Sulus-Files:find_files'\n"
        "        - 'mcp:Sulus-Files:search_text'\n",
        1,
    )
    changed = True

if "mcp:Sulus-Apps:slack_read_messages" not in text and "mcp:Sulus-Apps:slack_list_channels" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Apps:slack_list_channels'\n",
        "        - 'mcp:Sulus-Apps:slack_list_channels'\n"
        "        - 'mcp:Sulus-Apps:slack_read_messages'\n",
        1,
    )
    changed = True

if "mcp:Sulus-Calendar:list_events" not in text and "mcp:Sulus-Apps:slack_read_messages" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Apps:slack_read_messages'\n",
        "        - 'mcp:Sulus-Apps:slack_read_messages'\n"
        "        - 'mcp:Sulus-Calendar:list_events'\n"
        "        - 'mcp:Sulus-Calendar:list_reminders'\n",
        1,
    )
    changed = True

if "mcp:Sulus-Calendar:create_event" not in text and "mcp:Sulus-Apps:slack_send_message" in text:
    text = text.replace(
        "        - 'mcp:Sulus-Apps:slack_send_message'\n",
        "        - 'mcp:Sulus-Apps:slack_send_message'\n"
        "        - 'mcp:Sulus-Calendar:create_event'\n"
        "        - 'mcp:Sulus-Calendar:add_reminder'\n",
        1,
    )
    changed = True

old_files = "Sulus-Files: Read files under the allowed folder on this Mac."
new_files = "Sulus-Files: Read files anywhere on this Mac."
if old_files in text:
    text = text.replace(old_files, new_files)
    changed = True

old_apps = "Sulus-Apps: Trigger configured app webhooks such as n8n."
new_apps = "Sulus-Apps: Send Slack messages and trigger configured app webhooks such as n8n."
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
        "        - 'mcp:Sulus-Files:list_directory'\n"
        "        - 'mcp:Sulus-Files:read_file'\n"
        "        - 'mcp:Sulus-Files:find_files'\n"
        "        - 'mcp:Sulus-Files:search_text'\n"
        "        - 'mcp:Sulus-Apps:list_hooks'\n"
        "        - 'mcp:Sulus-Apps:slack_list_users'\n"
        "        - 'mcp:Sulus-Apps:slack_search_users'\n"
        "        - 'mcp:Sulus-Apps:slack_list_channels'\n"
        "        - 'mcp:Sulus-Apps:slack_read_messages'\n"
        "        - 'mcp:Sulus-Calendar:list_events'\n"
        "        - 'mcp:Sulus-Calendar:list_reminders'\n"
        "      ask:\n"
        "        - 'mcp:Sulus-Files:write_file'\n"
        "        - 'mcp:Sulus-Shell:*'\n"
        "        - 'mcp:Sulus-Browser:*'\n"
        "        - 'mcp:Sulus-Desktop:*'\n"
        "        - 'mcp:Sulus-Apps:trigger_hook'\n"
        "        - 'mcp:Sulus-Apps:slack_send_message'\n"
        "        - 'mcp:Sulus-Calendar:create_event'\n"
        "        - 'mcp:Sulus-Calendar:add_reminder'\n"
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
