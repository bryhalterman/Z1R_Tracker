/**
 * Item locations, derived from what is placed on the maps.
 *
 * The location list used to be edited directly, which meant the same fact —
 * "the Bow is in Level 3's basement" — was written down twice, once on the
 * room and once in the slot, and the two could disagree. Now the maps are the
 * only place an item is placed, and the slots are read off them.
 *
 * A room fills a slot of the kind `resolveRoomFrom` gives it; an overworld
 * screen fills the named spot its note carries. Only shuffle-pool entries fill
 * slots: the Map, Compass and Triforce are in every level and never move, so
 * they may sit on a room as an annotation but take no slot.
 *
 * Saves from before this existed hold their slots in `state.locations` with no
 * rooms behind them. Any slot the maps leave empty falls back to that stored
 * entry, so an upgrade loses nobody's run; a slot the maps do fill ignores it.
 */

import { DUNGEONS } from './dungeons.js';
import { allScreenIds } from './overworld.js';
import { allRoomIds, resolveRoomFrom, type RoomNote, type RoomSlotKind } from './rooms.js';
import { deriveLocations, OVERWORLD_LOCATIONS, POOL_BY_ID, SCREEN_ITEMS_BY_ID, type LocationDef } from './seed.js';
import type { TrackerState } from './state.js';
import { formerExtraFloorLevel } from './legacy-locations.js';

/** Where a filled slot's item was read from — and so where to collect it. */
export type PlacementSource =
  | { readonly kind: 'room'; readonly level: number; readonly room: string }
  | { readonly kind: 'screen'; readonly screen: string }
  /**
   * A `state.locations` entry: a slot from an older save with no placement
   * behind it. `id` is the entry's key, which is where its flag is collected.
   */
  | { readonly kind: 'stored'; readonly id: string };

export interface ItemPlacement {
  /**
   * Shuffle-pool entry id. Empty only for a stored entry that was marked
   * collected without ever being identified, which older saves can hold.
   */
  readonly item: string;
  readonly collected: boolean;
  readonly source: PlacementSource;
}

/**
 * An item listed beside its level's slots rather than in one: a room item that
 * found no free slot of its kind, or an entry an older save recorded in an
 * extra floor slot, which no longer exists.
 */
export interface OverflowPlacement extends ItemPlacement {
  readonly kind: RoomSlotKind;
  readonly source:
    | { readonly kind: 'room'; readonly level: number; readonly room: string }
    | { readonly kind: 'stored'; readonly id: string };
}

export interface FilledSlot {
  readonly location: LocationDef;
  /** What fills it, or null while nothing does. */
  readonly placement: ItemPlacement | null;
}

export interface ItemLocations {
  /** Every location `deriveLocations` lists, in its order, with what fills it. */
  readonly slots: readonly FilledSlot[];
  /** Location id -> what fills it. Absent while the slot is empty. */
  readonly byId: ReadonlyMap<string, ItemPlacement>;
  /**
   * Level -> room items that found no free slot of their kind, in grid order.
   *
   * Shown rather than refused: the slot counts are the default quest's, and a
   * seed can hold more than that. Absent for a level with no overflow.
   */
  readonly overflow: ReadonlyMap<number, readonly OverflowPlacement[]>;
  /**
   * Screens naming an overworld spot another screen already fills, in grid
   * order. Each spot exists once, so a second claim is a mapping mistake to
   * show, not one to drop silently.
   */
  readonly overworldOverflow: readonly ItemPlacement[];
}

const OVERWORLD_SPOT_IDS: ReadonlySet<string> = new Set(OVERWORLD_LOCATIONS.map((l) => l.id));

function slotKey(level: number, kind: string): string {
  return `${level}:${kind}`;
}

/**
 * A stored slot entry, if it says anything.
 *
 * `migrate` checks the shape of `state.locations` on load, so an entry is
 * either a known pool item, a collected flag, or both.
 */
function storedPlacement(state: TrackerState, id: string): ItemPlacement | null {
  const entry = state.locations[id];
  if (!entry || (entry.item === '' && !entry.collected)) return null;
  return { item: entry.item, collected: entry.collected, source: { kind: 'stored', id } };
}

/**
 * What each item location holds, read off the maps.
 *
 * Rooms are walked level by level in grid order, A1 to H8, so the same state
 * always puts the same room in the same slot whatever order the rooms were
 * recorded in. A stair item fills the next free stair slot.
 *
 * A floor item fills one of the level's floor spots, and the heart spot is one
 * of them: randomizer flags put any item there, and a Heart Container can lie
 * in a plain floor spot. It goes in two passes. First each takes the spot it
 * most likely is — a Heart Container the heart spot, anything else a floor
 * slot — and then whatever found its first choice taken takes any floor spot
 * left. Only when every floor spot in the level is full does it overflow.
 *
 * Screens are walked in overworld grid order for the same reason as rooms.
 *
 * Cached per state object. The store replaces the state on every edit and
 * never mutates one in place, and one edit asks for this from several panels
 * and once per numbered dungeon cell, so each state is derived once.
 */
export function deriveItemLocations(state: TrackerState): ItemLocations {
  const cached = DERIVED.get(state);
  if (cached) return cached;
  const derived = derive(state);
  DERIVED.set(state, derived);
  return derived;
}

const DERIVED = new WeakMap<TrackerState, ItemLocations>();

function derive(state: TrackerState): ItemLocations {
  const locations = deriveLocations(state.seed);

  // Free slots per level and kind, in listed order, consumed from the front.
  const free = new Map<string, LocationDef[]>();
  for (const location of locations) {
    if (location.level === undefined) continue;
    const key = slotKey(location.level, location.kind);
    const queue = free.get(key) ?? [];
    queue.push(location);
    free.set(key, queue);
  }

  const byId = new Map<string, ItemPlacement>();
  const overflow = new Map<number, OverflowPlacement[]>();

  for (const { level } of DUNGEONS) {
    const levelRooms = state.rooms[String(level)];
    if (!levelRooms) continue;
    const take = (kind: LocationDef['kind']) => free.get(slotKey(level, kind))?.shift();
    const place = (slot: LocationDef, note: RoomNote, room: string) =>
      byId.set(slot.id, {
        item: note.item,
        collected: note.collected,
        source: { kind: 'room', level, room },
      });
    const spill = (note: RoomNote, room: string, kind: RoomSlotKind) => {
      const spilled = overflow.get(level) ?? [];
      spilled.push({
        item: note.item,
        collected: note.collected,
        source: { kind: 'room', level, room },
        kind,
      });
      overflow.set(level, spilled);
    };

    const deferred: { note: RoomNote; room: string }[] = [];
    for (const room of allRoomIds()) {
      const note = levelRooms[room];
      // Pool entries only. This is what leaves the Map, Compass and Triforce
      // out: they have no pool entry because they never move.
      if (!note || !POOL_BY_ID.has(note.item)) continue;
      if (resolveRoomFrom(note) === 'stair') {
        const slot = take('stair');
        if (slot) place(slot, note, room);
        else spill(note, room, 'stair');
        continue;
      }
      const slot = take(note.item === 'heart' ? 'heart' : 'floor');
      if (slot) place(slot, note, room);
      else deferred.push({ note, room });
    }

    // Second pass: any floor spot still free, plain or heart.
    for (const { note, room } of deferred) {
      const slot = take('floor') ?? take('heart');
      if (slot) place(slot, note, room);
      else spill(note, room, 'floor');
    }
  }

  const overworldOverflow: ItemPlacement[] = [];
  for (const screen of allScreenIds()) {
    const note = state.screenNotes[screen];
    // A screen with an item but no named spot is a note on the map, not one
    // of the three slots, so it fills nothing.
    if (!note || !OVERWORLD_SPOT_IDS.has(note.spot) || !SCREEN_ITEMS_BY_ID.has(note.item)) continue;
    const placement: ItemPlacement = {
      item: note.item,
      collected: note.collected,
      source: { kind: 'screen', screen },
    };
    if (byId.has(note.spot)) overworldOverflow.push(placement);
    else byId.set(note.spot, placement);
  }

  // The fallback runs last and only into slots still empty, so a placement on
  // the maps always wins over what an older save stored for the same slot.
  for (const location of locations) {
    if (byId.has(location.id)) continue;
    const stored = storedPlacement(state, location.id);
    if (stored) byId.set(location.id, stored);
  }

  // Extra floor slots an older save added by hand no longer exist, so what it
  // recorded in one joins its level's overflow instead of vanishing.
  // Filtered before sorting: most saves hold none, and this runs per render.
  const extras: [string, number][] = [];
  for (const id of Object.keys(state.locations)) {
    const level = formerExtraFloorLevel(id);
    if (level !== null) extras.push([id, level]);
  }
  extras.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [id, level] of extras) {
    const stored = storedPlacement(state, id);
    if (!stored) continue;
    const spilled = overflow.get(level) ?? [];
    spilled.push({ ...stored, source: { kind: 'stored', id }, kind: 'floor' });
    overflow.set(level, spilled);
  }

  return {
    slots: locations.map((location) => ({ location, placement: byId.get(location.id) ?? null })),
    byId,
    overflow,
    overworldOverflow,
  };
}
