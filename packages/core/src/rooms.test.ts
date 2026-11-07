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
  ROOM_TRANSPORT_MAX,
  type DoorState,
  type RoomPushBlock,
} from './rooms.js';
import {
  ROOM_LAYOUTS,
  ROOM_LAYOUTS_BY_ID,
  ROOM_LAYOUT_COLUMNS,
  ROOM_LAYOUT_GROUPS,
  ROOM_LAYOUT_ROWS,
  layoutCanHaveStairs,
  layoutCanPush,
  layoutHasStairs,
} from './layouts.js';
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

test('a number below 1, past what the grid can hold, or fractional, is refused', () => {
  const base = createInitialState();
  for (const number of [0, ROOM_TRANSPORT_MAX + 1, -1, 2.5, Number.NaN]) {
    const state = reduce(base, { type: 'placeRoomTransport', level: 1, room: 'A1', number });
    assert.equal(state, base, `number ${String(number)}`);
  }
});

test('a level holds more than four transport pairs', () => {
  let state = createInitialState();
  const rooms = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2'];
  rooms.forEach((id, index) => {
    const number = Math.floor(index / 2) + 1;
    state = reduce(state, { type: 'placeRoomTransport', level: 9, room: id, number });
  });
  // Six pairs, and every room kept its number: nothing was evicted.
  rooms.forEach((id, index) => {
    assert.equal(room(state, 9, id)?.transport, Math.floor(index / 2) + 1, id);
  });
  // And a save holding pair 6 loads it back.
  const loaded = migrate(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded?.rooms['9']?.F2?.transport, 6);
});

test('moving the staircase kind off transport clears the pair number', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'placeRoomTransport', level: 3, room: 'D4', number: 1 });
  assert.equal(room(state, 3, 'D4')?.transport, 1);

  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { stairs: 'item' } });
  assert.equal(room(state, 3, 'D4')?.stairs, 'item');
  assert.equal(room(state, 3, 'D4')?.transport, 0);
  assert.equal(room(state, 3, 'D4')?.transportSeq, 0);

  // And with no stairs at all the room is bare again, so the key goes.
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { stairs: 'none' } });
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
    type: 'setRoomNote',
    level: 1,
    room: 'A1',
    patch: { stairs: 'basement' as 'item' },
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
    const state = reduce(base, { type: 'setRoomNote', level, room: id, patch: { visited: true } });
    assert.equal(state, base, `level ${level} room ${id}`);
  }
});

test('a room goes bare again when its last fact is removed', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 7, room: 'G7', patch: { visited: true } });
  state = reduce(state, { type: 'setRoomItem', level: 7, room: 'G7', item: 'bow' });
  assert.equal(room(state, 7, 'G7')?.visited, true);

  state = reduce(state, { type: 'setRoomItem', level: 7, room: 'G7', item: '' });
  // Still visited, so the room stays.
  assert.ok(room(state, 7, 'G7'));
  state = reduce(state, { type: 'setRoomNote', level: 7, room: 'G7', patch: { visited: false } });
  // Nothing left to record, so neither the room nor the level is kept.
  assert.equal('7' in state.rooms, false);
  assert.equal(roomIsBare(emptyRoom()), true);
});

test('clearing one level leaves the other levels alone', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 1, room: 'A1', patch: { visited: true } });
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
  const state = reduce(base, { type: 'setRoomItem', level: 1, room: 'A1', item: 'notAnItem' });
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
  assert.equal(STATE_VERSION, 13);
  assert.equal(state.version, 13);
  assert.deepEqual(state.rooms, {});
  // And the rest of the save still arrives intact.
  assert.equal(state.dungeons['1']?.triforce, true);
  assert.equal(state.marks['H8'], 'dungeon');
});

test('a well-formed room map survives a load unchanged', () => {
  const saved = {
    ...preRoomsSave(),
    version: 12,
    rooms: {
      '2': {
        C3: {
          visited: true,
          known: false,
          item: 'bow',
          boss: 'dodongo',
          stairs: 'transport',
          transport: 1,
          transportSeq: 1,
          doors: { north: 'open', east: 'bombed', south: 'locked', west: 'unknown' },
          collected: true,
          from: 'stair',
          ladder: true,
          layout: 'vertical-chute',
          pushBlock: 'checked',
          cleared: true,
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
          item: 'notAnItem',
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
  for (const transport of [0, ROOM_TRANSPORT_MAX + 1, -2, 1.5, Number.NaN, 'two', null]) {
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

/* ----------------------------------------------------------- ladder block */

test('a room can be marked as needing the Ladder, and that alone keeps it', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 4, room: 'C3', patch: { ladder: true } });
  assert.equal(state.rooms['4']?.C3?.ladder, true);
  // A non-boolean is refused, not coerced.
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 4,
    room: 'C3',
    patch: { ladder: 'yes' as unknown as boolean },
  });
  assert.equal(refused, state);
  // Clearing it leaves nothing worth keeping, so the room goes.
  state = reduce(state, { type: 'setRoomNote', level: 4, room: 'C3', patch: { ladder: false } });
  assert.equal(state.rooms['4']?.C3, undefined);
});

test('the ladder mark survives a save, and is absent from older ones', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 4, room: 'C3', patch: { ladder: true } });
  const loaded = migrate(JSON.parse(JSON.stringify(state)));
  assert.ok(loaded);
  assert.equal(loaded.rooms['4']?.C3?.ladder, true);
  const older = JSON.parse(JSON.stringify(state));
  older.rooms['4'].C3 = { visited: true };
  const fromOlder = migrate(older);
  assert.equal(fromOlder?.rooms['4']?.C3?.ladder, false);
});

/* ------------------------------------------------------------ room layout */

test('every layout is a full grid of known squares, with a unique id and game index', () => {
  assert.equal(ROOM_LAYOUTS.length, 42);
  assert.equal(new Set(ROOM_LAYOUTS.map((layout) => layout.id)).size, 42);
  // The game's table runs 0x00-0x29 with nothing skipped.
  assert.deepEqual(
    ROOM_LAYOUTS.map((layout) => layout.code).sort((a, b) => a - b),
    Array.from({ length: 42 }, (_, index) => index),
  );
  for (const layout of ROOM_LAYOUTS) {
    assert.equal(layout.rows.length, ROOM_LAYOUT_ROWS, layout.id);
    for (const row of layout.rows) {
      assert.match(row, new RegExp(`^[.#o=~:x]{${ROOM_LAYOUT_COLUMNS}}$`), layout.id);
    }
    assert.ok(
      ROOM_LAYOUT_GROUPS.some((group) => group.id === layout.group),
      layout.id,
    );
  }
});

test('a room can be given a layout, and that alone keeps it', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'B5', patch: { layout: 'vertical-chute' } });
  assert.equal(state.rooms['2']?.B5?.layout, 'vertical-chute');
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'B5', patch: { layout: 'moat' } });
  assert.equal(state.rooms['2']?.B5?.layout, 'moat');
  // An id that names no layout is refused, not stored.
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 2,
    room: 'B5',
    patch: { layout: 'diagonal-moat' },
  });
  assert.equal(refused, state);
  // Clearing it leaves nothing worth keeping, so the room goes.
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'B5', patch: { layout: '' } });
  assert.equal(state.rooms['2']?.B5, undefined);
});

test('the layout survives a save, and is empty in older or damaged ones', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'B5', patch: { layout: 'spiral' } });
  const loaded = migrate(JSON.parse(JSON.stringify(state)));
  assert.ok(loaded);
  assert.equal(loaded.rooms['2']?.B5?.layout, 'spiral');
  const older = JSON.parse(JSON.stringify(state));
  older.rooms['2'].B5 = { visited: true };
  assert.equal(migrate(older)?.rooms['2']?.B5?.layout, '');
  const damaged = JSON.parse(JSON.stringify(state));
  damaged.rooms['2'].B5 = { visited: true, layout: 'sideways' };
  assert.equal(migrate(damaged)?.rooms['2']?.B5?.layout, '');
});

test('a chute marked before layouts existed loads as that chute layout', () => {
  const saved = JSON.parse(JSON.stringify(createInitialState()));
  saved.rooms = {
    '2': {
      B5: { visited: true, chute: 'vertical' },
      B6: { visited: true, chute: 'horizontal' },
      B7: { visited: true, chute: 'sideways' },
    },
  };
  const loaded = migrate(saved);
  assert.equal(loaded?.rooms['2']?.B5?.layout, 'vertical-chute');
  assert.equal(loaded?.rooms['2']?.B6?.layout, 'horizontal-chute');
  assert.equal(loaded?.rooms['2']?.B7?.layout, '');
  // The old field is not carried forward.
  assert.equal((loaded?.rooms['2']?.B5 as unknown as Record<string, unknown>)?.chute, undefined);
});

/* ------------------------------------------------------ push block, cleared */

test('a push block can be flagged and checked, and anything else is refused', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { pushBlock: 'maybe' } });
  assert.equal(state.rooms['3']?.D4?.pushBlock, 'maybe');
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { pushBlock: 'checked' } });
  assert.equal(state.rooms['3']?.D4?.pushBlock, 'checked');
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 3,
    room: 'D4',
    patch: { pushBlock: 'pushed' as unknown as RoomPushBlock },
  });
  assert.equal(refused, state);
  // Back to nothing leaves nothing worth keeping, so the room goes.
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { pushBlock: '' } });
  assert.equal(state.rooms['3']?.D4, undefined);
});

test('a cleared room keeps itself, and a non-boolean is refused', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { cleared: true } });
  assert.equal(state.rooms['3']?.D4?.cleared, true);
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 3,
    room: 'D4',
    patch: { cleared: 'yes' as unknown as boolean },
  });
  assert.equal(refused, state);
  state = reduce(state, { type: 'setRoomNote', level: 3, room: 'D4', patch: { cleared: false } });
  assert.equal(state.rooms['3']?.D4, undefined);
});

test('push block and cleared survive a save, and default in older or damaged ones', () => {
  let state = createInitialState();
  state = reduce(state, {
    type: 'setRoomNote',
    level: 3,
    room: 'D4',
    patch: { pushBlock: 'maybe', cleared: true },
  });
  const loaded = migrate(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded?.rooms['3']?.D4?.pushBlock, 'maybe');
  assert.equal(loaded?.rooms['3']?.D4?.cleared, true);
  const older = JSON.parse(JSON.stringify(state));
  older.rooms['3'].D4 = { visited: true };
  assert.equal(migrate(older)?.rooms['3']?.D4?.pushBlock, '');
  assert.equal(migrate(older)?.rooms['3']?.D4?.cleared, false);
  const damaged = JSON.parse(JSON.stringify(state));
  damaged.rooms['3'].D4 = { visited: true, pushBlock: 'shoved', cleared: 'yes' };
  assert.equal(migrate(damaged)?.rooms['3']?.D4?.pushBlock, '');
  assert.equal(migrate(damaged)?.rooms['3']?.D4?.cleared, false);
});

/* ------------------------------------------------ push blocks and stairs */

test('a push block needs a block in the middle row, as the game looks for it', () => {
  const push = ROOM_LAYOUTS.filter(layoutCanPush)
    .map((layout) => layout.id)
    .sort();
  assert.deepEqual(push, [
    'arch',
    'arrows',
    'block-ring',
    'c-shape',
    'center-block',
    'closed-ring',
    'columns',
    'cross-path',
    'diagonals',
    'diamond',
    'five-pairs',
    'low-blocks',
    'maze',
    'pillar-rows',
    'single-block',
    'spiral',
    'three-bars',
    'twin-blocks',
    'two-blocks',
    'vertical-chute',
  ]);
  // Statues are not blocks: the game matches the block tile only.
  const statues = ROOM_LAYOUTS_BY_ID.get('two-statues');
  assert.ok(statues);
  assert.equal(layoutCanPush(statues), false);
});

test('stairs come from the layout itself or from a push block, so some rooms never have any', () => {
  const builtIn = ROOM_LAYOUTS.filter(layoutHasStairs)
    .map((layout) => layout.id)
    .sort();
  assert.deepEqual(builtIn, ['diamond', 'spiral', 'wedge']);
  assert.equal(ROOM_LAYOUTS.filter(layoutCanHaveStairs).length, 21);
  const corners = ROOM_LAYOUTS_BY_ID.get('corner-statues');
  assert.ok(corners);
  assert.equal(layoutCanPush(corners), false);
  assert.equal(layoutCanHaveStairs(corners), false);
});

/* ------------------------------------------------------------------ known */

test('a room can be premarked as known without being visited', () => {
  assert.equal(emptyRoom().known, false);
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { known: true } });
  const room = state.rooms['2']?.C3;
  assert.equal(room?.known, true);
  assert.equal(room?.visited, false);
  assert.ok(room && !roomIsBare(room));
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 2,
    room: 'C3',
    patch: { known: 'yes' as unknown as boolean },
  });
  assert.equal(refused, state);
  // Unmarking the only thing recorded leaves nothing to keep.
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { known: false } });
  assert.equal(state.rooms['2']?.C3, undefined);
});

test('known survives a save, and defaults to false in older or damaged ones', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { known: true } });
  assert.equal(migrate(JSON.parse(JSON.stringify(state)))?.rooms['2']?.C3?.known, true);
  const older = JSON.parse(JSON.stringify(state));
  older.rooms['2'].C3 = { visited: true };
  assert.equal(migrate(older)?.rooms['2']?.C3?.known, false);
  const damaged = JSON.parse(JSON.stringify(state));
  damaged.rooms['2'].C3 = { visited: true, known: 'yes' };
  assert.equal(migrate(damaged)?.rooms['2']?.C3?.known, false);
});

test('known and visited are one three-way state, never both', () => {
  let state = createInitialState();
  const room = () => state.rooms['2']?.C3;
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { known: true } });
  assert.deepEqual([room()?.known, room()?.visited], [true, false]);
  // Walking it — any gesture that records the room as visited — takes the premark off.
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { visited: true } });
  assert.deepEqual([room()?.known, room()?.visited], [false, true]);
  // And premarking a walked room takes the visit off.
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { known: true } });
  assert.deepEqual([room()?.known, room()?.visited], [true, false]);
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { visited: true } });
  assert.deepEqual([room()?.known, room()?.visited], [false, true]);
  // A patch claiming both is refused whole.
  const refused = reduce(state, {
    type: 'setRoomNote',
    level: 2,
    room: 'C3',
    patch: { known: true, visited: true },
  });
  assert.equal(refused, state);
});

test('a save holding both known and visited loads as visited', () => {
  let state = createInitialState();
  state = reduce(state, { type: 'setRoomNote', level: 2, room: 'C3', patch: { visited: true } });
  const both = JSON.parse(JSON.stringify(state));
  both.rooms['2'].C3.known = true;
  const loaded = migrate(both)?.rooms['2']?.C3;
  assert.deepEqual([loaded?.known, loaded?.visited], [false, true]);
});
