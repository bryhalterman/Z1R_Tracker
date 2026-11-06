import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createInitialState, deriveItemLocations, reduce } from '@z1r/core';
import { collectAction } from './collect.js';

test('an empty slot has nothing to collect', () => {
  assert.equal(collectAction(null), null);
});

test('a slot read off a room collects the room, and toggles', () => {
  const placement = { item: 'bow', collected: false, source: { kind: 'room', level: 2, room: 'C3' } } as const;
  assert.deepEqual(collectAction(placement), {
    type: 'collectRoom',
    level: 2,
    room: 'C3',
    collected: true,
  });
  assert.deepEqual(collectAction({ ...placement, collected: true }), {
    type: 'collectRoom',
    level: 2,
    room: 'C3',
    collected: false,
  });
});

test('a slot read off a screen collects the screen', () => {
  const placement = { item: 'raft', collected: true, source: { kind: 'screen', screen: 'F2' } } as const;
  assert.deepEqual(collectAction(placement), { type: 'collectScreen', screen: 'F2', collected: false });
});

test('a stored entry is collected under its own id, overflow included', () => {
  // A former extra floor slot has no slot of its own, only its stored id.
  let state = createInitialState();
  state.locations['d2.floor.3'] = { item: 'raft', collected: false };
  const chip = deriveItemLocations(state).overflow.get(2)?.[0] ?? null;
  const action = collectAction(chip);
  assert.deepEqual(action, { type: 'collectLocation', id: 'd2.floor.3', collected: true });
  assert.ok(action);
  state = reduce(state, action);
  assert.equal(state.locations['d2.floor.3']?.collected, true);
});
