/**
 * The room card's words and derived values, worked out without React, so the
 * card's rows stay layout and the wording can be tested on its own.
 */

import {
  ROOM_TRANSPORT_MAX,
  ROOM_TRANSPORT_PAIR_SIZE,
  type BossDef,
  type RoomNote,
  type RoomNotePatch,
  type RoomStairDef,
} from '@z1r/core';

/** How many pair numbers the row shows when no more are in use. */
const PAIRS_SHOWN = 4;

/** The lowest pair with room for another half. */
export function nextPair(rooms: Record<string, RoomNote>): number {
  const counts = new Map<number, number>();
  for (const note of Object.values(rooms)) {
    if (note.transport) counts.set(note.transport, (counts.get(note.transport) ?? 0) + 1);
  }
  for (let number = 1; number <= ROOM_TRANSPORT_MAX; number++) {
    if ((counts.get(number) ?? 0) < ROOM_TRANSPORT_PAIR_SIZE) return number;
  }
  return 1;
}

/** How many transport pair numbers to offer: the usual few, or one past the highest in use. */
export function pairsShown(rooms: Record<string, RoomNote>): number {
  const highestPair = Math.max(0, ...Object.values(rooms).map((room) => room.transport));
  return Math.min(ROOM_TRANSPORT_MAX, Math.max(PAIRS_SHOWN, highestPair + 1));
}

export type VisitState = 'clear' | 'known' | 'visited';

/**
 * One three-way state: never on the map, seen on the map, or walked. `null`
 * with no room selected, so no answer is pressed.
 */
export function visitState(selected: string, note: RoomNote | undefined): VisitState | null {
  if (!selected) return null;
  if (note?.visited) return 'visited';
  return note?.known ? 'known' : 'clear';
}

/** The patch a visit-state answer makes; Clear, or the pressed one clicked again, empties both. */
export function visitPatch(value: VisitState | ''): RoomNotePatch {
  if (value === 'known') return { known: true };
  if (value === 'visited') return { visited: true };
  return { known: false, visited: false };
}

/**
 * One patch of empty values: a room that carries nothing is pruned from the
 * save by the reducer, so "wipe" and "never recorded" land on the same state.
 * Built fresh per call so no two patches share the doors object.
 */
export function wipePatch(): RoomNotePatch {
  return {
    visited: false,
    known: false,
    item: '',
    boss: '',
    stairs: 'none',
    transport: 0,
    from: 'auto',
    ladder: false,
    layout: '',
    pushBlock: '',
    cleared: false,
    doors: { north: 'unknown', east: 'unknown', south: 'unknown', west: 'unknown' },
  };
}

/** The item slot's hover text: what is placed, or how to place something. */
export function itemSlotTitle(itemName: string | undefined): string {
  return (
    itemName ?? 'Nothing placed — drag an item onto this card, or arm one in the palette and click this room'
  );
}

/** What the Collected toggle would do, in words. */
export function collectedTitle(itemName: string | undefined, collected: boolean): string {
  if (itemName === undefined) return 'Nothing here to collect';
  return collected
    ? `Mark ${itemName} not picked up. The inventory keeps what collecting gave it.`
    : `Mark ${itemName} picked up, which marks it held`;
}

export function bossTitle(boss: BossDef): string {
  return boss.level9Only ? `${boss.name} — Level 9 only` : boss.name;
}

export function stairTitle(stair: RoomStairDef): string {
  return stair.tag ? `${stair.name} (${stair.tag})` : stair.name;
}

export function pairTitle(number: number, transport: number): string {
  return transport === number
    ? `Transport pair ${number} — click again to unpair`
    : `Transport pair ${number}`;
}
