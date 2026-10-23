import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { dungeonItems } from './logic.js';
import { migrate } from './persistence.js';
import { deriveItemLocations } from './placements.js';
import { emptyRoom, resolveRoomFrom, roomIsBare, type RoomFrom } from './rooms.js';
import { createInitialState, reduce, STATE_VERSION, type TrackerState } from './state.js';

/*
 * Slot shapes these tests lean on, from the default seed (1st Quest, no extra
 * floor slots): Level 1 has one floor, one stair and a heart; Level 2 has one
 * floor and a heart; Level 8 has two stairs and a heart.
 */

/** Place an item in a room, with whatever else the room needs to say. */
function placeRoom(
  state: TrackerState,
  level: number,
  room: string,
  item: string,
  extra: { boss?: string; stairs?: 'none' | 'item' | 'transport'; from?: RoomFrom } = {},
): TrackerState {
  return reduce(state, { type: 'setRoomNote', level, room, patch: { item, ...extra } });
}

function slot(state: TrackerState, id: string) {
  return deriveItemLocations(state).byId.get(id);
}

/* ---------------------------------------------------------------- from rule */

test('auto reads the room: boss is the heart slot, item stairs the stair, else the floor', () => {
  const base = { ...emptyRoom(), item: 'bow' };
  assert.equal(resolveRoomFrom({ ...base, boss: 'dodongo' }), 'heart');
  assert.equal(resolveRoomFrom({ ...base, stairs: 'item' }), 'stair');
  assert.equal(resolveRoomFrom(base), 'floor');
  // Transport stairs go somewhere else in the level; they hold nothing.
  assert.equal(resolveRoomFrom({ ...base, stairs: 'transport' }), 'floor');
  // A boss beats item stairs.
  assert.equal(resolveRoomFrom({ ...base, boss: 'dodongo', stairs: 'item' }), 'heart');
});

test('auto fills the slot of the kind the room resolves to', () => {
  let state = createInitialState();
  state = placeRoom(state, 1, 'A1', 'bow');
  state = placeRoom(state, 1, 'B1', 'raft', { stairs: 'item' });
  state = placeRoom(state, 1, 'C1', 'heart', { boss: 'aquamentus' });
  assert.equal(slot(state, 'd1.floor.0')?.item, 'bow');
  assert.equal(slot(state, 'd1.stair.0')?.item, 'raft');
  assert.equal(slot(state, 'd1.heart')?.item, 'heart');
  assert.deepEqual(slot(state, 'd1.floor.0')?.source, { kind: 'room', level: 1, room: 'A1' });
});

test('an explicit from overrides what the room looks like', () => {
  let state = createInitialState();
  // A boss room whose item was actually down its staircase.
  state = placeRoom(state, 1, 'D4', 'ladder', { boss: 'dodongo', stairs: 'item', from: 'stair' });
  assert.equal(slot(state, 'd1.stair.0')?.item, 'ladder');
  assert.equal(slot(state, 'd1.heart'), undefined);

  // And back to auto puts it where the rule says.
  state = reduce(state, { type: 'setRoomFrom', level: 1, room: 'D4', from: 'auto' });
  assert.equal(slot(state, 'd1.heart')?.item, 'ladder');
  assert.equal(slot(state, 'd1.stair.0'), undefined);
});

test('setRoomFrom refuses anything but the four values', () => {
  const base = placeRoom(createInitialState(), 1, 'A1', 'bow');
  for (const from of ['boss', '', 'AUTO', 3, null]) {
    const state = reduce(base, {
      type: 'setRoomFrom',
      level: 1,
      room: 'A1',
      from: from as RoomFrom,
    });
    assert.equal(state, base, JSON.stringify(from));
  }
  const patched = reduce(base, {
    type: 'setRoomNote',
    level: 1,
    room: 'A1',
    patch: { from: 'basement' as RoomFrom },
  });
  assert.equal(patched, base);
});

test('a shuffled non-heart item can be the boss drop', () => {
  // Flags can put any item in the heart container's place; the room says so.
  let state = createInitialState();
  state = placeRoom(state, 5, 'B6', 'whiteSword', { boss: 'gleeok' });
  assert.equal(slot(state, 'd5.heart')?.item, 'whiteSword');
  // And the Heart Container that would have been there can sit on a floor.
  state = placeRoom(state, 2, 'A1', 'heart');
  assert.equal(slot(state, 'd2.floor.0')?.item, 'heart');
});

test('Map, Compass and Triforce fill no slot', () => {
  let state = createInitialState();
  state = placeRoom(state, 1, 'A1', 'map');
  state = placeRoom(state, 1, 'A2', 'compass', { stairs: 'item' });
  state = placeRoom(state, 1, 'A3', 'triforce', { boss: 'aquamentus' });
  const derived = deriveItemLocations(state);
  assert.equal(derived.byId.size, 0);
  assert.equal(derived.overflow.size, 0);
  // They are still recorded on the room as an annotation.
  assert.equal(state.rooms['1']?.A3?.item, 'triforce');
  // And a real item after them still gets the first floor slot.
  state = placeRoom(state, 1, 'H8', 'bow');
  assert.equal(slot(state, 'd1.floor.0')?.item, 'bow');
});

test('items beyond a level\'s slots of one kind overflow rather than vanish', () => {
  let state = createInitialState();
  // Level 2 has one floor slot.
  state = placeRoom(state, 2, 'A1', 'bow');
  state = placeRoom(state, 2, 'A2', 'raft');
  state = placeRoom(state, 2, 'B1', 'book');
  const derived = deriveItemLocations(state);
  assert.equal(derived.byId.get('d2.floor.0')?.item, 'bow');
  const overflow = derived.overflow.get(2) ?? [];
  assert.deepEqual(
    overflow.map((p) => [p.item, p.kind, p.source.room]),
    [
      ['raft', 'floor', 'A2'],
      ['book', 'floor', 'B1'],
    ],
  );
  // Running out of one kind does not touch the others.
  assert.equal(derived.overflow.has(1), false);
});

test('a Level 9 boss room overflows, since Level 9 has no heart slot', () => {
  const state = placeRoom(createInitialState(), 9, 'A1', 'bow', { boss: 'ganon' });
  const derived = deriveItemLocations(state);
  assert.deepEqual(
    (derived.overflow.get(9) ?? []).map((p) => [p.item, p.kind]),
    [['bow', 'heart']],
  );
});

test('extra floor slots take overflow once Shuffle Minor Dungeon Drops allows them', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setSeed', patch: { shuffleMinorDrops: true } });
  state = reduce(state, { type: 'addFloorSlot', level: 2, delta: 1 });
  state = placeRoom(state, 2, 'A1', 'bow');
  state = placeRoom(state, 2, 'A2', 'raft');
  assert.equal(slot(state, 'd2.floor.0')?.item, 'bow');
  assert.equal(slot(state, 'd2.floor.1')?.item, 'raft');
  assert.equal(deriveItemLocations(state).overflow.has(2), false);
});

test('the same rooms fill the same slots whatever order they were recorded in', () => {
  const rooms: [string, string][] = [
    ['F3', 'raft'],
    ['A7', 'bow'],
    ['C2', 'book'],
  ];
  // Level 8 has two stair slots, so one of the three overflows.
  let forward = createInitialState();
  for (const [room, item] of rooms) forward = placeRoom(forward, 8, room, item, { stairs: 'item' });
  let backward = createInitialState();
  for (const [room, item] of [...rooms].reverse()) {
    backward = placeRoom(backward, 8, room, item, { stairs: 'item' });
  }

  const a = deriveItemLocations(forward);
  const b = deriveItemLocations(backward);
  // Grid order: A7 before C2 before F3.
  assert.equal(a.byId.get('d8.stair.0')?.item, 'bow');
  assert.equal(a.byId.get('d8.stair.1')?.item, 'book');
  assert.deepEqual(
    (a.overflow.get(8) ?? []).map((p) => p.item),
    ['raft'],
  );
  assert.deepEqual([...a.byId.entries()], [...b.byId.entries()]);
  assert.deepEqual([...a.overflow.entries()], [...b.overflow.entries()]);
});

/* ---------------------------------------------------------------- overworld */

test('an overworld screen with a named spot fills that slot', () => {
  let state = createInitialState();
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'C2',
    patch: { spot: 'ow.whiteSword', item: 'magicalSword' },
  });
  assert.equal(slot(state, 'ow.whiteSword')?.item, 'magicalSword');
  assert.deepEqual(slot(state, 'ow.whiteSword')?.source, { kind: 'screen', screen: 'C2' });
});

test('an overworld screen with an item but no named spot fills nothing', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setScreenNote', screen: 'D5', patch: { item: 'raft' } });
  const derived = deriveItemLocations(state);
  assert.equal(derived.byId.size, 0);
  assert.deepEqual(derived.overworldOverflow, []);
});

test('a second screen naming the same spot is shown as overworld overflow', () => {
  let state = createInitialState();
  for (const [screen, item] of [
    ['E9', 'bow'],
    ['B2', 'raft'],
  ] as const) {
    state = reduce(state, { type: 'setScreenNote', screen, patch: { spot: 'ow.armos', item } });
  }
  const derived = deriveItemLocations(state);
  // B2 comes first in grid order, so it holds the spot.
  assert.equal(derived.byId.get('ow.armos')?.item, 'raft');
  assert.deepEqual(
    derived.overworldOverflow.map((p) => p.item),
    ['bow'],
  );
});

/* -------------------------------------------------------------- collecting */

test('collecting a room item raises the inventory', () => {
  let state = placeRoom(createInitialState(), 3, 'B4', 'redCandle', { stairs: 'item' });
  assert.equal(state.items['candle'], 0, 'placing it does not grant it');
  state = reduce(state, { type: 'collectRoom', level: 3, room: 'B4', collected: true });
  assert.equal(state.items['candle'], 2);
  assert.equal(state.rooms['3']?.B4?.collected, true);
  assert.equal(slot(state, 'd3.stair.0')?.collected, true);
});

test('collecting raises but never lowers what is already held', () => {
  let state = placeRoom(createInitialState(), 1, 'A1', 'whiteSword');
  state = reduce(state, { type: 'setItem', id: 'sword', value: 3 });
  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  assert.equal(state.items['sword'], 3);
});

test('collecting a Heart Container records it without touching the inventory', () => {
  const before = placeRoom(createInitialState(), 4, 'C3', 'heart', { boss: 'manhandla' });
  const state = reduce(before, { type: 'collectRoom', level: 4, room: 'C3', collected: true });
  assert.equal(state.rooms['4']?.C3?.collected, true);
  assert.deepEqual(state.items, before.items);
});

test('un-collecting a room item never revokes it', () => {
  let state = placeRoom(createInitialState(), 1, 'A1', 'bow');
  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: false });
  assert.equal(state.rooms['1']?.A1?.collected, false);
  assert.equal(state.items['bow'], 1);
});

test('a room with no item cannot be collected', () => {
  const base = reduce(createInitialState(), { type: 'toggleRoomVisited', level: 1, room: 'A1' });
  assert.equal(reduce(base, { type: 'collectRoom', level: 1, room: 'A1', collected: true }), base);
  const patched = reduce(base, {
    type: 'setRoomNote',
    level: 1,
    room: 'A1',
    patch: { collected: true },
  });
  assert.equal(patched, base);
});

test('changing or clearing a room\'s item resets collected', () => {
  let state = placeRoom(createInitialState(), 1, 'A1', 'bow');
  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  state = reduce(state, { type: 'setRoomItem', level: 1, room: 'A1', item: 'raft' });
  assert.equal(state.rooms['1']?.A1?.collected, false);
  // And the new item was not granted by the change.
  assert.equal(state.items['raft'], 0);

  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  state = placeRoom(state, 1, 'A1', 'book');
  assert.equal(state.rooms['1']?.A1?.collected, false, 'through a patch too');

  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  state = reduce(state, { type: 'setRoomItem', level: 1, room: 'A1', item: '' });
  // Nothing else was recorded on the room, so it is bare and gone.
  assert.equal('1' in state.rooms, false);
});

test('a patch that places and collects in one go grants the new item', () => {
  const state = reduce(createInitialState(), {
    type: 'setRoomNote',
    level: 2,
    room: 'E5',
    patch: { item: 'ladder', collected: true },
  });
  assert.equal(state.rooms['2']?.E5?.collected, true);
  assert.equal(state.items['ladder'], 1);
});

test('a patch that leaves collected alone does not grant again', () => {
  // Granting on every edit would re-raise a slot the player lowered by hand.
  let state = placeRoom(createInitialState(), 1, 'A1', 'bow');
  state = reduce(state, { type: 'collectRoom', level: 1, room: 'A1', collected: true });
  state = reduce(state, { type: 'setItem', id: 'bow', value: 0 });
  state = reduce(state, { type: 'setRoomNote', level: 1, room: 'A1', patch: { visited: true } });
  assert.equal(state.items['bow'], 0);
  assert.equal(state.rooms['1']?.A1?.collected, true);
});

test('collected and an explicit from keep a room from being bare', () => {
  assert.equal(roomIsBare({ ...emptyRoom(), from: 'stair' }), false);
  assert.equal(roomIsBare({ ...emptyRoom(), collected: true }), false);
});

test('collecting a screen item raises the inventory, and changing it resets the flag', () => {
  let state = createInitialState();
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'C2',
    patch: { spot: 'ow.coast', item: 'raft' },
  });
  state = reduce(state, { type: 'collectScreen', screen: 'C2', collected: true });
  assert.equal(state.items['raft'], 1);
  assert.equal(slot(state, 'ow.coast')?.collected, true);

  state = reduce(state, { type: 'collectScreen', screen: 'C2', collected: false });
  assert.equal(state.items['raft'], 1, 'un-collecting never revokes');

  state = reduce(state, { type: 'collectScreen', screen: 'C2', collected: true });
  state = reduce(state, { type: 'setScreenNote', screen: 'C2', patch: { item: 'bow' } });
  assert.equal(state.screenNotes['C2']?.collected, false);
  assert.equal(state.items['bow'], 0);
});

test('a screen with no item cannot be collected', () => {
  let base = createInitialState();
  base = reduce(base, { type: 'setScreenNote', screen: 'C2', patch: { spot: 'ow.armos' } });
  assert.equal(reduce(base, { type: 'collectScreen', screen: 'C2', collected: true }), base);
  assert.equal(
    reduce(createInitialState(), { type: 'collectScreen', screen: 'H1', collected: true }).rev,
    0,
  );
});

test('collectLocation still raises the inventory through the shared grant', () => {
  let state = reduce(createInitialState(), { type: 'setLocation', id: 'd1.floor.0', item: 'bow' });
  state = reduce(state, { type: 'collectLocation', id: 'd1.floor.0', collected: true });
  assert.equal(state.items['bow'], 1);
  state = reduce(state, { type: 'collectLocation', id: 'd1.floor.0', collected: false });
  assert.equal(state.items['bow'], 1);
});

/* ------------------------------------------------------------- old saves */

test('a slot the maps leave empty falls back to the stored location', () => {
  const state = createInitialState();
  state.locations['d3.stair.0'] = { item: 'raft', collected: true };
  state.locations['ow.armos'] = { item: 'bow', collected: false };
  const derived = deriveItemLocations(state);
  assert.deepEqual(derived.byId.get('d3.stair.0'), {
    item: 'raft',
    collected: true,
    source: { kind: 'stored' },
  });
  assert.equal(derived.byId.get('ow.armos')?.item, 'bow');
});

test('a placement on the maps wins over the stored location for the same slot', () => {
  let state = createInitialState();
  state.locations['d3.stair.0'] = { item: 'raft', collected: true };
  state = placeRoom(state, 3, 'A1', 'book', { stairs: 'item' });
  const filled = slot(state, 'd3.stair.0');
  assert.equal(filled?.item, 'book');
  // The stored collected flag does not leak onto the placement either.
  assert.equal(filled?.collected, false);
  assert.equal(filled?.source.kind, 'room');
});

test('dungeonItems reads placements, stored slots and overflow, and skips Heart Containers', () => {
  let state = createInitialState();
  state.locations['d5.stair.0'] = { item: 'raft', collected: false };
  state = placeRoom(state, 5, 'A1', 'bow', { boss: 'gohma' });
  state = placeRoom(state, 5, 'A2', 'book');
  state = placeRoom(state, 5, 'A3', 'heart');
  // Level 5 has no floor slot in the 1st Quest, so both floor items overflow.
  assert.deepEqual(dungeonItems(state, 5), ['raft', 'bow', 'book']);
});

/** A save from before v12: rooms and screens without the new fields. */
function preV12Save(): Record<string, unknown> {
  return {
    version: 11,
    rev: 9,
    items: { bow: 1 },
    dungeons: { '1': { triforce: false } },
    marks: { C2: 'item' },
    screenNotes: {
      C2: {
        dungeon: 0,
        stairway: 0,
        shop: [],
        shopPrices: {},
        blocks: [],
        spot: 'ow.coast',
        item: 'raft',
      },
    },
    rooms: {
      '1': {
        A1: {
          visited: true,
          item: 'bow',
          boss: '',
          stairs: 'item',
          transport: 0,
          transportSeq: 0,
          doors: { north: 'open', east: 'unknown', south: 'unknown', west: 'unknown' },
        },
      },
    },
    seed: { seed: '1' },
    locations: { 'd1.stair.0': { item: 'ladder', collected: true } },
    extraFloorSlots: {},
    hints: [],
    hintSeq: 0,
    focusRegion: '',
    startedAt: 1,
    updatedAt: 2,
  };
}

test('a pre-v12 save conforms rooms and screens to the new fields', () => {
  const state = migrate(preV12Save());
  assert.ok(state);
  assert.equal(state.version, STATE_VERSION);
  assert.equal(STATE_VERSION, 12);
  const a1 = state.rooms['1']?.A1;
  assert.ok(a1);
  assert.equal(a1.collected, false);
  assert.equal(a1.from, 'auto');
  assert.equal(state.screenNotes['C2']?.collected, false);
  // The stored slots survive the load untouched, for the fallback to read.
  assert.deepEqual(state.locations['d1.stair.0'], { item: 'ladder', collected: true });
  // And the room behind the same slot now wins over it.
  assert.equal(deriveItemLocations(state).byId.get('d1.stair.0')?.item, 'bow');
});

test('corrupt collected and from values are coerced away on load', () => {
  const save = preV12Save();
  save.rooms = {
    '1': {
      A1: { item: 'bow', collected: 'yes', from: 'boss' },
      // Collected with nothing to have collected.
      A2: { visited: true, collected: true, from: 7 },
      A3: { item: 'raft', collected: true, from: 'heart' },
      // Only the new fields, both empty: bare, so not kept.
      A4: { collected: false, from: 'auto' },
    },
  };
  save.screenNotes = {
    B1: { spot: 'ow.armos', item: '', collected: true },
    B2: { spot: 'ow.armos', item: 'bow', collected: 1 },
    B3: { spot: 'ow.coast', item: 'raft', collected: true },
  };
  const state = migrate(save);
  assert.ok(state);
  const rooms = state.rooms['1'] ?? {};
  assert.equal(rooms['A1']?.collected, false);
  assert.equal(rooms['A1']?.from, 'auto');
  assert.equal(rooms['A2']?.collected, false);
  assert.equal(rooms['A2']?.from, 'auto');
  assert.equal(rooms['A3']?.collected, true);
  assert.equal(rooms['A3']?.from, 'heart');
  assert.equal('A4' in rooms, false);
  assert.equal(state.screenNotes['B1']?.collected, false);
  assert.equal(state.screenNotes['B2']?.collected, false);
  assert.equal(state.screenNotes['B3']?.collected, true);
});

/* ---------------------------------------------------- overworld-only items */

test('collecting an overworld-only item raises the inventory it stands for', () => {
  let state = createInitialState();
  for (const [screen, item] of [
    ['A1', 'letter'],
    ['A2', 'redPotion'],
    ['A3', 'blueCandle'],
    ['A4', 'woodSword'],
  ] as const) {
    state = reduce(state, { type: 'setScreenNote', screen, patch: { item } });
    state = reduce(state, { type: 'collectScreen', screen, collected: true });
  }
  assert.equal(state.items['letter'], 1);
  assert.equal(state.items['potion'], 2);
  assert.equal(state.items['candle'], 1);
  assert.equal(state.items['sword'], 1);
});

test('a Blue Potion collected after a Red one leaves the Red one held', () => {
  let state = reduce(createInitialState(), { type: 'setItem', id: 'potion', value: 2 });
  state = reduce(state, { type: 'setScreenNote', screen: 'B1', patch: { item: 'bluePotion' } });
  state = reduce(state, { type: 'collectScreen', screen: 'B1', collected: true });
  assert.equal(state.items['potion'], 2);
});

test('overworld-only items survive a save and load', () => {
  const save = preV12Save();
  save.screenNotes = {
    B1: { spot: '', item: 'letter', collected: true },
    B2: { spot: 'ow.armos', item: 'woodSword', collected: false },
    B3: { spot: '', item: 'notAnItem', collected: false },
  };
  const state = migrate(save);
  assert.ok(state);
  assert.equal(state.screenNotes['B1']?.item, 'letter');
  assert.equal(state.screenNotes['B1']?.collected, true);
  assert.equal(state.screenNotes['B2']?.item, 'woodSword');
  assert.equal(state.screenNotes['B3']?.item ?? '', '');
});

test('an overworld-only item on a named spot fills that slot', () => {
  let state = createInitialState();
  state = reduce(state, {
    type: 'setScreenNote',
    screen: 'C2',
    patch: { spot: 'ow.armos', item: 'blueCandle' },
  });
  assert.equal(slot(state, 'ow.armos')?.item, 'blueCandle');
});
