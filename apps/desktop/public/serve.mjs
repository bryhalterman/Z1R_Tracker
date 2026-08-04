#!/usr/bin/env node
/*
 * Zero-dependency launcher for the downloadable build.
 *
 * Double-clicking index.html works, but a real http origin is what unlocks the
 * service worker (offline sprite caching) and cross-window sync with an OBS
 * dock. This serves the folder it lives in and opens a browser at it.
 *
 *   node serve.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
  }),
);

/** Resolves a URL path inside ROOT, or null if it tries to escape. */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const candidate = resolve(join(ROOT, normalize(decoded)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

const server = createServer(async (req, res) => {
  let target = safePath(req.url ?? '/');
  if (!target) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, 'index.html');

    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
      // The service worker owns caching; don't let the browser second-guess it.
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Z1R Tracker running at ${url}`);
  console.log('Press Ctrl+C to stop.');

  const opener =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is busy. Try: node serve.mjs ${PORT + 1}`);
    process.exit(1);
  }
  throw error;
});
