import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { emptyNote, sameNote } from './notes.js';

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
