#!/usr/bin/env node
/*
 * Merge a CSV of sprite URLs into packages/core/src/sprites/manifest.json.
 *
 *   npm run sprites:import -- path/to/sprites.csv
 *
 * The CSV needs a header row. Recognised columns (case-insensitive):
 *
 *   key   the manifest key, e.g. item.sword.wood   (preferred — unambiguous)
 *   name  the display name, e.g. "Wooden Sword"    (used when key is absent)
 *   url   where the image lives
 *   glyph optional 1-3 character fallback
 *
 * Rows are merged, not replaced: keys the CSV doesn't mention keep their
 * current values, so you can import a partial sheet without losing work.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = fileURLToPath(
  new URL('../packages/core/src/sprites/manifest.json', import.meta.url),
);

/** Minimal RFC4180 parser — handles quoted fields, embedded commas and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) fail('usage: npm run sprites:import -- <sprites.csv>');

const [csvText, manifestText] = await Promise.all([
  readFile(csvPath, 'utf8').catch(() => fail(`cannot read ${csvPath}`)),
  readFile(MANIFEST_PATH, 'utf8'),
]);

const manifest = JSON.parse(manifestText);
const rows = parseCsv(csvText);
if (rows.length < 2) fail('the CSV needs a header row and at least one data row');

const header = (rows[0] ?? []).map((cell) => cell.trim().toLowerCase());
const columnOf = (...names) => {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
};

const keyColumn = columnOf('key', 'id', 'sprite');
const nameColumn = columnOf('name', 'label', 'sprite name');
const urlColumn = columnOf('url', 'link', 'src', 'href');
const glyphColumn = columnOf('glyph', 'fallback');

if (urlColumn === -1) fail('no `url` column found in the CSV header');
if (keyColumn === -1 && nameColumn === -1) fail('the CSV needs either a `key` or a `name` column');

// name -> key, so a CSV keyed by display name can still find its entry.
const byName = new Map(
  Object.entries(manifest.sprites).map(([key, entry]) => [
    String(entry.name).trim().toLowerCase(),
    key,
  ]),
);

let updated = 0;
const unmatched = [];

for (const row of rows.slice(1)) {
  const url = (row[urlColumn] ?? '').trim();
  if (!url) continue;

  const rawKey = keyColumn === -1 ? '' : (row[keyColumn] ?? '').trim();
  const rawName = nameColumn === -1 ? '' : (row[nameColumn] ?? '').trim();

  let key = rawKey;
  if (!key || !manifest.sprites[key]) {
    const matched = byName.get(rawName.toLowerCase());
    if (matched) key = matched;
  }

  if (!key) {
    unmatched.push(rawKey || rawName || '(blank)');
    continue;
  }

  // An unrecognised key is added rather than dropped — new art shouldn't
  // require editing the manifest by hand first.
  const existing = manifest.sprites[key] ?? { name: rawName || key };
  const glyph = glyphColumn === -1 ? '' : (row[glyphColumn] ?? '').trim();

  manifest.sprites[key] = {
    ...existing,
    name: existing.name ?? rawName ?? key,
    url,
    ...(glyph ? { glyph } : {}),
  };
  updated++;
}

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Updated ${updated} sprite${updated === 1 ? '' : 's'} in manifest.json`);
if (unmatched.length) {
  console.warn(`Skipped ${unmatched.length} row(s) with no matching key or name:`);
  for (const value of unmatched) console.warn(`  - ${value}`);
}
