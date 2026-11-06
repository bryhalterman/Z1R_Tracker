/**
 * Location ids older saves can hold in `state.locations`.
 *
 * Internal to the core package: `index.ts` does not re-export this module.
 */

import { createSeedSettings, deriveLocations, type ConcreteQuest } from './seed.js';

const QUESTS: readonly ConcreteQuest[] = ['1st', '2nd'];

/**
 * Every id some seed setting can produce. The quest is the only setting that
 * changes which dungeon slots exist, and a Mixed seed takes each level from
 * one of the two quests, so all-1st plus all-2nd covers every combination.
 */
const SEED_LOCATION_IDS: ReadonlySet<string> = new Set(
  QUESTS.flatMap((quest) =>
    deriveLocations({ ...createSeedSettings(), dungeonQuest: quest }).map((location) => location.id),
  ),
);

const FLOOR_ID = /^d([1-9])\.floor\.\d+$/;

/**
 * The level of an extra floor slot an older save added by hand under Shuffle
 * Minor Dungeon Drops, or null when `id` is not one.
 *
 * Those slots no longer exist, so no seed setting produces their ids. An entry
 * recorded in one is shown as overflow in its level rather than dropped.
 */
export function formerExtraFloorLevel(id: string): number | null {
  if (SEED_LOCATION_IDS.has(id)) return null;
  const match = FLOOR_ID.exec(id);
  return match ? Number(match[1]) : null;
}

/** An id worth keeping on load: a real slot, or a former extra floor slot. */
export function isStorableLocationId(id: string): boolean {
  return SEED_LOCATION_IDS.has(id) || formerExtraFloorLevel(id) !== null;
}
