/**
 * Persistence and cross-window sync.
 *
 * Two windows matter in practice: the OBS *custom dock* (where you click) and
 * the OBS *browser source* (what viewers see). They are separate browser
 * contexts sharing an origin, so a BroadcastChannel carries live edits and
 * localStorage carries the value across restarts. The `storage` event is kept
 * as a fallback for contexts where BroadcastChannel is unavailable.
 */

import { createInitialState, STATE_VERSION, type Store, type TrackerState } from './state.js';

export const STORAGE_KEY = 'z1r-tracker:state';
export const CHANNEL_NAME = 'z1r-tracker';

/** Accepts anything shaped like a tracker state; repairs older versions. */
export function migrate(raw: unknown): TrackerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<TrackerState>;
  if (typeof candidate.version !== 'number') return null;
  if (candidate.version > STATE_VERSION) return null;

  const base = createInitialState(candidate.game === 'z1' ? 'z1' : 'z1r');
  return {
    ...base,
    ...candidate,
    version: STATE_VERSION,
    // Saves written before `rev` existed have none; start them at 0.
    rev: typeof candidate.rev === 'number' ? candidate.rev : 0,
    items: { ...base.items, ...(candidate.items ?? {}) },
    dungeons: { ...base.dungeons, ...(candidate.dungeons ?? {}) },
    marks: { ...(candidate.marks ?? {}) },
    // v1 saves predate seed tracking; merging over the defaults fills in any
    // setting added since without discarding what the save does carry.
    seed: { ...base.seed, ...(candidate.seed ?? {}) },
    locations: { ...(candidate.locations ?? {}) },
    extraFloorSlots: { ...(candidate.extraFloorSlots ?? {}) },
  };
}

export function load(storage: Storage = localStorage): TrackerState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function save(state: TrackerState, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode or quota failures must never take the tracker down.
  }
}

export interface SyncOptions {
  /** Set false in a read-only display (browser source) to never write back. */
  readonly write?: boolean;
  readonly storage?: Storage;
}

/**
 * Wires a store to localStorage plus a BroadcastChannel. Returns a teardown
 * function. Safe to call in any browser context; no-ops outside one.
 */
export function attachPersistence(store: Store, options: SyncOptions = {}): () => void {
  const { write = true, storage = globalThis.localStorage } = options;
  if (!storage) return () => {};

  // A remote update must not be re-broadcast, or two windows ping-pong forever.
  let applyingRemote = false;

  const channel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;

  const applyRemote = (state: TrackerState | null) => {
    if (!state) return;
    // Ordered by `rev`, never by `updatedAt` — see the note on TrackerState.rev.
    if (state.rev <= store.getState().rev) return;
    applyingRemote = true;
    try {
      store.dispatch({ type: 'replace', state });
    } finally {
      applyingRemote = false;
    }
  };

  const unsubscribe = store.subscribe((state) => {
    if (applyingRemote) return;
    if (write) save(state, storage);
    channel?.postMessage(state);
  });

  if (channel) {
    channel.onmessage = (event) => applyRemote(migrate(event.data));
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      applyRemote(migrate(JSON.parse(event.newValue)));
    } catch {
      // Ignore a partially written value; the next write will be complete.
    }
  };
  globalThis.addEventListener?.('storage', onStorage);

  return () => {
    unsubscribe();
    channel?.close();
    globalThis.removeEventListener?.('storage', onStorage);
  };
}

/** Pretty-printed JSON for the Export button. */
export function exportState(state: TrackerState): string {
  return JSON.stringify(state, null, 2);
}

/** Throws with a readable message so the UI can surface it verbatim. */
export function importState(json: string): TrackerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const state = migrate(parsed);
  if (!state) throw new Error('That file is not a Z1R_Tracker save.');
  return state;
}
