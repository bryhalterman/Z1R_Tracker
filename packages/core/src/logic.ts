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

/** `arrow` is progressive: stage 1 is the Wooden Arrow, stage 2 the Silver. */
const SILVER_ARROW_STAGE = 2;

/**
 * Everything needed to finish the game: into Level 9, and able to kill Ganon.
 *
 * Ganon only takes damage from the Silver Arrow, and the arrow needs the Bow to
 * fire it — so the run is winnable exactly when all three are held. This is the
 * one place the tracker states an actual requirement rather than a count, and it
 * is safe to: unlike item *placement*, which the randomizer shuffles freely, the
 * fight itself is not something any seed setting changes.
 */
export function canBeatGanon(state: TrackerState): boolean {
  return (
    canEnterLevel9(state) &&
    (state.items['bow'] ?? 0) >= 1 &&
    (state.items['arrow'] ?? 0) >= SILVER_ARROW_STAGE
  );
}
