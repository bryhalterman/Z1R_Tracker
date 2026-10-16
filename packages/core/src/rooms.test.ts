import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { migrate } from './persistence.js';
import { createInitialState, reduce, STATE_VERSION, type TrackerState } from './state.js';
import {
  allRoomIds,
  DOOR_STATES,
  DOOR_STATES_BY_ID,
  DUNGEON_BOSSES,
  emptyRoom,
  isRoomId,
  roomId,
  roomIsBare,
  ROOM_COLUMNS,
  ROOM_ITEMS,
  ROOM_ROWS,
  ROOM_SIDES,
  type DoorState,
} from './rooms.js';
import { bundledManifest } from './index.js';

/** The room record for one level/room pair, or undefined when it is bare. */
function room(state: TrackerState, level: number, id: string) {
  return state.rooms[String(level)]?.[id];
}

test('room ids run A1-H8 across an 8x8 grid', () => {
  assert.equal(ROOM_COLUMNS, 8);
  assert.equal(ROOM_ROWS, 8);
  assert.equal(roomId(1, 1), 'A1');
  assert.equal(roomId(8, 8), 'H8');
  assert.equal(roomId(3, 5), 'E3');

  const ids = allRoomIds();
  assert.equal(ids.length, 64);
  assert.equal(new Set(ids).size, 64);
  assert.equal(ids[0], 'A1');
  assert.equal(ids[63], 'H8');
});

test('only ids on the grid are accepted', () => {
  for (const id of allRoomIds()) assert.equal(isRoomId(id), true, id);
  // The overworld is 16 wide and the rows stop at H, so these are the near
  // misses an import or a hand-edited save would actually carry.
  for (const id of ['A9', 'I1', 'A0', 'H16', '', 'a1', 'A1 ']) {
    assert.equal(isRoomId(id), false, id);
  }
});

test('a transport number holds two rooms, and a third evicts the oldest', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'placeRoomTransport', level: 1, room: 'A1', number: 2 });
  state = reduce(state, { type: 'placeRoomTransport', level: 1, room: 'B3', number: 2 });
  assert.equal(room(state, 1, 'A1')?.transport, 2);
  assert.equal(room(state, 1, 'B3')?.transport, 2);
  // Placing it also records the staircase, since a number without one would
  // pair a room the player never said had stairs.
  assert.equal(room(state, 1, 'A1')?.stairs, 'transport');

  state = reduce(state, { type: 'placeRoomTransport', level: 1, room: 'C5', number: 2 });
  // A1 held it longest, so A1 is the one that loses it.
  assert.equal(room(state, 1, 'A1')?.transport, 0);
  assert.equal(room(state, 1, 'B3')?.transport, 2);
  assert.equal(room(state, 1, 'C5')?.transport, 2);
  // The staircase it was paired by stays recorded; only the pairing was wrong.
  assert.equal(room(state, 1, 'A1')?.stairs, 'transport');
});

test('the four numbers are independent, and each level pairs on its own', () => {
  let state = createInitialState();
  for (const [id, number] of [
    ['A1', 1],
    ['A2', 1],
    ['A3', 2],
    ['A4', 2],
  ] as const) {
    state = reduce(state, { type: 'placeRoomTransport', level: 4, room: id, number });
  }
  // Filling pair 2 must not disturb pair 1.
  assert.deepEqual(
    ['A1', 'A2', 'A3', 'A4'].map((id) => room(state, 4, id)?.transport),
    [1, 1, 2, 2],
  );

  // Level 5 has its own pair 1, so placing two there evicts nothing on 4.
  state = reduce(state, { type: 'placeRoomTransport', level: 5, room: 'H1', number: 1 });
  state = reduce(state, { type: 'placeRoomTransport', level: 5, room: 'H2', number: 1 });
  assert.equal(room(state, 4, 'A1')?.transport, 1);
  assert.equal(room(state, 5, 'H1')?.transport, 1);
});

test('a number outside 1-4, or a fractional one, is refused', () => {
  const base = createInitialState();
  for (const number of [0, 5, -1, 2.5, Number.NaN]) {
    const state = reduce(base, { type: 'placeRoomTransport', level: 1, room: 'A1', number });
    assert.equal(state, base, `number ${String(number)}`);
  }
});

test('moving the staircase kind off transport clears the pair number', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'placeRoomTransport', level: 3, room: 'D4', number: 1 });
  assert.equal(room(state, 3, 'D4')?.transport, 1);

  state = reduce(state, { type: 'setRoomStairs', level: 3, room: 'D4', stairs: 'item' });
  assert.equal(room(state, 3, 'D4')?.stairs, 'item');
  assert.equal(room(state, 3, 'D4')?.transport, 0);
  assert.equal(room(state, 3, 'D4')?.transportSeq, 0);

  // And with no stairs at all the room is bare again, so the key goes.
  state = reduce(state, { type: 'setRoomStairs', level: 3, room: 'D4', stairs: 'none' });
  assert.equal('3' in state.rooms, false);
});

test('clearing a transport number leaves the staircase behind', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'placeRoomTransport', level: 2, room: 'E6', number: 4 });
  state = reduce(state, { type: 'clearRoomTransport', level: 2, room: 'E6' });
  assert.equal(room(state, 2, 'E6')?.transport, 0);
  assert.equal(room(state, 2, 'E6')?.stairs, 'transport');
});

test('Ganon and Zelda are refused outside Level 9 and accepted on it', () => {
  const base = createInitialState();
  for (const boss of ['ganon', 'zelda']) {
    for (const level of [1, 5, 8]) {
      const state = reduce(base, { type: 'setRoomBoss', level, room: 'A1', boss });
      assert.equal(state, base, `${boss} on level ${level}`);
    }
    const allowed = reduce(base, { type: 'setRoomBoss', level: 9, room: 'A1', boss });
    assert.equal(room(allowed, 9, 'A1')?.boss, boss);
  }
});

test('the other seven bosses are valid on any level, because the randomizer moves them', () => {
  const base = createInitialState();
  for (const def of DUNGEON_BOSSES.filter((entry) => !entry.level9Only)) {
    for (const level of [1, 6, 9]) {
      const state = reduce(base, { type: 'setRoomBoss', level, room: 'C3', boss: def.id });
      assert.equal(room(state, level, 'C3')?.boss, def.id, `${def.id} on level ${level}`);
    }
  }
});

test('a boss id with no definition is refused rather than stored', () => {
  const base = createInitialState();
  const state = reduce(base, { type: 'setRoomBoss', level: 1, room: 'A1', boss: 'goriya' });
  assert.equal(state, base);
});

test('a door walks through every state and back to unknown', () => {
  let state = createInitialState();
  for (const def of DOOR_STATES) {
    state = reduce(state, { type: 'setRoomDoor', level: 1, room: 'F2', side: 'north', state: def.id });
    assert.equal(room(state, 1, 'F2')?.doors.north ?? 'unknown', def.id, def.id);
    // Only the side that was set may move.
    for (const side of ROOM_SIDES.filter((other) => other !== 'north')) {
      assert.equal(room(state, 1, 'F2')?.doors[side] ?? 'unknown', 'unknown', side);
    }
  }
  // Back to unknown is back to bare: the whole level key goes.
  state = reduce(state, { type: 'setRoomDoor', level: 1, room: 'F2', side: 'north', state: 'unknown' });
  assert.equal('1' in state.rooms, false);
});

test('an unknown door state or staircase kind is refused', () => {
  const base = createInitialState();
  const door = reduce(base, {
    type: 'setRoomDoor',
    level: 1,
    room: 'A1',
    side: 'north',
    state: 'bombable' as DoorState,
  });
  assert.equal(door, base);
  const stairs = reduce(base, {
    type: 'setRoomStairs',
    level: 1,
    room: 'A1',
    stairs: 'basement' as 'item',
  });
  assert.equal(stairs, base);
});

test('a room off the grid, or a level with no grid, is refused', () => {
  const base = createInitialState();
  for (const [level, id] of [
    [1, 'A9'],
    [0, 'A1'],
    [10, 'A1'],
    [1.5, 'A1'],
  ] as const) {
    const state = reduce(base, { type: 'toggleRoomVisited', level, room: id });
    assert.equal(state, base, `level ${level} room ${id}`);
  }
});

test('a room goes bare again when its last fact is removed', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'toggleRoomVisited', level: 7, room: 'G7' });
  state = reduce(state, { type: 'setRoomItem', level: 7, room: 'G7', item: 'bow' });
  assert.equal(room(state, 7, 'G7')?.visited, true);

  state = reduce(state, { type: 'setRoomItem', level: 7, room: 'G7', item: '' });
  // Still visited, so the room stays.
  assert.ok(room(state, 7, 'G7'));
  state = reduce(state, { type: 'toggleRoomVisited', level: 7, room: 'G7' });
  // Nothing left to record, so neither the room nor the level is kept.
  assert.equal('7' in state.rooms, false);
  assert.equal(roomIsBare(emptyRoom()), true);
});

test('clearing one level leaves the other levels alone', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'toggleRoomVisited', level: 1, room: 'A1' });
  state = reduce(state, { type: 'setRoomBoss', level: 2, room: 'B2', boss: 'dodongo' });
  state = reduce(state, { type: 'clearRooms', level: 1 });
  assert.equal('1' in state.rooms, false);
  assert.equal(room(state, 2, 'B2')?.boss, 'dodongo');

  // Clearing a level that holds nothing is not an edit.
  const same = reduce(state, { type: 'clearRooms', level: 1 });
  assert.equal(same, state);
});

test('placing an item in a room never touches the inventory', () => {
  const before = createInitialState();
  let state = reduce(before, { type: 'setRoomItem', level: 1, room: 'A1', item: 'bow' });
  state = reduce(state, { type: 'setRoomItem', level: 9, room: 'H8', item: 'triforce' });
  // The room records where the item is; holding it is the inventory's business.
  assert.deepEqual(state.items, before.items);
  assert.deepEqual(state.locations, before.locations);
  assert.equal(room(state, 1, 'A1')?.item, 'bow');
  assert.equal(room(state, 9, 'H8')?.item, 'triforce');
});

test('the room item set is the shuffle pool plus map, compass and Triforce', () => {
  const ids = ROOM_ITEMS.map((entry) => entry.id);
  for (const id of ['map', 'compass', 'triforce', 'bow', 'ladder', 'heart']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length);

  const base = createInitialState();
  // An id outside the set is refused rather than stored, or the room would
  // carry a reference that renders as nothing and never goes away.
  const state = reduce(base, { type: 'setRoomItem', level: 1, room: 'A1', item: 'bombs' });
  assert.equal(state, base);
});

test('every boss and room item has a sprite the manifest defines', () => {
  for (const def of DUNGEON_BOSSES) {
    assert.ok(def.sprite in bundledManifest.sprites, `no sprite for ${def.id}`);
  }
  for (const def of ROOM_ITEMS) {
    assert.ok(def.sprite in bundledManifest.sprites, `no sprite for ${def.id}`);
  }
});

test('every door state carries a non-colour tag, so none is signalled by tint alone', () => {
  for (const def of DOOR_STATES) {
    assert.ok(def.tag.length > 0, `${def.id} has no tag`);
    assert.ok(def.name.length > 0, `${def.id} has no name`);
  }
  assert.equal(new Set(DOOR_STATES.map((def) => def.tag)).size, DOOR_STATES.length);
});

test('a room note patch writes several facts at once and validates each', () => {
  const base = createInitialState();
  let state = reduce(base, {
    type: 'setRoomNote',
    level: 9,
    room: 'D5',
    patch: { visited: true, boss: 'ganon', doors: { south: 'shutter' } },
  });
  assert.equal(room(state, 9, 'D5')?.boss, 'ganon');
  assert.equal(room(state, 9, 'D5')?.doors.south, 'shutter');
  assert.equal(room(state, 9, 'D5')?.doors.north, 'unknown');

  // One bad field refuses the whole patch: half a gesture is not an answer.
  state = reduce(state, {
    type: 'setRoomNote',
    level: 9,
    room: 'D5',
    patch: { visited: false, item: 'nothing' },
  });
  assert.equal(room(state, 9, 'D5')?.visited, true);

  // A patch cannot reach a state a sequence of clicks could not: a number
  // without transport stairs is dropped with the kind that carries it.
  state = reduce(state, {
    type: 'setRoomNote',
    level: 9,
    room: 'D5',
    patch: { stairs: 'item', transport: 3 },
  });
  assert.equal(room(state, 9, 'D5')?.transport, 0);
});

test('a patch that places a number obeys the same two-room rule', () => {
  let state = createInitialState();
  for (const id of ['A1', 'A2', 'A3']) {
    state = reduce(state, {
      type: 'setRoomNote',
      level: 1,
      room: id,
      patch: { stairs: 'transport', transport: 1 },
    });
  }
  assert.deepEqual(
    ['A1', 'A2', 'A3'].map((id) => room(state, 1, id)?.transport),
    [0, 1, 1],
  );
});

/** A save from before rooms existed. Shaped like the v10 model, with no `rooms`. */
function preRoomsSave(): Record<string, unknown> {
  return {
    version: 10,
    rev: 4,
    items: { sword: 1 },
    dungeons: { '1': { triforce: true } },
    marks: { H8: 'dungeon' },
    screenNotes: { H8: { dungeon: 1, stairway: 0, shop: [], blocks: [], spot: '', item: '' } },
    seed: { seed: '1' },
    locations: {},
    extraFloorSlots: {},
    hints: [],
    hintSeq: 0,
    focusRegion: '',
    startedAt: 1,
    updatedAt: 2,
  };
}

test('a save written before rooms existed loads with none', () => {
  const state = migrate(preRoomsSave());
  assert.ok(state);
  assert.equal(STATE_VERSION, 11);
  assert.equal(state.version, 11);
  assert.deepEqual(state.rooms, {});
  // And the rest of the save still arrives intact.
  assert.equal(state.dungeons['1']?.triforce, true);
  assert.equal(state.marks['H8'], 'dungeon');
});

test('a well-formed room map survives a load unchanged', () => {
  const saved = {
    ...preRoomsSave(),
    version: 11,
    rooms: {
      '2': {
        C3: {
          visited: true,
          item: 'bow',
          boss: 'dodongo',
          stairs: 'transport',
          transport: 1,
          transportSeq: 1,
          doors: { north: 'open', east: 'bombed', south: 'locked', west: 'unknown' },
        },
      },
    },
  };
  const state = migrate(saved);
  assert.ok(state);
  assert.deepEqual(state.rooms, saved.rooms);
});

test('a save holding the pre-rename `bomb` door loads as `bombed`', () => {
  // `bomb` meant a bombable wall before the state inverted into "bombed and it
  // stayed shut". The id is renamed on load rather than failing the table check
  // and resetting the edge to unknown, which would throw away the fact that
  // somebody stood there and marked it.
  const state = migrate({
    ...preRoomsSave(),
    version: 11,
    rooms: { '4': { B6: { visited: true, doors: { north: 'bomb', east: 'wall' } } } },
  });
  assert.ok(state);
  const note = state.rooms['4']?.B6;
  assert.ok(note);
  assert.equal(note.doors.north, 'bombed');
  // The sides around it are untouched by the translation.
  assert.equal(note.doors.east, 'wall');
  assert.equal(note.doors.south, 'unknown');
  // And the old id is no longer a state in its own right, so nothing can set it
  // again and an export carries only the current name.
  assert.equal(DOOR_STATES_BY_ID.has('bomb'), false);
  assert.ok(DOOR_STATES_BY_ID.has('bombed'));
});

test('corrupt room containers and keys are coerced away rather than crashing', () => {
  for (const rooms of ['nope', 42, null, [], { '1': 'nope' }, { '1': null }]) {
    const state = migrate({ ...preRoomsSave(), rooms });
    assert.ok(state, JSON.stringify(rooms));
    assert.deepEqual(state.rooms, {}, JSON.stringify(rooms));
  }

  // Levels off 1-9 and rooms off the grid have nowhere to be drawn.
  const state = migrate({
    ...preRoomsSave(),
    rooms: {
      '0': { A1: { visited: true } },
      '10': { A1: { visited: true } },
      banana: { A1: { visited: true } },
      '3': { A9: { visited: true }, Z1: { visited: true }, B2: { visited: true } },
    },
  });
  assert.ok(state);
  assert.deepEqual(Object.keys(state.rooms), ['3']);
  assert.deepEqual(Object.keys(state.rooms['3'] ?? {}), ['B2']);
});

test('unknown door states, stairs, bosses and items are dropped on load', () => {
  const state = migrate({
    ...preRoomsSave(),
    rooms: {
      '1': {
        A1: {
          visited: 'yes',
          item: 'bombs',
          boss: 'goriya',
          stairs: 'basement',
          transport: 2,
          doors: { north: 'bombable', east: 'open', up: 'open' },
        },
        // Ganon outside Level 9 describes a room that cannot exist.
        A2: { boss: 'ganon', visited: true },
      },
    },
  });
  assert.ok(state);
  const a1 = state.rooms['1']?.A1;
  assert.ok(a1);
  // A truthy string is not a boolean, so it does not read as visited.
  assert.equal(a1.visited, false);
  assert.equal(a1.item, '');
  assert.equal(a1.boss, '');
  assert.equal(a1.stairs, 'none');
  // No transport stairs, so no pair number.
  assert.equal(a1.transport, 0);
  assert.equal(a1.doors.north, 'unknown');
  assert.equal(a1.doors.east, 'open');
  assert.deepEqual(Object.keys(a1.doors).sort(), ['east', 'north', 'south', 'west']);
  assert.equal(state.rooms['1']?.A2?.boss, '');
  assert.equal(state.rooms['1']?.A2?.visited, true);
});

test('a room that conforms down to nothing is not kept', () => {
  const state = migrate({
    ...preRoomsSave(),
    rooms: { '1': { A1: { visited: 1, boss: 'goriya' }, B1: {} } },
  });
  assert.ok(state);
  assert.deepEqual(state.rooms, {});
});

test('transport numbers out of range, fractional or NaN load as unpaired', () => {
  for (const transport of [0, 5, -2, 1.5, Number.NaN, 'two', null]) {
    const state = migrate({
      ...preRoomsSave(),
      rooms: { '1': { A1: { stairs: 'transport', transport, transportSeq: 1 } } },
    });
    assert.ok(state, JSON.stringify(transport));
    const note = state.rooms['1']?.A1;
    assert.ok(note, JSON.stringify(transport));
    // The staircase is still a real observation, so the room is kept.
    assert.equal(note.stairs, 'transport');
    assert.equal(note.transport, 0, JSON.stringify(transport));
    assert.equal(note.transportSeq, 0);
  }
});

test('a number held by more than two rooms loses its oldest claims on load', () => {
  const held = (seq: number) => ({ stairs: 'transport', transport: 1, transportSeq: seq });
  const state = migrate({
    ...preRoomsSave(),
    rooms: { '4': { A1: held(1), A2: held(2), A3: held(3), A4: held(4) } },
  });
  assert.ok(state);
  const level = state.rooms['4'] ?? {};
  assert.deepEqual(
    ['A1', 'A2', 'A3', 'A4'].map((id) => level[id]?.transport),
    [0, 0, 1, 1],
  );
  // Every room is still there — only the impossible pairing was repaired.
  assert.deepEqual(Object.keys(level).sort(), ['A1', 'A2', 'A3', 'A4']);
});

test('a loaded pair still evicts in the right order afterwards', () => {
  const held = (seq: number) => ({ stairs: 'transport', transport: 2, transportSeq: seq });
  const loaded = migrate({
    ...preRoomsSave(),
    rooms: { '6': { D1: held(1), D2: held(2) } },
  });
  assert.ok(loaded);
  const state = reduce(loaded, { type: 'placeRoomTransport', level: 6, room: 'D3', number: 2 });
  assert.deepEqual(
    ['D1', 'D2', 'D3'].map((id) => room(state, 6, id)?.transport),
    [0, 2, 2],
  );
});
