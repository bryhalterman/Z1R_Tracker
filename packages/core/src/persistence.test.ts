import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { migrate } from './persistence.js';
import { createInitialState, reduce, type TrackerState } from './state.js';
import { ITEMS_BY_ID } from './items.js';

/** A save written before hearts/keys/rupees and boss/map/compass were dropped. */
function legacySave(): Record<string, unknown> {
  return {
    version: 2,
    rev: 7,
    game: 'z1r',
    items: { sword: 2, bow: 1, heartContainers: 9, keys: 4, rupees: 120 },
    dungeons: {
      '1': {
        found: true,
        location: 'H7',
        cleared: true,
        triforce: true,
        map: true,
        compass: false,
        item: '',
        notes: '',
      },
    },
    marks: { H8: 'shop' },
    seed: { seed: '12345', dungeonQuest: '2nd' },
    locations: { 'd1.floor.0': { item: 'bow', collected: true } },
    extraFloorSlots: {},
    hints: [{ id: 'h3', subject: 'd5', region: 'lake', screen: '', note: 'x' }],
    hintSeq: 3,
    focusRegion: 'lake',
    startedAt: 1,
    updatedAt: 2,
  };
}

test('migrate drops item keys the model no longer defines', () => {
  const state = migrate(legacySave());
  assert.ok(state);
  for (const gone of ['heartContainers', 'keys', 'rupees']) {
    assert.equal(gone in state.items, false, `${gone} should have been pruned`);
  }
  // Everything left must be a real item, and nothing real may go missing.
  for (const id of Object.keys(state.items)) assert.ok(ITEMS_BY_ID.has(id), `unknown item ${id}`);
  assert.equal(Object.keys(state.items).length, ITEMS_BY_ID.size);
});

test('migrate drops dungeon fields the model no longer defines', () => {
  const state = migrate(legacySave());
  assert.ok(state);
  const dungeon = state.dungeons['1'];
  assert.ok(dungeon);
  assert.deepEqual(Object.keys(dungeon).sort(), ['found', 'item', 'location', 'notes', 'triforce']);
});

test('migrate keeps everything still in the model', () => {
  const state = migrate(legacySave());
  assert.ok(state);
  assert.equal(state.items['sword'], 2);
  assert.equal(state.items['bow'], 1);
  assert.equal(state.dungeons['1']?.triforce, true);
  assert.equal(state.dungeons['1']?.location, 'H7');
  assert.equal(state.marks['H8'], 'shop');
  assert.equal(state.seed.seed, '12345');
  assert.equal(state.seed.dungeonQuest, '2nd');
  assert.deepEqual(state.locations['d1.floor.0'], { item: 'bow', collected: true });
  assert.equal(state.hints.length, 1);
  assert.equal(state.focusRegion, 'lake');
});

test('migrate fills in settings added since the save was written', () => {
  const state = migrate(legacySave());
  assert.ok(state);
  // The save predates this flag; it must default rather than come back undefined.
  assert.equal(state.seed.mirroredOverworld, false);
});

test('hintSeq never lands on an id the save already uses', () => {
  const save = legacySave();
  save['hintSeq'] = 0; // stale counter, but a hint with id h3 exists
  const state = migrate(save);
  assert.ok(state);
  const next = reduce(state, { type: 'addHint' });
  const ids = next.hints.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, 'hint ids must stay unique');
});

test('rev increases on every change, so same-tick edits still sync', () => {
  // The whole reason sync orders by rev instead of updatedAt.
  let state: TrackerState = createInitialState('z1r', 1000);
  const revs: number[] = [];
  for (const id of ['bow', 'raft', 'ladder', 'book']) {
    state = reduce(state, { type: 'cycleItem', id, direction: 1 }, 1000);
    revs.push(state.rev);
  }
  assert.deepEqual(revs, [1, 2, 3, 4]);
  assert.equal(new Set(revs).size, revs.length);
});

test('collecting a Heart Container records the slot without touching inventory', () => {
  let state = createInitialState('z1r');
  state = reduce(state, { type: 'setLocation', id: 'd1.heart', item: 'heart' });
  state = reduce(state, { type: 'collectLocation', id: 'd1.heart', collected: true });
  assert.equal(state.locations['d1.heart']?.collected, true);
  assert.equal('heartContainers' in state.items, false);
});

test('collecting a real item raises it but unticking never revokes', () => {
  let state = createInitialState('z1r');
  state = reduce(state, { type: 'setLocation', id: 'd9.stair.0', item: 'silverArrow' });
  state = reduce(state, { type: 'collectLocation', id: 'd9.stair.0', collected: true });
  assert.equal(state.items['arrow'], 2);
  state = reduce(state, { type: 'collectLocation', id: 'd9.stair.0', collected: false });
  assert.equal(state.items['arrow'], 2, 'unticking must not revoke the item');
});
