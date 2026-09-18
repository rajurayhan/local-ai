#!/usr/bin/env node
/**
 * Automatic1111-compatible /sdapi/v1/txt2img proxy for LibreChat's
 * stable-diffusion tool. Images are generated locally with MLX mflux
 * (Ollama 0.34+ no longer runs image models).
 *
 *   MFLUX_BIN=mflux-generate-flux2
 *   MFLUX_MODEL=flux2-klein-4b
 *   MFLUX_QUANTIZE=8
 *   MFLUX_STEPS=4
 *   MFLUX_MAX_DIM=768
 *   SD_PROXY_PORT=7860
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.SD_PROXY_PORT || 7860);
const HOST = process.env.SD_PROXY_HOST || '0.0.0.0';
const MFLUX_BIN = process.env.MFLUX_BIN || 'mflux-generate-flux2';
const MFLUX_MODEL = process.env.MFLUX_MODEL || 'flux2-klein-4b';
const MFLUX_QUANTIZE = Number(process.env.MFLUX_QUANTIZE || 8);
const DEFAULT_STEPS = Number(process.env.MFLUX_STEPS || 4);
const MAX_DIM = Number(process.env.MFLUX_MAX_DIM || 768);
const GENERATE_TIMEOUT_MS = Number(process.env.MFLUX_TIMEOUT_MS || 20 * 60 * 1000);

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

function clampDim(value, fallback = 768) {
  const n = Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  return Math.min(MAX_DIM, Math.max(256, n));
}

function resolveSteps(steps) {
  if (!Number.isFinite(steps) || steps <= 0 || steps === 22) {
    return DEFAULT_STEPS;
  }
  return Math.min(8, Math.max(1, Math.round(steps)));
}

function runMflux(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(MFLUX_BIN, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`mflux timed out after ${GENERATE_TIMEOUT_MS}ms`));
    }, GENERATE_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`mflux exited ${code}: ${(stderr || stdout).slice(0, 2000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function findOutputImage(dir, preferred) {
  if (preferred && fs.existsSync(preferred)) {
    return preferred;
  }
  const files = fs
    .readdirSync(dir)
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .map((name) => path.join(dir, name));
  if (files.length === 0) {
    return '';
  }
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

async function generateImage({ prompt, negative_prompt, width, height, steps, seed }) {
  const fullPrompt = String(prompt || '').trim();
  if (!fullPrompt) {
    throw new Error('Missing prompt');
  }

  const w = clampDim(width);
  const h = clampDim(height);
  const s = resolveSteps(steps);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-mflux-'));
  const outputPath = path.join(outDir, 'image.png');
  const args = [
    '--model',
    MFLUX_MODEL,
    '--prompt',
    fullPrompt,
    '--width',
    String(w),
    '--height',
    String(h),
    '--steps',
    String(s),
    '--quantize',
    String(MFLUX_QUANTIZE),
    '--output',
    outputPath,
  ];
  if (Number.isFinite(seed) && seed >= 0) {
    args.push('--seed', String(Math.round(seed)));
  }
  if (negative_prompt) {
    console.warn('[mflux-sd-proxy] ignoring negative_prompt; FLUX.2 does not support it');
  }

  try {
    await runMflux(args, outDir);
    const imagePath = findOutputImage(outDir, outputPath);
    if (!imagePath) {
      throw new Error('mflux finished without writing an image');
    }
    return {
      images: [fs.readFileSync(imagePath).toString('base64')],
      info: JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: '',
        seed: seed ?? -1,
        width: w,
        height: h,
        infotexts: [`${fullPrompt}\nmflux ${MFLUX_MODEL} q${MFLUX_QUANTIZE} ${s} steps`],
        model: MFLUX_MODEL,
      }),
    };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    json(res, 200, { status: 'ok', backend: 'mflux', model: MFLUX_MODEL });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sdapi/v1/sd-models') {
    json(res, 200, [{ title: MFLUX_MODEL, model_name: MFLUX_MODEL }]);
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
      console.error('[mflux-sd-proxy]', error.message);
      json(res, 500, { error: error.message });
    }
    return;
  }

  json(res, 404, { error: `Unsupported ${req.method} ${url.pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(
    `mflux SD proxy listening on http://${HOST}:${PORT} → ${MFLUX_BIN} ${MFLUX_MODEL} q${MFLUX_QUANTIZE}`,
  );
});
