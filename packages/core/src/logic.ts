/**
 * Derived checks.
 *
 * This once held a capability table feeding a "Can I…" panel. The panel was
 * removed, and with it the table — there is no point keeping a model of every
 * obstacle that nothing renders.
 *
 * What remains is deliberately not a reachability solver. The randomizer
 * shuffles item placement and dungeon entrances depending on settings, so any
 * claim of the form "location X is in logic" would be wrong under some seed.
 */

import type { TrackerState } from './state.js';
import { triforceCount } from './state.js';
import { TRIFORCE_REQUIRED_FOR_L9 } from './dungeons.js';

/** Level 9's entrance stays shut until every Triforce piece is in hand. */
export function canEnterLevel9(state: TrackerState): boolean {
  return triforceCount(state) >= TRIFORCE_REQUIRED_FOR_L9;
}
