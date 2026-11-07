import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ItemPlacement, LocationDef } from '@z1r/core';
import { slotCode, slotText } from './locations/slot-words.js';

const coast = { id: 'ow.coast', label: 'Coast' } as LocationDef;
const floor = { id: 'l1.floor', label: 'Level 1 floor' } as LocationDef;

test('an overworld spot shows its own code, a dungeon slot its kind letter', () => {
  assert.equal(slotCode('overworld', coast), 'CO');
  assert.equal(slotCode('floor', floor), 'F');
  assert.equal(slotCode('stair', null), 'S');
  assert.equal(slotCode('mystery', null), '?');
});

test('a chip names its slot, its item and whether it is collected', () => {
  const placement = { item: 'raft', collected: true } as ItemPlacement;
  assert.equal(slotText('overworld', coast, placement, 'Raft'), 'Coast — Raft (collected)');
});

test('an empty slot says how to fill it', () => {
  assert.equal(
    slotText('floor', floor, null, undefined),
    'Level 1 floor — unknown — place it on a map to record it',
  );
});

test('an overflow chip is named by its kind', () => {
  const placement = { item: 'raft', collected: false } as ItemPlacement;
  assert.equal(slotText('stair', null, placement, 'Raft'), 'Extra behind a staircase / item basement — Raft');
});
