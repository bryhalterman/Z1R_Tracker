#!/usr/bin/env node
/*
 * Minimal test runner.
 *
 * Node can't load the `.ts` sources directly — they import each other with
 * `.js` specifiers that only a bundler resolves — so esbuild (already present
 * as a Vite dependency) bundles every `*.test.ts` into one file and Node's
 * built-in test runner executes it. No new dependencies, no config.
 *
 *   npm test
 */

import { mkdir, rm, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.test-build');

/** Every *.test.ts under packages/, found without a glob dependency. */
async function findTests(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findTests(full)));
    else if (entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const tests = await findTests(join(ROOT, 'packages'));
if (tests.length === 0) {
  console.log('No *.test.ts files found.');
  process.exit(0);
}
console.log(`Bundling ${tests.length} test file(s):`);
for (const t of tests) console.log(`  ${relative(ROOT, t)}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await build({
  entryPoints: tests,
  outdir: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Node's test runner and assert must stay external, not get inlined.
  external: ['node:*'],
  logLevel: 'warning',
});

const outFiles = (await readdir(OUT)).filter((f) => f.endsWith('.js')).map((f) => join(OUT, f));
const child = spawn(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
