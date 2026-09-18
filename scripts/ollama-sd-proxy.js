#!/usr/bin/env node
/**
 * Tiny Automatic1111-compatible /sdapi/v1/txt2img proxy in front of Ollama
 * image generation (macOS experimental, 0.13+/0.34+).
 *
 * LibreChat's built-in `stable-diffusion` tool posts here. Ollama does not
 * expose that API itself, so this process translates the call.
 *
 *   OLLAMA_URL=http://127.0.0.1:11434
 *   OLLAMA_IMAGE_MODEL=x/flux2-klein:4b
 *   SD_PROXY_PORT=7860
 */

'use strict';

const http = require('http');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_IMAGE_MODEL || 'x/flux2-klein:4b';
const PORT = Number(process.env.SD_PROXY_PORT || 7860);
const HOST = process.env.SD_PROXY_HOST || '0.0.0.0';
const GENERATE_TIMEOUT_MS = Number(process.env.OLLAMA_IMAGE_TIMEOUT_MS || 10 * 60 * 1000);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function stripDataUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  const marker = 'base64,';
  const index = trimmed.indexOf(marker);
  return index >= 0 ? trimmed.slice(index + marker.length) : trimmed;
}

function collectImages(payload) {
  const found = [];
  const push = (value) => {
    if (typeof value === 'string' && value.length > 32) {
      found.push(stripDataUrl(value));
    }
  };

  if (!payload || typeof payload !== 'object') {
    return found;
  }

  if (Array.isArray(payload.images)) {
    payload.images.forEach(push);
  }

  const message = payload.message;
  if (message && Array.isArray(message.images)) {
    message.images.forEach(push);
  }

  return found;
}

async function ollamaPost(pathname, body) {
  const response = await fetch(`${OLLAMA_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const detail = data.error || data.message || text || response.statusText;
    throw new Error(`Ollama ${pathname} ${response.status}: ${detail}`);
  }
  return data;
}

function buildPrompt(prompt, negativePrompt) {
  const main = String(prompt || '').trim();
  const negative = String(negativePrompt || '').trim();
  if (!negative) {
    return main;
  }
  return `${main}\n\nNegative prompt: ${negative}`;
}

async function generateImage({ prompt, negative_prompt, width, height, steps, seed }) {
  const fullPrompt = buildPrompt(prompt, negative_prompt);
  const options = {};
  if (Number.isFinite(width) && width > 0) {
    options.width = Math.round(width);
  }
  if (Number.isFinite(height) && height > 0) {
    options.height = Math.round(height);
  }
  if (Number.isFinite(steps) && steps > 0) {
    options.num_predict = Math.round(steps);
  }
  if (Number.isFinite(seed)) {
    options.seed = Math.round(seed);
  }

  const generateBody = {
    model: MODEL,
    prompt: fullPrompt,
    stream: false,
    keep_alive: process.env.OLLAMA_IMAGE_KEEP_ALIVE || '2m',
    options,
  };

  let payload;
  try {
    payload = await ollamaPost('/api/generate', generateBody);
  } catch (generateError) {
    payload = await ollamaPost('/api/chat', {
      model: MODEL,
      stream: false,
      keep_alive: generateBody.keep_alive,
      options,
      messages: [{ role: 'user', content: fullPrompt }],
    }).catch((chatError) => {
      throw new Error(`${generateError.message}; chat fallback: ${chatError.message}`);
    });
  }

  const images = collectImages(payload);
  if (images.length === 0) {
    const preview = JSON.stringify(payload).slice(0, 400);
    throw new Error(`Ollama returned no image data. Response preview: ${preview}`);
  }

  return {
    images,
    info: JSON.stringify({
      prompt: fullPrompt,
      negative_prompt: negative_prompt || '',
      seed: seed ?? -1,
      width: width || 1024,
      height: height || 1024,
      infotexts: [`${fullPrompt}\nOllama ${MODEL}`],
      model: MODEL,
    }),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    json(res, 200, { status: 'ok', model: MODEL, ollama: OLLAMA_URL });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sdapi/v1/sd-models') {
    json(res, 200, [{ title: MODEL, model_name: MODEL }]);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/sdapi/v1/txt2img') {
    try {
      const body = await readBody(req);
      const result = await generateImage({
        prompt: body.prompt,
        negative_prompt: body.negative_prompt,
        width: body.width,
        height: body.height,
        steps: body.steps,
        seed: body.seed,
      });
      json(res, 200, result);
    } catch (error) {
      console.error('[ollama-sd-proxy]', error.message);
      json(res, 500, { error: error.message });
    }
    return;
  }

  json(res, 404, { error: `Unsupported ${req.method} ${url.pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(
    `Ollama SD proxy listening on http://${HOST}:${PORT} → ${OLLAMA_URL} model ${MODEL}`,
  );
});
