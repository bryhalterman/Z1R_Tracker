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
import { allRoomIds, resolveRoomFrom, type RoomSlotKind } from './rooms.js';
import { deriveLocations, OVERWORLD_LOCATIONS, POOL_BY_ID, SCREEN_ITEMS_BY_ID, type LocationDef } from './seed.js';
import type { TrackerState } from './state.js';

/** Where a filled slot's item was read from — and so where to collect it. */
export type PlacementSource =
  | { readonly kind: 'room'; readonly level: number; readonly room: string }
  | { readonly kind: 'screen'; readonly screen: string }
  /** A `state.locations` entry: a slot from an older save with no placement behind it. */
  | { readonly kind: 'stored' };

export interface ItemPlacement {
  /**
   * Shuffle-pool entry id. Empty only for a stored entry that was marked
   * collected without ever being identified, which older saves can hold.
   */
  readonly item: string;
  readonly collected: boolean;
  readonly source: PlacementSource;
}

/** A room item that found no free slot of its kind in its level. */
export interface OverflowPlacement extends ItemPlacement {
  readonly kind: RoomSlotKind;
  readonly source: { readonly kind: 'room'; readonly level: number; readonly room: string };
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
 * `state.locations` is carried through `migrate` unchecked, so the shape is
 * tested here rather than trusted.
 */
function storedPlacement(state: TrackerState, id: string): ItemPlacement | null {
  const entry: unknown = state.locations[id];
  if (!entry || typeof entry !== 'object') return null;
  const { item, collected } = entry as { item?: unknown; collected?: unknown };
  const stored = {
    item: typeof item === 'string' && POOL_BY_ID.has(item) ? item : '',
    collected: collected === true,
  };
  if (stored.item === '' && !stored.collected) return null;
  return { ...stored, source: { kind: 'stored' } };
}

/**
 * What each item location holds, read off the maps.
 *
 * Rooms are walked level by level in grid order, A1 to H8, and each fills the
 * next free slot of its kind in the order `deriveLocations` lists them. The
 * order is fixed so the same state always puts the same room in the same slot,
 * whatever order the rooms were recorded in. Screens are walked in overworld
 * grid order for the same reason.
 */
export function deriveItemLocations(state: TrackerState): ItemLocations {
  const locations = deriveLocations(state.seed, state.extraFloorSlots);

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
    for (const room of allRoomIds()) {
      const note = levelRooms[room];
      // Pool entries only. This is what leaves the Map, Compass and Triforce
      // out: they have no pool entry because they never move.
      if (!note || !POOL_BY_ID.has(note.item)) continue;
      const kind = resolveRoomFrom(note);
      const source = { kind: 'room', level, room } as const;
      const slot = free.get(slotKey(level, kind))?.shift();
      if (slot) {
        byId.set(slot.id, { item: note.item, collected: note.collected, source });
        continue;
      }
      const spilled = overflow.get(level) ?? [];
      spilled.push({ item: note.item, collected: note.collected, source, kind });
      overflow.set(level, spilled);
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

  return {
    slots: locations.map((location) => ({ location, placement: byId.get(location.id) ?? null })),
    byId,
    overflow,
    overworldOverflow,
  };
}
