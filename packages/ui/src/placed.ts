/**
 * Where items have been recorded on the maps, for the cells that show it: the
 * OBS inventory, and the page's palette.
 */

import {
  OVERWORLD_LOCATIONS,
  ROOM_ITEMS_BY_ID,
  SCREEN_ITEMS_BY_ID,
  deriveItemLocations,
  type TrackerState,
} from '@z1r/core';

type PlacedIndex = Map<string, string[]>;
type Derived = ReturnType<typeof deriveItemLocations>;

function record(placedAt: PlacedIndex, item: string, where: string): void {
  const seen = placedAt.get(item);
  if (seen) seen.push(where);
  else placedAt.set(item, [where]);
}

function recordRooms(placedAt: PlacedIndex, state: TrackerState): void {
  for (const [level, rooms] of Object.entries(state.rooms)) {
    for (const [room, note] of Object.entries(rooms)) {
      if (note.item) record(placedAt, note.item, `L${level} ${room}`);
    }
  }
}

function recordScreens(placedAt: PlacedIndex, state: TrackerState): void {
  for (const [screen, note] of Object.entries(state.screenNotes)) {
    // The map draws an item only on an item screen, so only those count.
    if (!note.item || state.marks[screen] !== 'item') continue;
    const spot = note.spot ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label : '';
    record(placedAt, note.item, spot ? `${spot} (${screen})` : screen);
  }
}

function recordStoredSlots(placedAt: PlacedIndex, derived: Derived): void {
  for (const { location, placement } of derived.slots) {
    if (placement?.source.kind === 'stored' && placement.item) {
      record(placedAt, placement.item, location.label);
    }
  }
}

/** An older save's extra floor slots, now listed as overflow in their level. */
function recordOverflow(placedAt: PlacedIndex, derived: Derived): void {
  for (const [level, spilled] of derived.overflow) {
    for (const placement of spilled) {
      if (placement.source.kind !== 'stored' || !placement.item) continue;
      // The id's last part is the slot's index, so two of these in one level,
      // or one beside a real floor slot, still read differently.
      const index = Number(placement.source.id.split('.').pop()) + 1;
      record(placedAt, placement.item, `L${level} extra floor ${index}`);
    }
  }
}

/**
 * Where each room item has been recorded, as item id -> places.
 *
 * Every cell wants "is this spoken for, and where", and there are up to two
 * dozen of them. Rebuilt once per pass rather than walked per cell.
 *
 * Three sources, because an item can be written down in three places: a room
 * on a level map, an item screen on the overworld, and — for a save from before
 * the maps filled the item locations — a location slot itself. All three land
 * in one index, so a cell's corner tick means the same thing wherever the item
 * was recorded.
 */
export function placedIndex(state: TrackerState): PlacedIndex {
  const placedAt: PlacedIndex = new Map();
  recordRooms(placedAt, state);
  recordScreens(placedAt, state);
  const derived = deriveItemLocations(state);
  recordStoredSlots(placedAt, derived);
  recordOverflow(placedAt, derived);
  return placedAt;
}

/** Each place this item has been recorded in, phrased for a tooltip. */
export function placedSuffix(ids: readonly string[], placedAt: Map<string, string[]>): string {
  const parts: string[] = [];
  for (const id of ids) {
    const where = placedAt.get(id);
    if (!where?.length) continue;
    const name = SCREEN_ITEMS_BY_ID.get(id)?.name ?? ROOM_ITEMS_BY_ID.get(id)?.name ?? id;
    parts.push(`${name} at ${where.join(', ')}`);
  }
  return parts.length ? ` — placed: ${parts.join('; ')}` : '';
}
