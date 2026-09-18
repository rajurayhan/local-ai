# RakaAI host MCP

Authored by **RakaAI** `<raju@sulus.ai>`.

A process on this Mac that LibreChat talks to over HTTP. Local models still only emit tool calls; this gateway is what reads files, runs allowlisted commands, opens pages, drives the desktop, or posts to configured app webhooks.

Shared MCP names:

- `RakaAI-Files`
- `RakaAI-Shell`
- `RakaAI-Browser`
- `RakaAI-Desktop`
- `RakaAI-Apps`

```
npm run start:device-mcp
```

That command installs dependencies and Playwright Chromium, writes `config.json` if needed, fills `DEVICE_MCP_TOKEN` in `.env`, wires `librechat.yaml`, and listens on port 8765.

Use a **RakaAI agent**, not the plain Ollama chat picker. Packs are split across agents so a 7B model is not given every tool at once:

- RakaAI — uploaded files, any path on this Mac, images when asked (`RakaAI-Files`)
- RakaAI-Apps — Slack as you (`SLACK_USER_TOKEN`), optional bot listing (`SLACK_BOT_TOKEN`), and configured webhooks (`apps.hooks` in `config.json`)
- RakaAI-Browser — isolated Playwright session; waits for JavaScript and Cloudflare checks. Set `browser.headless` to `false` in `config.json` if a site still sticks on a challenge.
- RakaAI-Shell — one program at a time under the allowed folder; approval required
- RakaAI-Desktop — open apps, click menus, press shortcuts, type, screenshot; approval required; macOS Accessibility / Screen Recording prompts
- RakaAI-Code — sandboxed Code Interpreter (`npm run start:code-interpreter`)

`RakaAI-Files` can list and read any path on this Mac. Writes stay under the configured folder and stay off until `files.writes` is true in `config.json`. Restart the API after YAML changes: `docker compose restart api`.

Slack stays on this Mac. Messages post as you, so install `host-mcp/slack-manifest.yaml` and put the **User OAuth Token** (`xoxp-...`) in `.env` as `SLACK_USER_TOKEN`. A bot token can still list people. Pick the **RakaAI-Apps** agent to list or search people, list channels, or send to a `#channel`. `@name` in the message mentions that person when the name is unique; `@here`, `@channel`, and `@everyone` are refused. Sends pause for approval. Do not put tokens in Docker or `librechat.yaml`.
