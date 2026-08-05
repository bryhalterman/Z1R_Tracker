#!/usr/bin/env node
/*
 * Report manifest coverage, and optionally verify every URL still resolves.
 *
 *   npm run sprites:check            list keys with no art wired up
 *   npm run sprites:check -- --fetch also HEAD every URL and flag dead links
 *
 * Exits non-zero only on dead links, never on unfilled keys — an unfilled key
 * renders as a glyph, which is a valid state, not a build failure.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = fileURLToPath(
  new URL('../packages/core/src/sprites/manifest.json', import.meta.url),
);
const VECTORS_PATH = fileURLToPath(
  new URL('../packages/core/src/sprites/vectors.ts', import.meta.url),
);

/**
 * Which keys have a drawn vector.
 *
 * Read by pattern rather than by importing, because this is a plain .mjs
 * script and `vectors.ts` would need a compile step. The shape it depends on
 * is one `'key': V(` entry per line in the VECTORS table.
 */
async function vectorKeys() {
  try {
    const source = await readFile(VECTORS_PATH, 'utf8');
    return new Set([...source.matchAll(/^\s*'([\w.]+)':\s*V\(/gm)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const entries = Object.entries(manifest.sprites);
const vectors = await vectorKeys();

const hasArt = ([key, entry]) => Boolean(entry.url || entry.sheet || vectors.has(key));
const unfilled = entries.filter((e) => !hasArt(e)).map(([key]) => key);
const filled = entries.filter(hasArt);
const drawn = entries.filter(([key, entry]) => !entry.url && !entry.sheet && vectors.has(key));

console.log(
  `${filled.length}/${entries.length} sprites render as art ` +
    `(${filled.length - drawn.length} from URLs, ${drawn.length} drawn as vectors).`,
);

if (unfilled.length) {
  console.log(`\nStill using letter fallbacks (${unfilled.length}):`);
  for (const key of unfilled) console.log(`  ${key}`);
}

if (!process.argv.includes('--fetch')) process.exit(0);

console.log('\nChecking URLs…');
const base = manifest.baseUrl ?? '';
const dead = [];

await Promise.all(
  filled.map(async ([key, entry]) => {
    const raw = entry.url ?? entry.sheet ?? '';
    const url = /^(https?:)?\/\//i.test(raw) ? raw : `${base.replace(/\/+$/, '')}/${raw}`;
    try {
      // Some hosts reject HEAD; fall back to a ranged GET before calling it dead.
      let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (!response.ok) {
        response = await fetch(url, { headers: { range: 'bytes=0-0' }, redirect: 'follow' });
      }
      if (!response.ok) dead.push(`${key} → ${url} (${response.status})`);
    } catch (error) {
      dead.push(`${key} → ${url} (${error instanceof Error ? error.message : 'failed'})`);
    }
  }),
);

if (dead.length) {
  console.error(`\n${dead.length} dead link(s):`);
  for (const line of dead) console.error(`  ${line}`);
  process.exit(1);
}

console.log('All sprite URLs resolved.');
