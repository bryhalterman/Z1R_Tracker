/**
 * Dungeon room grid model.
 *
 * A Z1 level is laid out on a fixed 8x8 grid of rooms, so one level's map is
 * addressed exactly the way the overworld is: columns numbered 1-8 left to
 * right, rows lettered A-H top to bottom, giving `A1`-`H8`. The scheme is
 * shared with `overworld.ts` on purpose — one id format for every grid in the
 * tracker means a renderer, a save file and a bug report all read the same.
 *
 * What a room records is what the randomizer moves: whether you have been in
 * it, which item is sitting there, which boss is in it, whether it has stairs,
 * and what each of its four doorways turned out to be. The map behind it never
 * changes shape, so nothing here describes terrain.
 *
 * Recording an item here says *where the item is*. It never grants it on its
 * own: an item becomes held only when the room is marked collected, which is a
 * separate gesture from placing it.
 */

import { DUNGEONS_BY_LEVEL } from './dungeons.js';
import { MINOR_DROPS, SHUFFLE_POOL } from './seed.js';

export const ROOM_COLUMNS = 8;
export const ROOM_ROWS = 8;

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** `col` is 1-based (1-8), `row` is 1-based (1-8). */
export function roomId(col: number, row: number): string {
  const label = ROW_LABELS[row - 1] ?? '?';
  return `${label}${col}`;
}

export function allRoomIds(): string[] {
  const ids: string[] = [];
  for (let row = 1; row <= ROOM_ROWS; row++) {
    for (let col = 1; col <= ROOM_COLUMNS; col++) {
      ids.push(roomId(col, row));
    }
  }
  return ids;
}

const ROOM_ID_SET: ReadonlySet<string> = new Set(allRoomIds());

/** True for an id inside the grid. Both the reducer and `migrate` gate on this. */
export function isRoomId(id: string): boolean {
  return ROOM_ID_SET.has(id);
}

/**
 * True for a level that has a room grid — 1 to 9.
 *
 * Read off the dungeon table rather than compared against literals, so the two
 * cannot disagree about how many levels exist.
 */
export function isRoomLevel(level: number): boolean {
  return DUNGEONS_BY_LEVEL.has(level);
}

/**
 * The four walls of a room, clockwise from the top.
 *
 * Kept as a fixed record rather than a sparse map because every room has
 * exactly four sides and a renderer draws all of them every time; an absent
 * key would only mean `unknown` anyway.
 */
export interface RoomDoors {
  north: DoorState;
  east: DoorState;
  south: DoorState;
  west: DoorState;
}

export type RoomSide = keyof RoomDoors;

export const ROOM_SIDES: readonly RoomSide[] = ['north', 'east', 'south', 'west'];

const ROOM_SIDE_SET: ReadonlySet<string> = new Set<string>(ROOM_SIDES);

export function isRoomSide(side: string): side is RoomSide {
  return ROOM_SIDE_SET.has(side);
}

/**
 * What a doorway turned out to be.
 *
 * `unknown` is the starting value and a real answer in itself: "I have not
 * stood in front of this wall" is different from "there is nothing there".
 */
export type DoorState = 'unknown' | 'open' | 'wall' | 'bombed' | 'locked' | 'shutter';

export interface DoorStateDef {
  readonly id: DoorState;
  readonly name: string;
  /**
   * Two-character tag drawn on the doorway.
   *
   * The second, non-colour channel the accessibility rule requires: a door is
   * a 6px sliver of a 40px cell, so a tint is the one thing it cannot rely on
   * to say which of six states it is in.
   */
  readonly tag: string;
}

/**
 * All six states, in the order a renderer should offer them.
 *
 * The first three are the ones worth a click on the grid itself — they are
 * what you learn by walking into a wall. The last three are specific enough
 * that you only ever set them deliberately. The model draws no distinction
 * between the two groups: which of them a given control exposes is the UI's
 * business, and baking a "cycleable" flag in here would freeze one interaction
 * design into the save format.
 */
export const DOOR_STATES: readonly DoorStateDef[] = [
  { id: 'unknown', name: 'Unknown', tag: '??' },
  { id: 'open', name: 'Open', tag: 'OP' },
  { id: 'wall', name: 'Wall', tag: 'WL' },
  // A wall you have already spent a bomb on and that did not open, which is
  // worth a state of its own precisely because it looks identical to one you
  // have not tested yet. The tag is the bomb struck out, not an invitation to
  // bring another.
  { id: 'bombed', name: 'Bombed, solid', tag: 'BX' },
  { id: 'locked', name: 'Locked', tag: 'LK' },
  // Closes behind you and opens again when the room is cleared, so a shutter
  // you remember is a fight you have not finished.
  { id: 'shutter', name: 'Shutter', tag: 'SH' },
];

export const DOOR_STATES_BY_ID: ReadonlyMap<string, DoorStateDef> = new Map(
  DOOR_STATES.map((entry) => [entry.id, entry]),
);

/** Where a staircase in a room goes. */
export type RoomStairKind = 'none' | 'item' | 'transport';

export interface RoomStairDef {
  readonly id: RoomStairKind;
  readonly name: string;
  /** Short tag, so the kind reads without depending on colour. */
  readonly tag: string;
}

export const ROOM_STAIRS: readonly RoomStairDef[] = [
  { id: 'none', name: 'No stairs', tag: '' },
  // Stairs down to a basement or an item alcove: a dead end you walk back out
  // of, and the one worth marking because it holds something.
  { id: 'item', name: 'Item stairs', tag: 'IT' },
  // The paired kind. Two of these in a level are the same staircase, which is
  // why they carry a number — see `ROOM_TRANSPORT_COUNT`.
  { id: 'transport', name: 'Transport stairs', tag: 'TP' },
];

export const ROOM_STAIRS_BY_ID: ReadonlyMap<string, RoomStairDef> = new Map(
  ROOM_STAIRS.map((entry) => [entry.id, entry]),
);

/** How many transport pairs a level can hold, numbered 1-4. */
export const ROOM_TRANSPORT_COUNT = 4;

/** A transport number names a pair, so two rooms hold it and no more. */
export const ROOM_TRANSPORT_PAIR_SIZE = 2;

export interface BossDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /**
   * True for the two that only ever appear in Level 9.
   *
   * The randomizer moves the other seven anywhere, so a boss is otherwise
   * valid on any level. These two are not: accepting Ganon on Level 3 would
   * record a room that cannot exist.
   */
  readonly level9Only: boolean;
}

export const DUNGEON_BOSSES: readonly BossDef[] = [
  { id: 'aquamentus', name: 'Aquamentus', sprite: 'boss.aquamentus', level9Only: false },
  { id: 'dodongo', name: 'Dodongo', sprite: 'boss.dodongo', level9Only: false },
  { id: 'manhandla', name: 'Manhandla', sprite: 'boss.manhandla', level9Only: false },
  { id: 'gleeok', name: 'Gleeok', sprite: 'boss.gleeok', level9Only: false },
  { id: 'digdogger', name: 'Digdogger', sprite: 'boss.digdogger', level9Only: false },
  { id: 'gohma', name: 'Gohma', sprite: 'boss.gohma', level9Only: false },
  { id: 'patra', name: 'Patra', sprite: 'boss.patra', level9Only: false },
  { id: 'ganon', name: 'Ganon', sprite: 'boss.ganon', level9Only: true },
  // Not a fight, but it is the room you are looking for, and it sits on the
  // same grid behind the same door as Ganon.
  { id: 'zelda', name: 'Princess Zelda', sprite: 'npc.zelda', level9Only: true },
];

export const DUNGEON_BOSSES_BY_ID: ReadonlyMap<string, BossDef> = new Map(
  DUNGEON_BOSSES.map((entry) => [entry.id, entry]),
);

/** Which level the two Level 9 entries are allowed on. */
export const LEVEL_NINE = 9;

/** False for Ganon or Zelda outside Level 9, and for an id with no definition. */
export function bossAllowedOnLevel(boss: string, level: number): boolean {
  const def = DUNGEON_BOSSES_BY_ID.get(boss);
  if (!def) return false;
  return !def.level9Only || level === LEVEL_NINE;
}

export interface RoomItemDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
}

/**
 * The three dungeon-only pickups that are not shuffle-pool entries.
 *
 * The pool is what the randomizer moves between locations; these are generated
 * per level and never travel, so they have no pool entry and no inventory
 * item. They are still the three things most worth writing on a dungeon map,
 * so the room item set is the pool plus these rather than the pool alone.
 */
export const DUNGEON_ONLY_ITEMS: readonly RoomItemDef[] = [
  { id: 'map', name: 'Map', sprite: 'item.map' },
  { id: 'compass', name: 'Compass', sprite: 'item.compass' },
  { id: 'triforce', name: 'Triforce Piece', sprite: 'item.triforce' },
];

/**
 * Every id a room's `item` may hold.
 *
 * Derived from `SHUFFLE_POOL` rather than retyped, so an item added to the
 * pool is placeable on a dungeon map the same day. Only the three fields a
 * room map needs are carried across: what grants what is the pool's business,
 * and a room records a location, not a pickup.
 */
export const ROOM_ITEMS: readonly RoomItemDef[] = [
  ...SHUFFLE_POOL.map(({ id, name, sprite }) => ({ id, name, sprite })),
  ...MINOR_DROPS.map(({ id, name, sprite }) => ({ id, name, sprite })),
  ...DUNGEON_ONLY_ITEMS,
];

export const ROOM_ITEMS_BY_ID: ReadonlyMap<string, RoomItemDef> = new Map(
  ROOM_ITEMS.map((entry) => [entry.id, entry]),
);

/**
 * How a room's item was found, which decides the location slot it fills.
 *
 * The slot cannot be read off the item. Randomizer flags shuffle any item into
 * the boss drop, so a Bow can be the "heart container" of a level and a Heart
 * Container can sit on the floor. What the room looked like is what says which
 * slot it was, so that is what the room records.
 *
 * `auto` is the default and reads the room itself — see `resolveRoomFrom`. The
 * other two are the player overruling it, for the room the rule gets wrong.
 *
 * Two kinds, not three. A dungeon item is on the floor or down a staircase;
 * the level's heart spot is one of its floor spots, which a shuffled item can
 * take as easily as a heart. Which floor spot an item fills is worked out when
 * the slots are filled — see `deriveItemLocations`. Saves that recorded the
 * old third value, `heart`, load it as `floor`.
 */
export type RoomFrom = 'auto' | 'floor' | 'stair';

/** The slot kind a room's item resolves to once `auto` has been decided. */
export type RoomSlotKind = Exclude<RoomFrom, 'auto'>;

export const ROOM_FROMS: readonly RoomFrom[] = ['auto', 'floor', 'stair'];

const ROOM_FROM_SET: ReadonlySet<string> = new Set<string>(ROOM_FROMS);

/** True for one of the three values; the reducer and `migrate` both gate on it. */
export function isRoomFrom(value: unknown): value is RoomFrom {
  return typeof value === 'string' && ROOM_FROM_SET.has(value);
}

/**
 * Whether a room's item is a floor item or a stair item.
 *
 * Under `auto`, item stairs mean the stair slot and anything else is on the
 * floor. An explicit `from` overrules it.
 */
export function resolveRoomFrom(room: Pick<RoomNote, 'from' | 'stairs'>): RoomSlotKind {
  if (room.from !== 'auto') return room.from;
  return room.stairs === 'item' ? 'stair' : 'floor';
}

/**
 * What is known about one room of one level.
 *
 * Flat rather than a union, for the same reason `ScreenNote` is: every field is
 * independently true or absent — a room can hold a boss *and* an item *and*
 * stairs — and persistence would otherwise have to discriminate on load.
 */
export interface RoomNote {
  visited: boolean;
  /** `RoomItemDef` id known to be here. Empty until identified. */
  item: string;
  /** `BossDef` id. Empty for a room with no boss in it. */
  boss: string;
  stairs: RoomStairKind;
  /** Which transport pair, 1-4. 0 means unpaired, including for item stairs. */
  transport: number;
  /**
   * When this room's transport number was placed, relative to the others in
   * the same level. 0 whenever `transport` is 0.
   *
   * This exists so the two-rooms-per-number rule can evict the longest-held
   * room from a pure reducer. A reducer has no insertion order to consult —
   * object key order is not a model guarantee and does not survive a JSON
   * round trip as anything to rely on — so the order has to be *in* the state.
   * A placement stamps the room with one past the highest stamp in that level,
   * which makes the stamps unique within a level by construction, and eviction
   * drops the smallest. Clearing the highest lets its number be reused later,
   * which is harmless: only the relative order of the two rooms holding one
   * number is ever compared, and a fresh stamp is always above both.
   */
  transportSeq: number;
  doors: RoomDoors;
  /**
   * Whether the item here has been picked up, as opposed to merely seen.
   *
   * Always about the current `item`: changing or clearing the item drops it
   * back to false, because a pickup of one item says nothing about another.
   */
  collected: boolean;
  /** How the item was found, and so which location slot it fills. */
  from: RoomFrom;
  /**
   * Water in the way: the room cannot be crossed, or its item reached,
   * without the Ladder. Whether the Ladder is held is read from the inventory
   * when the room is drawn, not stored here.
   */
  ladder: boolean;
  /** Which way the room's chute runs, or empty for none. */
  chute: RoomChute;
}

/**
 * A chute room: two rows of blocks down the middle that split the room into
 * lanes. `vertical` runs north to south, `horizontal` west to east; empty is
 * an ordinary room.
 */
export type RoomChute = '' | 'vertical' | 'horizontal';

export const ROOM_CHUTES: readonly RoomChute[] = ['', 'vertical', 'horizontal'];

const ROOM_CHUTE_SET: ReadonlySet<string> = new Set<string>(ROOM_CHUTES);

/** True for one of the three values; the reducer and `migrate` both gate on it. */
export function isRoomChute(value: unknown): value is RoomChute {
  return typeof value === 'string' && ROOM_CHUTE_SET.has(value);
}

/**
 * A partial room note, with the doors partial too.
 *
 * `Partial<RoomNote>` alone would demand all four doors in any patch that
 * mentioned one, which is the opposite of what a detail strip sends — it
 * commits the one side the player just answered for.
 */
export type RoomNotePatch = Partial<Omit<RoomNote, 'doors'>> & { doors?: Partial<RoomDoors> };

export function emptyRoom(): RoomNote {
  return {
    visited: false,
    item: '',
    boss: '',
    stairs: 'none',
    transport: 0,
    transportSeq: 0,
    doors: { north: 'unknown', east: 'unknown', south: 'unknown', west: 'unknown' },
    collected: false,
    from: 'auto',
    ladder: false,
    chute: '',
  };
}

/** True once a room carries nothing worth keeping. */
export function roomIsBare(room: RoomNote): boolean {
  return (
    !room.visited &&
    room.item === '' &&
    room.boss === '' &&
    room.stairs === 'none' &&
    room.transport === 0 &&
    !room.collected &&
    room.from === 'auto' &&
    !room.ladder &&
    room.chute === '' &&
    ROOM_SIDES.every((side) => room.doors[side] === 'unknown')
  );
}
