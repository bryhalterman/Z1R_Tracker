import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { canBeatGanon, canEnterLevel9 } from './logic.js';
import { createInitialState, type TrackerState } from './state.js';

/**
 * `triforce` on levels 1-8, plus whatever items are named.
 *
 * Level 9 is deliberately never set: it holds Ganon rather than a piece, and a
 * count that included it would let the tracker claim the run was winnable one
 * piece early.
 */
function stateWith(pieces: number, items: Record<string, number> = {}): TrackerState {
  const state = createInitialState();
  for (let level = 1; level <= pieces; level++) {
    state.dungeons[String(level)] = { triforce: true };
  }
  return { ...state, items: { ...state.items, ...items } };
}

const FULL_KIT = { bow: 1, arrow: 2 };

test('canEnterLevel9 needs every piece', () => {
  assert.equal(canEnterLevel9(stateWith(7)), false);
  assert.equal(canEnterLevel9(stateWith(8)), true);
});

test('canBeatGanon needs the pieces, the bow and the silver arrow', () => {
  assert.equal(canBeatGanon(stateWith(8, FULL_KIT)), true);
});

test('canBeatGanon is false when any one requirement is missing', () => {
  // Each case drops exactly one leg of the three-part condition.
  assert.equal(canBeatGanon(stateWith(7, FULL_KIT)), false, 'seven pieces');
  assert.equal(canBeatGanon(stateWith(8, { bow: 0, arrow: 2 })), false, 'no bow');
  assert.equal(canBeatGanon(stateWith(8, { bow: 1, arrow: 1 })), false, 'wooden arrow only');
  assert.equal(canBeatGanon(stateWith(8, { bow: 1, arrow: 0 })), false, 'no arrow');
});

test('canBeatGanon rejects the wooden arrow specifically', () => {
  /*
   * `arrow` is progressive — stage 1 is Wooden, stage 2 Silver — so this is an
   * off-by-one waiting to happen, and getting it wrong would tell a streamer
   * mid-run that they could finish when Ganon is still invulnerable to them.
   */
  assert.equal(canBeatGanon(stateWith(8, { bow: 1, arrow: 1 })), false);
  assert.equal(canBeatGanon(stateWith(8, { bow: 1, arrow: 2 })), true);
});

test('canBeatGanon ignores a Triforce flag on Level 9', () => {
  const state = stateWith(7, FULL_KIT);
  state.dungeons['9'] = { triforce: true };
  assert.equal(canBeatGanon(state), false);
});

test('canBeatGanon tolerates a save with no items recorded', () => {
  const state = stateWith(8);
  state.items = {};
  assert.equal(canBeatGanon(state), false);
});
