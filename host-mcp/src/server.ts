import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { loadConfig } from './config.ts';
import { PACK_AUTHOR } from './identity.ts';
import { hashArgs, writeAudit } from './log.ts';
import { createPacks, PACK_NAMES } from './packs.ts';
import type { DeviceConfig, JsonSchema, Pack, PackName } from './types.ts';

const sessions = new Map<string, StreamableHTTPServerTransport>();

function isPackName(value: string): value is PackName {
  return PACK_NAMES.includes(value as PackName);
}

function toZodShape(schema: JsonSchema): z.ZodRawShape {
  const shape: z.ZodRawShape = {};
  for (const key of Object.keys(schema.properties)) {
    const field = schema.required?.includes(key) ? z.string() : z.string().optional();
    shape[key] = field;
  }
  return shape;
}

function registerPack(server: McpServer, pack: Pack, config: DeviceConfig): void {
  for (const tool of pack.tools) {
    server.tool(tool.name, tool.description, toZodShape(tool.inputSchema), async (args) => {
      const started = Date.now();
      const result = await tool.handler(args as Record<string, unknown>);
      writeAudit(config.logPath, {
        pack: pack.name,
        tool: tool.name,
        argsHash: hashArgs(args),
        ok: result.isError !== true,
        ms: Date.now() - started,
        error: result.isError === true ? 'tool_error' : undefined,
      });
      return result;
    });
  }
}

function authorize(req: http.IncomingMessage, token: string): boolean {
  if (!token) {
    return false;
  }
  const header = req.headers.authorization;
  return header === `Bearer ${token}`;
}

function sessionKey(packName: PackName, sessionId: string): string {
  return `${packName}:${sessionId}`;
}

function rejectSession(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method === 'GET') {
    res.writeHead(404).end('Not Found');
    return;
  }

  res
    .writeHead(400, { 'Content-Type': 'application/json' })
    .end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      }),
    );
}

async function handleMcp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pack: Pack,
  config: DeviceConfig,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'];
  const existing = typeof sessionId === 'string' ? sessions.get(sessionKey(pack.name, sessionId)) : undefined;

  if (existing) {
    await existing.handleRequest(req, res);
    return;
  }

  if (typeof sessionId === 'string' || req.method !== 'POST') {
    rejectSession(req, res);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sessionKey(pack.name, sid), transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(sessionKey(pack.name, transport.sessionId));
    }
  };

  const mcp = new McpServer(
    {
      name: pack.shareName,
      title: pack.shareName,
      version: '1.0.0',
      websiteUrl: 'https://github.com/rajurayhan/local-ai',
    },
    {
      instructions: pack.description,
    },
  );
  registerPack(mcp, pack, config);
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
}

export function createServer(config: DeviceConfig): http.Server {
  fs.mkdirSync(config.files.root, { recursive: true });
  const packs = createPacks(config);

  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            ok: true,
            author: PACK_AUTHOR,
            packs: PACK_NAMES.map((name) => packs[name].shareName),
            slack: config.apps.slackUserToken.length > 0,
            slackBot: config.apps.slackToken.length > 0,
          }),
        );
        return;
      }

      const match = /^\/mcp\/([^/]+)\/?$/.exec(url.pathname);
      if (!match || !isPackName(match[1])) {
        res.writeHead(404).end('Not found');
        return;
      }

      if (!authorize(req, config.token)) {
        res.writeHead(401).end('Unauthorized');
        return;
      }

      await handleMcp(req, res, packs[match[1]], config);
    })().catch((error: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500).end(error instanceof Error ? error.message : 'Internal error');
      }
    });
  });
}

const isMain = process.argv[1] != null && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain || process.argv[1]?.endsWith('server.ts')) {
  const config = loadConfig();
  if (!config.token) {
    console.error('DEVICE_MCP_TOKEN is required (set it in .env or host-mcp/config.json).');
    process.exit(1);
  }
  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`RakaAI device MCP listening on http://${config.host}:${config.port}`);
    console.log(`Packs: ${PACK_NAMES.map((name) => `/mcp/${name}`).join(', ')}`);
  });
}
