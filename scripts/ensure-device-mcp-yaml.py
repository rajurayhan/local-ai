#!/usr/bin/env python3
"""Idempotently wire the host device MCP gateway into librechat.yaml."""

from pathlib import Path
import sys

yaml_path = Path(sys.argv[1])
snippet = Path(sys.argv[2]).read_text()
text = yaml_path.read_text()
changed = False

# Normalize legacy pack names to current SulusPersonal-* ids.
RENAMES = (
    ("rakaai-files", "SulusPersonal-Files"),
    ("rakaai-shell", "SulusPersonal-Shell"),
    ("rakaai-browser", "SulusPersonal-Browser"),
    ("rakaai-desktop", "SulusPersonal-Desktop"),
    ("rakaai-apps", "SulusPersonal-Apps"),
    ("rakaai-calendar", "SulusPersonal-Calendar"),
    ("RakaAI-Files", "SulusPersonal-Files"),
    ("RakaAI-Shell", "SulusPersonal-Shell"),
    ("RakaAI-Browser", "SulusPersonal-Browser"),
    ("RakaAI-Desktop", "SulusPersonal-Desktop"),
    ("RakaAI-Apps", "SulusPersonal-Apps"),
    ("RakaAI-Calendar", "SulusPersonal-Calendar"),
    ("Sulus-Files", "SulusPersonal-Files"),
    ("Sulus-Shell", "SulusPersonal-Shell"),
    ("Sulus-Browser", "SulusPersonal-Browser"),
    ("Sulus-Desktop", "SulusPersonal-Desktop"),
    ("Sulus-Apps", "SulusPersonal-Apps"),
    ("Sulus-Calendar", "SulusPersonal-Calendar"),
    ("sulus-files", "SulusPersonal-Files"),
    ("sulus-shell", "SulusPersonal-Shell"),
    ("sulus-browser", "SulusPersonal-Browser"),
    ("sulus-desktop", "SulusPersonal-Desktop"),
    ("sulus-apps", "SulusPersonal-Apps"),
    ("sulus-calendar", "SulusPersonal-Calendar"),
    ("suluspersonal-files", "SulusPersonal-Files"),
    ("suluspersonal-shell", "SulusPersonal-Shell"),
    ("suluspersonal-browser", "SulusPersonal-Browser"),
    ("suluspersonal-desktop", "SulusPersonal-Desktop"),
    ("suluspersonal-apps", "SulusPersonal-Apps"),
    ("suluspersonal-calendar", "SulusPersonal-Calendar"),
)

if any(old in text for old, _ in RENAMES):
    for old, new in RENAMES:
        if old in text:
            text = text.replace(old, new)
            changed = True
for old_author in ("Authored by RakaAI", "Authored by Sulus Personal AI"):
    if old_author in text:
        text = text.replace(old_author, "Authored by SulusPersonal")
        changed = True

CALENDAR_SERVER = (
    "  SulusPersonal-Calendar:\n"
    "    title: SulusPersonal-Calendar\n"
    "    description: 'SulusPersonal-Calendar: List and create Calendar events and Reminders on this Mac. Authored by SulusPersonal <raju@sulus.ai>.'\n"
    "    type: streamable-http\n"
    "    url: http://host.docker.internal:8765/mcp/calendar\n"
    "    timeout: 60000\n"
    "    apiKey:\n"
    "      source: admin\n"
    "      authorization_type: bearer\n"
    "      key: '${DEVICE_MCP_TOKEN}'\n"
)

if "SulusPersonal-Calendar:" not in text and "SulusPersonal-Apps:" in text:
    apps_end = text.find("# Definition of custom endpoints\n")
    if apps_end != -1:
        text = text[:apps_end] + CALENDAR_SERVER + "\n" + text[apps_end:]
        changed = True

if "title: SulusPersonal-Files" not in text:
    start = text.find("mcpSettings:\n  allowedAddresses:\n    - 'host.docker.internal:8765'")
    end = text.find("# Definition of custom endpoints\n")
    if start != -1 and end != -1 and start < end:
        text = text[:start] + snippet.rstrip() + "\n\n" + text[end:]
        changed = True
    elif "SulusPersonal-Files:" not in text and "suluspersonal-files:" not in text:
        needle = "# Definition of custom endpoints\n"
        if needle not in text:
            sys.exit("librechat.yaml has no custom-endpoints marker to attach MCP to.")
        text = text.replace(needle, snippet.rstrip() + "\n\n" + needle, 1)
        changed = True

if "mcp:SulusPersonal-Apps:slack_list_users" not in text and "mcp:SulusPersonal-Apps:list_hooks" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Apps:list_hooks'\n",
        "        - 'mcp:SulusPersonal-Apps:list_hooks'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_list_users'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_search_users'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_list_channels'\n",
        1,
    )
    changed = True

if "mcp:SulusPersonal-Apps:slack_send_message" not in text and "mcp:SulusPersonal-Apps:trigger_hook" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Apps:trigger_hook'\n",
        "        - 'mcp:SulusPersonal-Apps:trigger_hook'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_send_message'\n",
        1,
    )
    changed = True

if "mcp:SulusPersonal-Files:find_files" not in text and "mcp:SulusPersonal-Files:read_file" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Files:read_file'\n",
        "        - 'mcp:SulusPersonal-Files:read_file'\n"
        "        - 'mcp:SulusPersonal-Files:find_files'\n"
        "        - 'mcp:SulusPersonal-Files:search_text'\n",
        1,
    )
    changed = True

if "mcp:SulusPersonal-Apps:slack_read_messages" not in text and "mcp:SulusPersonal-Apps:slack_list_channels" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Apps:slack_list_channels'\n",
        "        - 'mcp:SulusPersonal-Apps:slack_list_channels'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_read_messages'\n",
        1,
    )
    changed = True

if "mcp:SulusPersonal-Calendar:list_events" not in text and "mcp:SulusPersonal-Apps:slack_read_messages" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Apps:slack_read_messages'\n",
        "        - 'mcp:SulusPersonal-Apps:slack_read_messages'\n"
        "        - 'mcp:SulusPersonal-Calendar:list_events'\n"
        "        - 'mcp:SulusPersonal-Calendar:list_reminders'\n",
        1,
    )
    changed = True

if "mcp:SulusPersonal-Calendar:create_event" not in text and "mcp:SulusPersonal-Apps:slack_send_message" in text:
    text = text.replace(
        "        - 'mcp:SulusPersonal-Apps:slack_send_message'\n",
        "        - 'mcp:SulusPersonal-Apps:slack_send_message'\n"
        "        - 'mcp:SulusPersonal-Calendar:create_event'\n"
        "        - 'mcp:SulusPersonal-Calendar:add_reminder'\n",
        1,
    )
    changed = True

old_files = "SulusPersonal-Files: Read files under the allowed folder on this Mac."
new_files = "SulusPersonal-Files: Read files anywhere on this Mac."
if old_files in text:
    text = text.replace(old_files, new_files)
    changed = True

old_apps = "SulusPersonal-Apps: Trigger configured app webhooks such as n8n."
new_apps = "SulusPersonal-Apps: Send Slack messages and trigger configured app webhooks such as n8n."
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
        "        - 'mcp:SulusPersonal-Files:list_directory'\n"
        "        - 'mcp:SulusPersonal-Files:read_file'\n"
        "        - 'mcp:SulusPersonal-Files:find_files'\n"
        "        - 'mcp:SulusPersonal-Files:search_text'\n"
        "        - 'mcp:SulusPersonal-Apps:list_hooks'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_list_users'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_search_users'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_list_channels'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_read_messages'\n"
        "        - 'mcp:SulusPersonal-Calendar:list_events'\n"
        "        - 'mcp:SulusPersonal-Calendar:list_reminders'\n"
        "      ask:\n"
        "        - 'mcp:SulusPersonal-Files:write_file'\n"
        "        - 'mcp:SulusPersonal-Shell:*'\n"
        "        - 'mcp:SulusPersonal-Browser:*'\n"
        "        - 'mcp:SulusPersonal-Desktop:*'\n"
        "        - 'mcp:SulusPersonal-Apps:trigger_hook'\n"
        "        - 'mcp:SulusPersonal-Apps:slack_send_message'\n"
        "        - 'mcp:SulusPersonal-Calendar:create_event'\n"
        "        - 'mcp:SulusPersonal-Calendar:add_reminder'\n"
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
