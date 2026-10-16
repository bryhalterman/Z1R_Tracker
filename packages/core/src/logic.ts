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
import { OVERWORLD_STAIRWAY_COUNT } from './overworld.js';
import { triforceCount } from './state.js';
import { TRIFORCE_REQUIRED_FOR_L9 } from './dungeons.js';
import { deriveLocations } from './seed.js';

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

/**
 * Pool ids known to be inside a level.
 *
 * The map marks *where* a dungeon is; the location slots record *what is in
 * it*. Those are learned in either order — a hint names the contents of a level
 * you have not found, and you walk into levels whose contents you have not
 * heard about — so neither can be the place both facts live. Joining them by
 * level number lets the map show the item whichever way round it was learned.
 *
 * Heart Containers are excluded on purpose. Every level has one, so drawing it
 * would put the same icon on nine screens and say nothing.
 */
export function dungeonItems(state: TrackerState, level: number): string[] {
  if (!level) return [];
  return deriveLocations(state.seed, state.extraFloorSlots)
    .filter((location) => location.level === level && location.kind !== 'heart')
    .map((location) => state.locations[location.id]?.item ?? '')
    .filter((item): item is string => item !== '');
}

/**
 * Where each staircase inside a warp room comes out.
 *
 * The four warps sit in a fixed cycle, and the three staircases in any one of
 * them are, left to right, the next three warps around that cycle. Checked
 * in the game's own code, not inferred from a walkthrough: the
 * warp room adds the chosen staircase's value to the current room's index in a
 * four-entry array and masks it to two bits, so left is the successor, middle
 * the one after, right the one before you. The published vanilla chart agrees,
 * and so does what the randomizer community documents. The randomizer can move
 * the four caves and its author says they stay connected; that the ordering
 * survives the move is community knowledge rather than documented behavior.
 *
 * That is why the map asks for the warps to be numbered in the order the
 * leftmost staircase walks you through them: doing it that way makes the
 * numbering the cycle, and then none of this has to be discovered. The screens
 * are the only unknown, and they fill in as the other three get marked.
 */
export const WARP_EXITS = ['left', 'middle', 'right'] as const;

export type WarpExit = (typeof WARP_EXITS)[number];

export interface WarpExitRoute {
  /** Which staircase in the room, as you face them. */
  readonly position: WarpExit;
  /** The warp it comes out at, 1-4. */
  readonly warp: number;
  /** That warp's screen, or null while it is still unmarked. */
  readonly screen: string | null;
}

export interface WarpRoute {
  readonly warp: number;
  readonly screen: string | null;
  readonly exits: readonly WarpExitRoute[];
}

/** The screen each numbered warp is marked on, indexed by number. */
function warpScreens(state: TrackerState): Map<number, string> {
  const found = new Map<number, string>();
  for (const [screen, mark] of Object.entries(state.marks)) {
    if (mark !== 'stairway') continue;
    const number = state.screenNotes[screen]?.stairway ?? 0;
    if (number >= 1 && number <= OVERWORLD_STAIRWAY_COUNT) found.set(number, screen);
  }
  return found;
}

export function warpRoutes(state: TrackerState): WarpRoute[] {
  const screens = warpScreens(state);
  const routes: WarpRoute[] = [];
  for (let warp = 1; warp <= OVERWORLD_STAIRWAY_COUNT; warp++) {
    const exits = WARP_EXITS.map((position, step) => {
      const target = ((warp - 1 + step + 1) % OVERWORLD_STAIRWAY_COUNT) + 1;
      return { position, warp: target, screen: screens.get(target) ?? null };
    });
    routes.push({ warp, screen: screens.get(warp) ?? null, exits });
  }
  return routes;
}
