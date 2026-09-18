import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { defaultConfig } from './config.ts';
import { createServer } from './server.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-mcp-'));
const token = 'test-token';
const server = createServer(
  defaultConfig({
    token,
    host: '127.0.0.1',
    port: 0,
    logPath: path.join(root, 'audit.log'),
    files: { root, writes: false, maxReadBytes: 1024 },
    shell: { cwdAllow: [root], denyBinaries: [], timeoutMs: 5000, maxOutputBytes: 4096 },
  }),
);

let base = '';

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('server did not bind');
  }
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  fs.rmSync(root, { recursive: true, force: true });
});

function sseData(text: string): Record<string, unknown> {
  const line = text.split('\n').find((row) => row.startsWith('data: '));
  assert.ok(line, text);
  return JSON.parse(line.slice(6)) as Record<string, unknown>;
}

async function mcpPost(pathname: string, body: unknown, sessionId?: string) {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    text: await response.text(),
    sessionId: response.headers.get('mcp-session-id'),
  };
}

async function initializeShell() {
  const init = await mcpPost('/mcp/shell', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.1' },
    },
  });
  assert.equal(init.response.status, 200);
  assert.ok(init.sessionId);
  return init.sessionId;
}

test('health lists the shared pack names', async () => {
  const response = await fetch(`${base}/health`);
  const body = (await response.json()) as { packs: string[] };
  assert.equal(response.status, 200);
  assert.deepEqual(body.packs, [
    'RakaAI-Files',
    'RakaAI-Shell',
    'RakaAI-Browser',
    'RakaAI-Desktop',
    'RakaAI-Apps',
    'RakaAI-Calendar',
  ]);
});

test('rejects unknown sessions instead of opening a new one', async () => {
  const missingGet = await fetch(`${base}/mcp/shell`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
      'mcp-session-id': 'missing-session',
    },
  });
  assert.equal(missingGet.status, 404);

  const missingPost = await mcpPost(
    '/mcp/shell',
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    'missing-session',
  );
  assert.equal(missingPost.response.status, 400);
  assert.equal(missingPost.sessionId, null);
});

test('keeps the shell session for the request after initialize', async () => {
  const sessionId = await initializeShell();

  const listed = await mcpPost(
    '/mcp/shell',
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    sessionId,
  );
  assert.equal(listed.response.status, 200);
  const listedData = sseData(listed.text);
  const result = listedData.result as { tools: Array<{ name: string }> };
  assert.equal(result.tools[0]?.name, 'run_command');

  const called = await mcpPost(
    '/mcp/shell',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'run_command', arguments: { command: 'pwd' } },
    },
    sessionId,
  );
  assert.equal(called.response.status, 200);
  const calledData = sseData(called.text);
  const tool = calledData.result as { content: Array<{ text: string }>; isError?: boolean };
  assert.equal(tool.isError, undefined);
  assert.match(tool.content[0]?.text ?? '', new RegExp(root));
});
