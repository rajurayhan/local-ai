# RakaAI host MCP

A process on this Mac that LibreChat talks to over HTTP. Local models still only emit tool calls; this gateway is what reads files, runs allowlisted commands, opens pages, drives the desktop, or posts to configured app webhooks.

```
npm run start:device-mcp
```

That command installs dependencies, writes `config.json` if needed, fills `DEVICE_MCP_TOKEN` in `.env`, wires `librechat.yaml`, and listens on port 8765.

Use a **RakaAI agent**, not the plain Ollama chat picker. Packs are split across agents so a 7B model is not given every tool at once:

- RakaAI — uploaded files, `~/Documents/RakaAI`, images when asked
- RakaAI Apps — configured webhooks (`apps.hooks` in `config.json`)
- RakaAI Browser — isolated page open / read; install Playwright for click and screenshot
- RakaAI Shell — one program at a time under the allowed folder; approval required
- RakaAI Desktop — open apps, type, screenshot; approval required; macOS Accessibility / Screen Recording prompts

Writes to disk stay off until `files.writes` is true in `config.json`. Restart the API after YAML changes: `docker compose restart api`.
