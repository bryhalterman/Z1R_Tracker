import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { clampWhole, emptyNote, sameNote } from './notes.js';

test('clampWhole keeps a whole number inside 0 to max', () => {
  assert.equal(clampWhole(3, 9), 3);
  assert.equal(clampWhole(12, 9), 9);
  assert.equal(clampWhole(-2, 9), 0);
});

test('clampWhole reads anything not whole as 0', () => {
  assert.equal(clampWhole(2.5, 9), 0);
  assert.equal(clampWhole(Number.NaN, 9), 0);
  assert.equal(clampWhole(Number.POSITIVE_INFINITY, 9), 0);
});

test('sameNote ignores the order prices were written in', () => {
  const a = { ...emptyNote(), shop: ['bomb', 'ring'], shopPrices: { bomb: 20, ring: 250 } };
  const b = { ...emptyNote(), shop: ['bomb', 'ring'], shopPrices: { ring: 250, bomb: 20 } };
  assert.equal(sameNote(a, b), true);
});

test('sameNote tells notes apart by any one field', () => {
  const base = emptyNote();
  assert.equal(sameNote(base, { ...base, dungeon: 3 }), false);
  assert.equal(sameNote(base, { ...base, collected: true }), false);
  assert.equal(sameNote(base, { ...base, blocks: ['bow'] }), false);
  assert.equal(sameNote(base, { ...base, shopPrices: { bomb: 20 } }), false);
});

test('sameNote treats a missing note as different from any note but another missing one', () => {
  assert.equal(sameNote(undefined, undefined), true);
  assert.equal(sameNote(emptyNote(), undefined), false);
  assert.equal(sameNote(undefined, emptyNote()), false);
});
