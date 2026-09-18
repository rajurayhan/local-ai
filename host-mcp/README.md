# RakaAI host MCP

Authored by **RakaAI** `<raju@sulus.ai>`.

A process on this Mac that LibreChat talks to over HTTP. Local models still only emit tool calls; this gateway is what reads files, runs allowlisted commands, opens pages, drives the desktop, posts to Slack, or talks to Calendar.

Shared MCP names:

- `RakaAI-Files`
- `RakaAI-Shell`
- `RakaAI-Browser`
- `RakaAI-Desktop`
- `RakaAI-Apps`
- `RakaAI-Calendar`

```
npm run start:device-mcp
```

That command installs dependencies and Playwright Chromium, writes `config.json` if needed, fills `DEVICE_MCP_TOKEN` in `.env`, wires `librechat.yaml`, and listens on port 8765.

Use a **RakaAI agent**, not the plain Ollama chat picker. Packs are split across agents so a 7B model is not given every tool at once:

- RakaAI — uploaded files, find/search/read any path on this Mac, images when asked (`RakaAI-Files`)
- RakaAI-Apps — Slack as you (`SLACK_USER_TOKEN`): list people and channels, read recent messages, send or reply in a thread, plus configured webhooks (`apps.hooks` in `config.json`)
- RakaAI-Browser — isolated Playwright session; waits for JavaScript and Cloudflare checks. Can list links and fill fields. Set `browser.headless` to `false` in `config.json` if a site still sticks on a challenge.
- RakaAI-Shell — one program at a time under the allowed folder; approval required
- RakaAI-Desktop — open apps or files, clipboard, menus, shortcuts, type, screenshot; approval required; macOS Accessibility / Screen Recording prompts
- RakaAI-Calendar — today's events, create an event, list and add Reminders; Calendar and Reminders permission prompts
- RakaAI-Code — sandboxed Code Interpreter (`npm run start:code-interpreter`)

`RakaAI-Files` can list, find by name, search text, and read any path on this Mac. Large files are read in slices. Writes stay under the configured folder and stay off until `files.writes` is true in `config.json`. Restart the API after YAML changes: `docker compose restart api`.

Slack stays on this Mac. Messages post as you, so install `host-mcp/slack-manifest.yaml` and put the **User OAuth Token** (`xoxp-...`) in `.env` as `SLACK_USER_TOKEN`. Reinstall the Slack app after a manifest change so history scopes are granted. A bot token can still list people. Pick the **RakaAI-Apps** agent to list or search people, list channels, read a `#channel`, or send. `@name` in the message mentions that person when the name is unique; `@here`, `@channel`, and `@everyone` are refused. Sends pause for approval. Do not put tokens in Docker or `librechat.yaml`.
