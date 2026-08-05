/**
 * Static file server for the built OBS pages.
 *
 * OBS needs the overlay and the dock to come from one HTTP origin. They sync
 * through localStorage and a BroadcastChannel, and both are scoped per origin
 * — two `file://` pages in OBS do not share one, so the dock's edits never
 * reach the overlay. This serves `apps/obs/dist` so they do.
 *
 *   node scripts/serve.mjs [--port 4178] [--dir apps/obs/dist]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const port = Number(flag('port', '4178')) || 4178;
const root = resolve(REPO, flag('dir', join('apps', 'obs', 'dist')));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  let rel = '/';
  try {
    // Decoding lives inside the try: a malformed escape like `/%ZZ` makes
    // decodeURIComponent throw, and an unhandled throw here takes the whole
    // server down mid-stream rather than returning a 400.
    rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request URI');
    return;
  }

  if (rel.endsWith('/')) rel += 'index.html';

  // Resolve first, then check containment. Testing the raw string for '..' is
  // not enough — it misses encoded and mixed-separator forms.
  const target = resolve(root, normalize(rel).replace(/^[\\/]+/, ''));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      // OBS caches browser sources hard, so a rebuild would otherwise still
      // show the old page until you clear the cache by hand.
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${rel}`);
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Serving ${root}\n` +
      `  setup    http://127.0.0.1:${port}/\n` +
      `  overlay  http://127.0.0.1:${port}/overlay.html\n` +
      `  dock     http://127.0.0.1:${port}/dock.html\n`,
  );
});
