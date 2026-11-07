/**
 * Per-screen note helpers shared by the reducer and `migrate`.
 *
 * Internal to the core package: `index.ts` does not re-export this module, so
 * these stay out of the public surface the apps build against.
 */

import type { MarkKind } from './overworld.js';
import type { ScreenNote } from './state.js';

export function emptyNote(): ScreenNote {
  return {
    dungeon: 0,
    stairway: 0,
    shop: [],
    shopPrices: {},
    blocks: [],
    spot: '',
    item: '',
    collected: false,
    secret: '',
  };
}

/** True once a note carries nothing worth keeping. */
export function noteIsBare(note: ScreenNote): boolean {
  return (
    note.dungeon === 0 &&
    note.stairway === 0 &&
    note.shop.length === 0 &&
    // A price outlives nothing: `toggleShopStock` drops one with its stock, so
    // this only holds a note up when a price was written without the stock.
    Object.keys(note.shopPrices).length === 0 &&
    note.blocks.length === 0 &&
    note.spot === '' &&
    note.item === '' &&
    !note.collected &&
    note.secret === ''
  );
}

/** Fields `sameNote` compares by value; the lists and prices need their own comparison. */
const SCALAR_NOTE_FIELDS = ['dungeon', 'stairway', 'spot', 'item', 'collected', 'secret'] as const;

/** A note's prices as one string, in key order, so two can be compared whatever order they were written in. */
function pricesKey(note: ScreenNote): string {
  return Object.entries(note.shopPrices)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .join(';');
}

/** Whether two notes record the same thing, field by field. */
export function sameNote(a: ScreenNote | undefined, b: ScreenNote | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    SCALAR_NOTE_FIELDS.every((field) => a[field] === b[field]) &&
    a.shop.join() === b.shop.join() &&
    a.blocks.join() === b.blocks.join() &&
    pricesKey(a) === pricesKey(b)
  );
}

/**
 * Drop what a note holds for a mark the screen no longer carries.
 *
 * A level number and the dungeon's blockers belong to a screen marked as a
 * dungeon; a stairway number to one marked as a stairway. Re-marking a Level 3
 * screen as a shop used to leave `dungeon: 3` in its note, and placing Level 3
 * somewhere else then took the shop for the old Level 3 and deleted it, mark,
 * stock and all. The blockers stayed too: drawn nowhere, never carried to the
 * level's new screen, and back again if the screen became a dungeon later.
 *
 * Returns the same note when nothing had to go, so callers can skip a write.
 */
export function fitNoteToMark(note: ScreenNote, mark: MarkKind | undefined): ScreenNote {
  const isDungeon = mark === 'dungeon';
  const dungeon = isDungeon ? note.dungeon : 0;
  const blocks = isDungeon || note.blocks.length === 0 ? note.blocks : [];
  const stairway = mark === 'stairway' ? note.stairway : 0;
  if (dungeon === note.dungeon && stairway === note.stairway && blocks === note.blocks) return note;
  return { ...note, dungeon, stairway, blocks };
}
