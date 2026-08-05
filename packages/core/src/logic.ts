/**
 * Derived capability checks.
 *
 * These are *hints*, not a solver. The randomizer can shuffle item placement
 * and dungeon entrances, so the tracker deliberately does not claim "location
 * X is in logic" — it only answers "do I currently hold what this obstacle
 * needs?", which stays true under every shuffle setting.
 */

import type { TrackerState } from './state.js';
import { triforceCount } from './state.js';
import { TRIFORCE_REQUIRED_FOR_L9 } from './dungeons.js';

export interface Capability {
  readonly id: string;
  readonly label: string;
  /** Item ids (with the minimum stage) this capability needs. */
  readonly requires: readonly (readonly [itemId: string, minimum: number])[];
}

export interface CapabilityResult extends Capability {
  readonly met: boolean;
  /** Item ids still missing or under-levelled. */
  readonly missing: readonly string[];
}

/**
 * Every obstacle gets a chip, including the single-item ones.
 *
 * These were once cut on the argument that "Burn bushes" merely restates
 * "you have the candle". That was wrong. The question you ask mid-run is
 * *can I get past this*, and answering it from a grid of eighteen small
 * sprites is real work — the panel exists precisely so you don't have to.
 * Naming the obstacle in plain language is the feature, not redundancy.
 */
export const CAPABILITIES: readonly Capability[] = [
  { id: 'burn', label: 'Burn bushes', requires: [['candle', 1]] },
  { id: 'blast', label: 'Blast walls', requires: [['bomb', 1]] },
  { id: 'push', label: 'Push rocks', requires: [['bracelet', 1]] },
  { id: 'water', label: 'Cross water', requires: [['raft', 1]] },
  { id: 'river', label: 'Cross rivers', requires: [['ladder', 1]] },
  { id: 'read', label: 'Read tablets', requires: [['book', 1]] },
  { id: 'digdogger', label: 'Split Digdogger', requires: [['recorder', 1]] },
  { id: 'gohma', label: 'Damage Gohma', requires: [['bow', 1], ['arrow', 1]] },
  { id: 'ganon', label: 'Finish Ganon', requires: [['sword', 1], ['bow', 1], ['arrow', 2]] },
];

export function evaluate(state: TrackerState, capability: Capability): CapabilityResult {
  const missing = capability.requires
    .filter(([id, minimum]) => (state.items[id] ?? 0) < minimum)
    .map(([id]) => id);
  return { ...capability, met: missing.length === 0, missing };
}

export function evaluateAll(state: TrackerState): CapabilityResult[] {
  return CAPABILITIES.map((capability) => evaluate(state, capability));
}

/** Level 9's entrance stays shut until every Triforce piece is in hand. */
export function canEnterLevel9(state: TrackerState): boolean {
  return triforceCount(state) >= TRIFORCE_REQUIRED_FOR_L9;
}

