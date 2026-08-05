/**
 * The render-patch contract.
 *
 * Every panel registers closures that take the new state and update only the
 * nodes they own. Two rules make that safe, and both were learned from getting
 * them wrong:
 *
 *  1. **Isolate each patch, not each panel.** A single registered patch often
 *     fans out over many elements — all eighteen item cells shared one — so a
 *     throw in the third cell silently dropped the remaining fifteen.
 *  2. **Advance a memo only after the write it guards succeeds.** Assigning
 *     `rendered = next` before the DOM call means a throw leaves the cache
 *     claiming work that never happened, and the element stays stale for the
 *     rest of the session because every later pass short-circuits.
 */

import type { TrackerState } from '@z1r/core';

export type Patch = (state: TrackerState) => void;

/**
 * Runs every patch, isolating failures so one broken element cannot strand the
 * rest against a state the store has already committed.
 */
export function runPatches(patches: readonly Patch[], state: TrackerState): void {
  for (const patch of patches) {
    try {
      patch(state);
    } catch (error) {
      console.error('Tracker patch failed', error);
    }
  }
}

/**
 * Memoised DOM update: runs `write` only when `next` differs from the last
 * value, and commits the memo only if `write` returned without throwing.
 *
 * Returns the value to remember.
 */
export function memoise<T>(previous: T | null, next: T, write: () => void): T | null {
  if (previous === next) return previous;
  write();
  return next;
}
