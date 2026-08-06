import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { migrate } from './persistence.js';
import { createInitialState, reduce, type TrackerState } from './state.js';
import { MARKS_BY_KIND } from './overworld.js';

import { COAST_SPOT_ID } from './overworld.js';

function marked(screen: string, mark: 'dungeon' | 'shop' | 'item' | 'visited'): TrackerState {
  return reduce(createInitialState(), { type: 'setMark', screen, mark });
}

test('the mark kinds are the ones the toolbar offers', () => {
  assert.deepEqual(
    [...MARKS_BY_KIND.keys()].sort(),
    ['dungeon', 'item', 'none', 'shop', 'visited'],
  );
});

test('a dungeon mark records which level', () => {
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 3 } });
  assert.equal(state.screenNotes['H8']?.dungeon, 3);
});

test('an unidentified dungeon stores nothing rather than a zero', () => {
  // 0 is the empty value, so it must not leave a key behind to be exported.
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 0 } });
  assert.equal('H8' in state.screenNotes, false);
});

test('dungeon numbers are clamped to real levels', () => {
  for (const [input, expected] of [
    [12, 9],
    [-3, 0],
    [Number.NaN, 0],
  ] as const) {
    const state = reduce(marked('H8', 'dungeon'), {
      type: 'setScreenNote',
      screen: 'H8',
      patch: { dungeon: input },
    });
    assert.equal(state.screenNotes['H8']?.dungeon ?? 0, expected, `dungeon ${String(input)}`);
  }
});

test('shop stock toggles on and off and stays sorted', () => {
  let state = marked('D4', 'shop');
  for (const stock of ['key', 'arrow', 'bomb']) {
    state = reduce(state, { type: 'toggleShopStock', screen: 'D4', stock });
  }
  // Sorted so the icons never reorder as you tick them, and two shops with the
  // same stock serialise identically.
  assert.deepEqual(state.screenNotes['D4']?.shop, ['arrow', 'bomb', 'key']);

  state = reduce(state, { type: 'toggleShopStock', screen: 'D4', stock: 'bomb' });
  assert.deepEqual(state.screenNotes['D4']?.shop, ['arrow', 'key']);
});

test('clearing a mark discards its detail', () => {
  /*
   * Otherwise re-marking the screen later silently restores a dungeon number
   * from a previous guess, which reads as the tracker inventing data.
   */
  let state = marked('H8', 'dungeon');
  state = reduce(state, { type: 'setScreenNote', screen: 'H8', patch: { dungeon: 7 } });
  state = reduce(state, { type: 'setMark', screen: 'H8', mark: 'none' });
  assert.equal('H8' in state.screenNotes, false);

  state = reduce(state, { type: 'setMark', screen: 'H8', mark: 'dungeon' });
  assert.equal(state.screenNotes['H8']?.dungeon ?? 0, 0);
});

test('the coast is identified by its tag, not by a screen id', () => {
  /*
   * It used to be a hardcoded screen, which was a guess about where the ledge
   * sits. Tagging means the ladder hint follows whichever screen was marked.
   */
  let state = marked('B3', 'item');
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'B3',
    patch: { spot: COAST_SPOT_ID },
  });
  assert.equal(state.screenNotes['B3']?.spot, COAST_SPOT_ID);
});

test('an item screen records its spot and its contents separately', () => {
  // Found the cave long before knowing what is in it — both halves optional.
  let state = marked('C2', 'item');
  state = reduce(state, { type: 'setScreenNote', screen: 'C2', patch: { spot: 'ow.whiteSword' } });
  assert.equal(state.screenNotes['C2']?.spot, 'ow.whiteSword');
  assert.equal(state.screenNotes['C2']?.item, '');

  state = reduce(state, { type: 'setScreenNote', screen: 'C2', patch: { item: 'raft' } });
  assert.equal(state.screenNotes['C2']?.item, 'raft');
});

test('a visited screen needs no detail to stick', () => {
  // "Checked, nothing here" is the whole content of the mark, so it must
  // survive with an empty note rather than being pruned away.
  const state = marked('D6', 'visited');
  assert.equal(state.marks['D6'], 'visited');
});

test('Blue Ring is stockable', () => {
  const state = reduce(marked('E2', 'shop'), {
    type: 'toggleShopStock',
    screen: 'E2',
    stock: 'blueRing',
  });
  assert.deepEqual(state.screenNotes['E2']?.shop, ['blueRing']);
});

/** `migrate` requires evidence a blob is really a save, so include the basics. */
function saveWith(extra: Record<string, unknown>): Record<string, unknown> {
  return { version: 5, rev: 3, items: {}, dungeons: {}, ...extra };
}

test('migrate drops marks whose kind no longer exists', () => {
  const save = saveWith({
    marks: { A1: 'bombable', B2: 'warp', C3: 'dungeon', D4: 'shop', E5: 'heart' },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(state.marks, { C3: 'dungeon', D4: 'shop' });
});

test('migrate rejects malformed screen notes', () => {
  const save = saveWith({
    marks: { A1: 'shop', A2: 'shop', A3: 'dungeon', A4: 'dungeon' },
    screenNotes: {
      // `shop` is mapped over when rendering, so a string here would iterate
      // character by character rather than throwing anywhere useful.
      A1: { dungeon: 0, shop: 'bomb', spot: '', item: '' },
      A2: { dungeon: 0, shop: ['bomb', 'nonsense', 'bomb'], spot: '', item: '' },
      A3: { dungeon: '4', shop: [], spot: '', item: '' },
      A4: { dungeon: 2, shop: [], spot: 'not-a-real-spot', item: 'not-a-pool-entry' },
      A5: null,
    },
  });
  const state = migrate(save);
  assert.ok(state);
  assert.equal('A1' in state.screenNotes, false, 'string shop is dropped entirely');
  assert.deepEqual(state.screenNotes['A2']?.shop, ['bomb'], 'unknown and duplicate ids removed');
  assert.equal(state.screenNotes['A3']?.dungeon, 4, 'numeric string coerced');
  assert.equal(state.screenNotes['A4']?.item, '', 'unknown pool entry cleared');
  assert.equal(state.screenNotes['A4']?.spot, '', 'unknown spot cleared');
  assert.equal('A5' in state.screenNotes, false);
});
