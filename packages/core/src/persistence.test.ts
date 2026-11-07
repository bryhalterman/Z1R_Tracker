import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { importState, migrate } from './persistence.js';
import { createInitialState, reduce, type TrackerState } from './state.js';
import { ITEMS_BY_ID, maxValue } from './items.js';
import { overworldMap } from './seed.js';

/** A save written before hearts/keys/rupees and boss/map/compass were dropped. */
function legacySave(): Record<string, unknown> {
  return {
    version: 2,
    rev: 7,
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
  // The legacy save carries found/cleared/map/compass/item/notes/location.
  // Only the one field the model still defines may survive.
  assert.deepEqual(Object.keys(dungeon).sort(), ['triforce']);
});

test('migrate keeps everything still in the model', () => {
  const state = migrate(legacySave());
  assert.ok(state);
  assert.equal(state.items['sword'], 2);
  assert.equal(state.items['bow'], 1);
  assert.equal(state.dungeons['1']?.triforce, true);
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
  let state: TrackerState = createInitialState(1000);
  const revs: number[] = [];
  for (const id of ['bow', 'raft', 'ladder', 'book']) {
    state = reduce(state, { type: 'cycleItem', id, direction: 1 }, 1000);
    revs.push(state.rev);
  }
  assert.deepEqual(revs, [1, 2, 3, 4]);
  assert.equal(new Set(revs).size, revs.length);
});

test('collecting a Heart Container records the slot without touching inventory', () => {
  let state = createInitialState();
  state.locations['d1.heart'] = { item: 'heart', collected: false };
  state = reduce(state, { type: 'collectLocation', id: 'd1.heart', collected: true });
  assert.equal(state.locations['d1.heart']?.collected, true);
  assert.equal('heartContainers' in state.items, false);
});

test('collecting a real item raises it but unticking never revokes', () => {
  let state = createInitialState();
  state.locations['d9.stair.0'] = { item: 'silverArrow', collected: false };
  state = reduce(state, { type: 'collectLocation', id: 'd9.stair.0', collected: true });
  assert.equal(state.items['arrow'], 2);
  state = reduce(state, { type: 'collectLocation', id: 'd9.stair.0', collected: false });
  assert.equal(state.items['arrow'], 2, 'unticking must not revoke the item');
});

/*
 * Negative tests.
 *
 * Before these, all three of `migrate`'s null-returning guards could be deleted
 * with the suite still green, and `importState` — the only door untrusted files
 * come through — had no test at all.
 */

test('migrate rejects things that are not tracker saves', () => {
  for (const junk of [
    null,
    undefined,
    42,
    'a string',
    {},
    { version: 'one' },
    // Accepted before: a numeric version was the entire check, so importing any
    // versioned JSON wiped the run and reported success.
    { version: 1 },
    { version: 3, items: {} },
    { version: 999, items: {}, dungeons: {} },
  ]) {
    assert.equal(migrate(junk), null, `should reject ${JSON.stringify(junk)}`);
  }
});

test('importState throws rather than returning a blank run', () => {
  assert.throws(() => importState('not json'), /not valid JSON/);
  assert.throws(() => importState('{"version":1}'), /not a Z1R_Tracker save/);
  assert.throws(() => importState('[]'), /not a Z1R_Tracker save/);
});

test('migrate survives a hints array containing junk', () => {
  const save = { ...legacySave(), hints: [null, 'x', {}, { id: 'h9', subject: 'd1' }] };
  const state = migrate(save);
  assert.ok(state);
  // A null here used to throw on every render — the panel indexes into it.
  assert.equal(state.hints.length, 1);
  assert.equal(state.hints[0]?.id, 'h9');
  assert.equal(typeof state.hints[0]?.note, 'string');
});

test('migrate rejects out-of-range enum settings instead of trusting them', () => {
  const save = {
    ...legacySave(),
    seed: { dungeonQuest: '3rd', itemShuffle: 'nonsense', questLow: 'x', questHigh: 'y' },
  };
  const state = migrate(save);
  assert.ok(state);
  // questForLevel indexes a table with these; a bad value was a TypeError on render.
  assert.equal(state.seed.dungeonQuest, '1st');
  assert.equal(state.seed.itemShuffle, 'items-hearts');
  assert.equal(state.seed.questLow, '1st');
  assert.equal(state.seed.questHigh, '1st');
});

test('migrate drops the extra floor slots older saves carry', () => {
  // Five million used to build five million location rows on the render path.
  const save = { ...legacySave(), extraFloorSlots: { '1': 5_000_000, '2': 3 } };
  const state = migrate(save);
  assert.ok(state);
  assert.equal('extraFloorSlots' in state, false);
  assert.equal(state.locations['d1.floor.1'], undefined);
});

test('migrate drops unknown top-level keys instead of persisting them forever', () => {
  const save = { ...legacySave(), somethingElse: 'hello', anotherThing: { deep: 1 } };
  const state = migrate(save) as unknown as Record<string, unknown>;
  assert.ok(state);
  assert.equal('somethingElse' in state, false);
  assert.equal('anotherThing' in state, false);
});

/*
 * Regressions from review loop 2. Every one of these was reproduced against the
 * real bundle before being fixed, and none was caught by the tests above —
 * which only ever fed `migrate` well-typed numbers.
 */

test('migrate rejects a non-finite rev, which would deadlock cross-window sync', () => {
  // JSON has no Infinity literal, but 1e400 overflows to one. applyRemote gates
  // on `incoming.rev <= current.rev`, so once both windows reach Infinity every
  // later edit is dropped silently by the OBS browser source.
  const state = migrate(JSON.parse('{"version":5,"items":{},"dungeons":{},"rev":1e400}'));
  assert.ok(state);
  assert.equal(Number.isFinite(state.rev), true);
  assert.equal(state.rev, 0);

  const fractional = migrate({ ...legacySave(), rev: 1.5 });
  assert.ok(fractional);
  assert.equal(Number.isInteger(fractional.rev), true);
});

test('migrate coerces hintSeq so new hints cannot collide', () => {
  // A string hintSeq made Math.max return NaN, so every added hint got the id
  // "hNaN" — editing one note edited all of them, and removing one row removed
  // the entire log.
  for (const bad of ['abc', null, undefined, {}]) {
    let state = migrate({ ...legacySave(), hintSeq: bad });
    assert.ok(state);
    assert.equal(Number.isFinite(state.hintSeq), true);

    state = reduce(state, { type: 'addHint' });
    state = reduce(state, { type: 'addHint' });
    const ids = state.hints.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, `ids must stay unique for hintSeq=${String(bad)}`);
    assert.equal(
      ids.some((id) => id.includes('NaN')),
      false,
    );
  }
});

test('migrate keeps hintSeq above ids already present in the save', () => {
  const state = migrate({ ...legacySave(), hintSeq: 0, hints: [{ id: 'h42' }] });
  assert.ok(state);
  const next = reduce(state, { type: 'addHint' });
  assert.equal(
    next.hints.some((h) => h.id === 'h42'),
    true,
  );
  assert.equal(next.hints.filter((h) => h.id === 'h42').length, 1);
});

test('the overworld quest survives a save, and defaults to 1st Quest in older or damaged ones', () => {
  const state = createInitialState();
  state.seed.overworldQuest = 'mixed-2nd';
  assert.equal(migrate(JSON.parse(JSON.stringify(state)))?.seed.overworldQuest, 'mixed-2nd');
  const older = JSON.parse(JSON.stringify(state));
  delete older.seed.overworldQuest;
  assert.equal(migrate(older)?.seed.overworldQuest, '1st');
  const damaged = JSON.parse(JSON.stringify(state));
  damaged.seed.overworldQuest = 'third';
  assert.equal(migrate(damaged)?.seed.overworldQuest, '1st');
});

test('each overworld quest names its map, and Random shows the 1st Quest map', () => {
  assert.equal(overworldMap('1st'), '1st');
  assert.equal(overworldMap('2nd'), '2nd');
  assert.equal(overworldMap('mixed-1st'), 'mixed');
  assert.equal(overworldMap('mixed-2nd'), 'mixed');
  assert.equal(overworldMap('random'), '1st');
});

test('migrate clamps item values to what each item can hold', () => {
  const save = JSON.parse(JSON.stringify(createInitialState()));
  Object.assign(save.items, { arrow: 99, bow: -3, candle: 1.5, sword: 'x' });
  const state = migrate(save);
  assert.ok(state);
  const arrow = ITEMS_BY_ID.get('arrow');
  assert.ok(arrow);
  assert.equal(state.items['arrow'], maxValue(arrow));
  assert.equal(state.items['bow'], 0);
  assert.equal(state.items['candle'], 1);
  // The wrong type falls back to the empty value, as before.
  assert.equal(state.items['sword'], 0);
});

test('migrate checks stored locations instead of spreading them in', () => {
  for (const locations of ['abc', ['x', 'y'], 7, null]) {
    const save = { ...JSON.parse(JSON.stringify(createInitialState())), locations };
    const state = migrate(save);
    assert.ok(state);
    assert.deepEqual(state.locations, {}, JSON.stringify(locations));
  }
  const save = JSON.parse(JSON.stringify(createInitialState()));
  save.locations = {
    'd1.floor.0': { item: 'bow', collected: true },
    'd2.floor.0': { item: 'not-an-item', collected: false },
    'd3.floor.0': { item: '', collected: true },
    'd4.floor.0': 'bow',
    'zz.bogus': { item: 'bow', collected: true },
    'd2.floor.3': { item: 'raft', collected: false },
  };
  const state = migrate(save);
  assert.ok(state);
  assert.deepEqual(state.locations, {
    'd1.floor.0': { item: 'bow', collected: true },
    'd3.floor.0': { item: '', collected: true },
    // A former extra floor slot is kept; it is shown as overflow.
    'd2.floor.3': { item: 'raft', collected: false },
  });
});

test('migrate keeps when the run started and was last edited', () => {
  const save = JSON.parse(JSON.stringify(createInitialState(1000)));
  save.updatedAt = 5000;
  const state = migrate(save);
  assert.ok(state);
  assert.equal(state.startedAt, 1000);
  assert.equal(state.updatedAt, 5000);
  // Not a time: falls back to now rather than being kept.
  const bad = migrate({ ...save, startedAt: 'yesterday', updatedAt: -1 });
  assert.ok(bad);
  assert.ok(bad.startedAt > 5000 && bad.updatedAt > 5000);
});

test('migrate stores rooms under the level key the reducer reads', () => {
  const save = JSON.parse(JSON.stringify(createInitialState()));
  save.rooms = { '03': { A1: { visited: true } } };
  const state = migrate(save);
  assert.ok(state);
  assert.equal(state.rooms['3']?.A1?.visited, true);
  assert.equal('03' in state.rooms, false);
});

test('collectLocation refuses an empty entry and ignores a repeat', () => {
  const base = createInitialState();
  assert.equal(reduce(base, { type: 'collectLocation', id: 'd1.floor.0', collected: true }), base);
  const stored = createInitialState();
  stored.locations['d1.floor.0'] = { item: 'bow', collected: false };
  const collected = reduce(stored, { type: 'collectLocation', id: 'd1.floor.0', collected: true });
  assert.equal(collected.locations['d1.floor.0']?.collected, true);
  assert.equal(reduce(collected, { type: 'collectLocation', id: 'd1.floor.0', collected: true }), collected);
});
