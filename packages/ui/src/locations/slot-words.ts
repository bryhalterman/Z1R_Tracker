/**
 * What a location chip says, shared by the clickable React chips and the
 * read-only overlay's plain-DOM ones, so the two always read the same.
 */

import type { ItemPlacement, LocationDef } from '@z1r/core';

const KIND_TITLE: Record<string, string> = {
  floor: 'Lying on the dungeon floor',
  stair: 'Behind a staircase / item basement',
  heart: 'Heart Container',
  overworld: 'Named overworld location',
};

/** Single letter per slot kind — the whole label will not fit at this size. */
const KIND_INITIAL: Record<string, string> = {
  floor: 'F',
  stair: 'S',
  heart: 'H',
  overworld: 'O',
};

/**
 * The three overworld spots are not interchangeable, so they do not share a
 * letter.
 *
 * They rendered as three identical `O` chips, which told you there were three
 * of them and nothing else — you had to hover each one to find out which was
 * the Coast. Dungeon slots genuinely are interchangeable within a level, so
 * those keep their kind initial.
 */
const SPOT_CODE: Record<string, string> = {
  'ow.whiteSword': 'WS',
  'ow.armos': 'AR',
  'ow.coast': 'CO',
};

/** What an empty chip shows instead of a sprite: the spot's code, or the slot kind's letter. */
export function slotCode(kind: string, location: LocationDef | null): string {
  return (location ? SPOT_CODE[location.id] : undefined) ?? KIND_INITIAL[kind] ?? '?';
}

/** The chip's words: where the slot is, what is in it, and whether it is collected. */
export function slotText(
  kind: string,
  location: LocationDef | null,
  placement: ItemPlacement | null,
  itemName: string | undefined,
): string {
  const where = location ? location.label : `Extra ${KIND_TITLE[kind]?.toLowerCase() ?? kind}`;
  return (
    `${where} — ${itemName ?? 'unknown'}${placement?.collected ? ' (collected)' : ''}` +
    (placement ? '' : ' — place it on a map to record it')
  );
}
