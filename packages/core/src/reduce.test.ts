import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createInitialState, reduce, type Action } from './state.js';
import { emptyRoom, roomIsBare, type RoomNote } from './rooms.js';

test('an action type with no handler leaves the state as it was', () => {
  const state = createInitialState(0);
  // Actions also arrive over a BroadcastChannel, where nothing has been
  // through the compiler.
  for (const type of ['notAnAction', 'toString', 'constructor', '__proto__']) {
    assert.equal(reduce(state, { type } as unknown as Action, 1), state);
  }
});

test('a handled edit still bumps rev and stamps updatedAt', () => {
  const state = createInitialState(0);
  const next = reduce(state, { type: 'setItem', id: 'sword', value: 1 }, 5);
  assert.equal(next.items['sword'], 1);
  assert.equal(next.rev, state.rev + 1);
  assert.equal(next.updatedAt, 5);
});

test('roomIsBare reads a flag left undefined as unset', () => {
  const room = { ...emptyRoom(), visited: undefined } as unknown as RoomNote;
  assert.equal(roomIsBare(room), true);
});

test('roomIsBare ignores a stray eviction stamp but not a recorded field', () => {
  assert.equal(roomIsBare({ ...emptyRoom(), transportSeq: 4 }), true);
  assert.equal(roomIsBare({ ...emptyRoom(), ladder: true }), false);
  assert.equal(roomIsBare({ ...emptyRoom(), layout: 'x' }), false);
  assert.equal(roomIsBare({ ...emptyRoom(), doors: { ...emptyRoom().doors, west: 'open' } }), false);
});

test('setRoomNote refuses a patch with one bad field, wherever it sits', () => {
  const state = createInitialState(0);
  const bad = [
    { cleared: 'yes' },
    { transport: 2.5 },
    { doors: { up: 'open' } },
    { known: true, visited: true },
  ];
  for (const patch of bad) {
    const action = { type: 'setRoomNote', level: 1, room: 'A1', patch } as unknown as Action;
    assert.equal(reduce(state, action, 1), state);
  }
});

test('setRoomNote never takes the eviction stamp from a caller', () => {
  const state = createInitialState(0);
  const next = reduce(
    state,
    { type: 'setRoomNote', level: 1, room: 'A1', patch: { visited: true, transportSeq: 9 } },
    1,
  );
  assert.equal(next.rooms['1']?.['A1']?.transportSeq, 0);
  assert.equal(next.rooms['1']?.['A1']?.visited, true);
});
