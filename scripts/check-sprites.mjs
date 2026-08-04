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

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const entries = Object.entries(manifest.sprites);

const unfilled = entries.filter(([, entry]) => !entry.url && !entry.sheet).map(([key]) => key);
const filled = entries.filter(([, entry]) => entry.url || entry.sheet);

console.log(`${filled.length}/${entries.length} sprites have art.`);

if (unfilled.length) {
  console.log(`\nStill using glyph fallbacks (${unfilled.length}):`);
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
