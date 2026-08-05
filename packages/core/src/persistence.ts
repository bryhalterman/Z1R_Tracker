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
  MAX_EXTRA_FLOOR_SLOTS,
  STATE_VERSION,
  type DungeonState,
  type HintEntry,
  type Store,
  type TrackerState,
} from './state.js';

import type { SeedSettings } from './seed.js';

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

const QUESTS = new Set([
  '1st', '2nd', 'mixed', 'shapes', 'mixed-shapes', 'random-no-shapes', 'random',
]);
const SHUFFLES = new Set([
  'none', 'dungeon', 'anywhere-hearts-in-dungeons', 'items-hearts', 'random',
]);

/** Highest id in use, so a new hint can never reuse one. */
function hintSeqFrom(saved: unknown, hints: HintEntry[]): number {
  const base = Number.isFinite(saved) ? Math.max(Math.trunc(saved as number), 0) : 0;
  const used = hints.map((h) => Number(String(h.id).replace(/^h/, '')) || 0);
  return Math.max(base, ...used, 0);
}

/** Drops anything that isn't a well-formed hint object. */
function conformHints(saved: unknown): HintEntry[] {
  if (!Array.isArray(saved)) return [];
  const blank: HintEntry = { id: '', subject: '', region: '', screen: '', note: '' };
  return saved
    .filter((h): h is object => !!h && typeof h === 'object')
    .map((h) => conform(blank, h))
    .filter((h) => typeof h.id === 'string' && h.id !== '');
}

/** Enum-valued settings have to be checked, not merged — see `questForLevel`. */
function conformSeed(base: SeedSettings, saved: unknown): SeedSettings {
  const seed = conform(base, saved);
  if (!QUESTS.has(seed.dungeonQuest)) seed.dungeonQuest = base.dungeonQuest;
  if (!SHUFFLES.has(seed.itemShuffle)) seed.itemShuffle = base.itemShuffle;
  if (seed.questLow !== '1st' && seed.questLow !== '2nd') seed.questLow = base.questLow;
  if (seed.questHigh !== '1st' && seed.questHigh !== '2nd') seed.questHigh = base.questHigh;
  return seed;
}

/** Clamped to the same bound the reducer enforces, so the two can't drift. */
function conformExtraSlots(saved: unknown): Record<string, number> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [level, value] of Object.entries(saved as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[level] = Math.min(Math.max(Math.trunc(value), 0), MAX_EXTRA_FLOOR_SLOTS);
  }
  return out;
}

/**
 * Accepts anything shaped like a tracker state; repairs older versions.
 *
 * Validation is structural, not just a version check. `{"version":1}` used to
 * be accepted as a save — so importing any JSON file with a numeric `version`
 * silently wiped the run and reported "Save loaded." Everything below is
 * conformed to the current model rather than spread in, which also stops
 * unknown top-level keys living forever in exports and broadcasts.
 */
export function migrate(raw: unknown): TrackerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<TrackerState>;
  if (typeof candidate.version !== 'number') return null;
  if (candidate.version > STATE_VERSION) return null;
  // Require evidence this is actually a tracker save, not merely versioned JSON.
  if (!candidate.items || typeof candidate.items !== 'object') return null;
  if (!candidate.dungeons || typeof candidate.dungeons !== 'object') return null;

  const base = createInitialState();
  return {
    ...base,
    version: STATE_VERSION,
    // Saves written before `rev` existed have none; start them at 0.
    //
    // Finite and integral, not merely "a number". JSON has no Infinity literal
    // but 1e400 overflows to one, and applyRemote gates on `rev <= current` —
    // so once both windows reach Infinity every later edit is silently dropped
    // by the OBS browser source, with no visible cause.
    rev: Number.isFinite(candidate.rev) ? Math.max(Math.trunc(candidate.rev as number), 0) : 0,
    // Prune, don't just merge. A plain spread would carry keys for items and
    // dungeon flags that have since been removed from the model — they'd
    // survive every future load and get written back into exported saves.
    items: pruneItems(base.items, candidate.items),
    dungeons: pruneDungeons(base.dungeons, candidate.dungeons),
    marks: { ...(candidate.marks ?? {}) },
    // v1 saves predate seed tracking; merging over the defaults fills in any
    // setting added since without discarding what the save does carry.
    seed: conformSeed(base.seed, candidate.seed),
    locations: { ...(candidate.locations ?? {}) },
    extraFloorSlots: conformExtraSlots(candidate.extraFloorSlots),
    // A null in this array threw on every render; the panel indexes into it.
    hints: conformHints(candidate.hints),
    // Restart ids above anything the save already used, or a new hint would
    // collide with an existing one and edits would hit the wrong row.
    //
    // Derived from the *conformed* hints and a coerced counter. A string
    // hintSeq used to make this NaN, giving every new hint the id "hNaN" —
    // after which editing one note edited all of them and removing one row
    // removed the lot.
    hintSeq: hintSeqFrom(candidate.hintSeq, conformHints(candidate.hints)),
    focusRegion: typeof candidate.focusRegion === 'string' ? candidate.focusRegion : '',
  };
}

/**
 * `localStorage` throws on *access* when site data is blocked or the document
 * is a sandboxed iframe. Reading it in a default parameter put that throw
 * outside every try/catch below, so a blocked-cookies browser crashed in the
 * first statement of each app's `main()`.
 */
export function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(storage: Storage | null = safeStorage()): TrackerState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function save(state: TrackerState, storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode or quota failures must never take the tracker down.
  }
}

export interface SyncOptions {
  /** Set false in a read-only display (browser source) to never write back. */
  readonly write?: boolean;
  readonly storage?: Storage | null;
}

/**
 * Wires a store to localStorage plus a BroadcastChannel. Returns a teardown
 * function. Safe to call in any browser context; no-ops outside one.
 */
export function attachPersistence(store: Store, options: SyncOptions = {}): () => void {
  const { write = true, storage = safeStorage() } = options;
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
