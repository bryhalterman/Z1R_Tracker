import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createInitialState, reduce } from '@z1r/core';
import { placedIndex } from './placed.js';

test('rooms, item screens and stored slots all land in one index', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 1, room: 'A1', patch: { item: 'bow' } });
  state.locations['d3.stair.0'] = { item: 'raft', collected: false };
  const index = placedIndex(state);
  assert.deepEqual(index.get('bow'), ['L1 A1']);
  assert.deepEqual(index.get('raft'), ['L3 stair']);
});

test('former extra floor slots read by index, so two in one level differ', () => {
  const state = createInitialState();
  state.locations['d2.floor.2'] = { item: 'raft', collected: false };
  state.locations['d2.floor.3'] = { item: 'book', collected: true };
  const index = placedIndex(state);
  assert.deepEqual(index.get('raft'), ['L2 extra floor 3']);
  assert.deepEqual(index.get('book'), ['L2 extra floor 4']);
});
