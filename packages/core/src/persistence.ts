/**
 * Persistence and cross-window sync.
 *
 * Two windows matter in practice: the OBS *custom dock* (where you click) and
 * the OBS *browser source* (what viewers see). They are separate browser
 * contexts sharing an origin, so a BroadcastChannel carries live edits and
 * localStorage carries the value across restarts. The `storage` event is kept
 * as a fallback for contexts where BroadcastChannel is unavailable.
 */

import {
  createInitialState,
  STATE_VERSION,
  type DungeonState,
  type Store,
  type TrackerState,
} from './state.js';

export const STORAGE_KEY = 'z1r-tracker:state';
export const CHANNEL_NAME = 'z1r-tracker';

/**
 * Keeps only the keys `template` defines, so a save can gain fields the model
 * has added and lose ones it has dropped.
 */
function conform<T extends object>(template: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return { ...template };
  const source = saved as Record<string, unknown>;
  const result = { ...template } as Record<string, unknown>;
  for (const key of Object.keys(template)) {
    if (key in source && typeof source[key] === typeof result[key]) result[key] = source[key];
  }
  return result as T;
}

function pruneItems(
  base: Record<string, number>,
  saved: Record<string, number> | undefined,
): Record<string, number> {
  return conform(base, saved);
}

function pruneDungeons(
  base: Record<string, DungeonState>,
  saved: Record<string, DungeonState> | undefined,
): Record<string, DungeonState> {
  const result: Record<string, DungeonState> = {};
  for (const [level, empty] of Object.entries(base)) {
    result[level] = conform(empty, saved?.[level]);
  }
  return result;
}

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
    // Prune, don't just merge. A plain spread would carry keys for items and
    // dungeon flags that have since been removed from the model — they'd
    // survive every future load and get written back into exported saves.
    items: pruneItems(base.items, candidate.items),
    dungeons: pruneDungeons(base.dungeons, candidate.dungeons),
    marks: { ...(candidate.marks ?? {}) },
    // v1 saves predate seed tracking; merging over the defaults fills in any
    // setting added since without discarding what the save does carry.
    seed: { ...base.seed, ...(candidate.seed ?? {}) },
    locations: { ...(candidate.locations ?? {}) },
    extraFloorSlots: { ...(candidate.extraFloorSlots ?? {}) },
    hints: Array.isArray(candidate.hints) ? candidate.hints : [],
    // Restart ids above anything the save already used, or a new hint would
    // collide with an existing one and edits would hit the wrong row.
    hintSeq: Math.max(
      candidate.hintSeq ?? 0,
      ...(Array.isArray(candidate.hints)
        ? candidate.hints.map((h) => Number(String(h?.id ?? '').replace(/^h/, '')) || 0)
        : [0]),
    ),
    focusRegion: typeof candidate.focusRegion === 'string' ? candidate.focusRegion : '',
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
