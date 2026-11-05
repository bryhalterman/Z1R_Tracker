/**
 * Whether the page draws the Overworld and Levels side by side or stacked.
 *
 * Chosen in the toolbar and applied by the tracker, which are mounted
 * separately, so the choice lives here where both can reach it. View state,
 * like the folded panels: it belongs to this browser rather than to a run, so
 * it is kept in storage of its own rather than in the store, and never travels
 * with an exported save.
 *
 * `auto` is the width rule the page has always used: side by side when the
 * panels' column is in the `md` band, stacked below it.
 */

import { safeStorage } from '@z1r/core';

export type MapsLayout = 'auto' | 'side' | 'stacked';

const KEY = 'z1r-tracker:maps-layout';

function read(): MapsLayout {
  const saved = safeStorage()?.getItem(KEY);
  return saved === 'side' || saved === 'stacked' ? saved : 'auto';
}

let current: MapsLayout = read();
const listeners = new Set<() => void>();

export const mapsLayout = {
  get: (): MapsLayout => current,
  set(next: MapsLayout): void {
    if (next === current) return;
    current = next;
    safeStorage()?.setItem(KEY, next);
    for (const listener of listeners) listener();
  },
  /** Returns the unsubscribe, the shape `useSyncExternalStore` expects. */
  watch(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
