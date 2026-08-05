/**
 * Tracker state and the reducer over it.
 *
 * State is a plain serialisable object on purpose: the same value is written
 * to localStorage, posted across a BroadcastChannel to sync the OBS dock with
 * the OBS browser source, and exported to a JSON file. Nothing in here may
 * hold a DOM node, a class instance, or a function.
 */

import { ITEMS, ITEMS_BY_ID, maxValue } from './items.js';
import { DUNGEONS } from './dungeons.js';
import { cycleMark, type MarkKind } from './overworld.js';
import { POOL_BY_ID, createSeedSettings, questsMustDiffer, type SeedSettings } from './seed.js';

export const STATE_VERSION = 5;

/** Upper bound on manual extra floor slots. Shared with `migrate` on purpose. */
export const MAX_EXTRA_FLOOR_SLOTS = 8;

export interface LocationState {
  /** Pool entry id known to be here. Empty until identified. */
  item: string;
  /** Whether it's actually been picked up, as opposed to merely known. */
  collected: boolean;
}

/**
 * One hint heard in game.
 *
 * A Z1R hint pairs a subject with an overworld region — "Digdogger gazes… By a
 * Lake". Both halves are optional here because you often note one before the
 * other, and a half-recorded hint still narrows the map.
 */
export interface HintEntry {
  readonly id: string;
  /** `d1`-`d9` for a level, or a shuffle-pool entry id for an item hint. */
  subject: string;
  /** Region id from `regions.ts`. */
  region: string;
  /** Screen where the hint was given, if worth remembering. */
  screen: string;
  note: string;
}

/**
 * Where a dungeon was found is recorded on the overworld map with its Dungeon
 * mark, so all that is left per level is whether its Triforce piece is in hand.
 */
export interface DungeonState {
  triforce: boolean;
}

export interface TrackerState {
  readonly version: number;
  /**
   * Monotonic edit counter, bumped on every change.
   *
   * This is what cross-window sync orders updates by — *not* `updatedAt`.
   * `Date.now()` has millisecond resolution, so two edits in the same tick
   * carry the same timestamp and a `newer-than` comparison silently drops the
   * second one. A counter can't tie.
   */
  rev: number;
  /** item id -> stage/count. Absent keys read as 0. */
  items: Record<string, number>;
  /** level number (as string) -> dungeon progress. */
  dungeons: Record<string, DungeonState>;
  /** overworld screen id -> mark. */
  marks: Record<string, MarkKind>;
  /** Seed number, flag string, and the settings that reshape the tracker. */
  seed: SeedSettings;
  /**
   * Location id -> what's there. Sparse: absent means untouched.
   *
   * Keyed by id rather than by position so changing the Dungeon Quest reshapes
   * the location list without discarding what was already recorded — switch
   * back and the entries are still there.
   */
  locations: Record<string, LocationState>;
  /** Level -> extra floor slots added under Shuffle Minor Dungeon Drops. */
  extraFloorSlots: Record<string, number>;
  /** Hints heard, in the order they were recorded. */
  hints: HintEntry[];
  /** Monotonic source of hint ids — the reducer must stay deterministic. */
  hintSeq: number;
  /** Region highlighted on the overworld grid, or '' for none. */
  focusRegion: string;
  startedAt: number;
  /** Wall clock, for display only. Never compare two of these to order edits. */
  updatedAt: number;
}

export type Action =
  | { type: 'cycleItem'; id: string; direction: 1 | -1 }
  | { type: 'setItem'; id: string; value: number }
  | { type: 'setDungeon'; level: number; patch: Partial<DungeonState> }
  | { type: 'cycleMark'; screen: string; direction: 1 | -1 }
  | { type: 'setMark'; screen: string; mark: MarkKind }
  | { type: 'setSeed'; patch: Partial<SeedSettings> }
  /** Record which pool entry sits at a location. Does not touch inventory. */
  | { type: 'setLocation'; id: string; item: string }
  /** Mark a location picked up. Collecting also grants the item; unchecking never revokes it. */
  | { type: 'collectLocation'; id: string; collected: boolean }
  | { type: 'addFloorSlot'; level: number; delta: 1 | -1 }
  | { type: 'addHint' }
  | { type: 'updateHint'; id: string; patch: Partial<Omit<HintEntry, 'id'>> }
  | { type: 'removeHint'; id: string }
  /** Toggling the same region off is how you clear the map highlight. */
  | { type: 'focusRegion'; region: string }
  /** An update received from another window. Adopts the sender's `rev` verbatim. */
  | { type: 'replace'; state: TrackerState }
  /** A save file loaded by the user here. Outranks whatever peers currently hold. */
  | { type: 'import'; state: TrackerState }
  | { type: 'reset' };

function emptyDungeon(): DungeonState {
  return {
    triforce: false,
  };
}

export function createInitialState(now = Date.now()): TrackerState {
  const items: Record<string, number> = {};
  for (const def of ITEMS) {
    items[def.id] = 0;
  }
  const dungeons: Record<string, DungeonState> = {};
  for (const def of DUNGEONS) {
    dungeons[String(def.level)] = emptyDungeon();
  }
  return {
    version: STATE_VERSION,
    rev: 0,
    items,
    dungeons,
    marks: {},
    seed: createSeedSettings(),
    locations: {},
    extraFloorSlots: {},
    hints: [],
    hintSeq: 0,
    focusRegion: '',
    startedAt: now,
    updatedAt: now,
  };
}

function clampItem(id: string, value: number): number {
  const def = ITEMS_BY_ID.get(id);
  if (!def) return 0;
  return Math.min(Math.max(value, 0), maxValue(def));
}

export function reduce(state: TrackerState, action: Action, now = Date.now()): TrackerState {
  /** Applies a change and advances the sync counter. Every local edit goes through here. */
  const bump = (patch: Partial<TrackerState>): TrackerState => ({
    ...state,
    ...patch,
    rev: state.rev + 1,
    updatedAt: now,
  });

  switch (action.type) {
    case 'cycleItem': {
      const def = ITEMS_BY_ID.get(action.id);
      if (!def) return state;
      const current = state.items[action.id] ?? 0;
      const limit = maxValue(def);
      // Both kinds wrap back round to 0, so a click past the top clears.
      const next = (current + action.direction + (limit + 1)) % (limit + 1);
      if (next === current) return state;
      return bump({ items: { ...state.items, [action.id]: next } });
    }

    case 'setItem': {
      const value = clampItem(action.id, action.value);
      if ((state.items[action.id] ?? 0) === value) return state;
      return bump({ items: { ...state.items, [action.id]: value } });
    }

    case 'setDungeon': {
      const key = String(action.level);
      const current = state.dungeons[key] ?? emptyDungeon();
      const next = { ...current, ...action.patch };
      return bump({ dungeons: { ...state.dungeons, [key]: next } });
    }

    case 'cycleMark': {
      const current = state.marks[action.screen] ?? 'none';
      const next = cycleMark(current, action.direction);
      const marks = { ...state.marks };
      // Don't persist 'none' — an unmarked screen is the absence of a key.
      if (next === 'none') delete marks[action.screen];
      else marks[action.screen] = next;
      return bump({ marks });
    }

    case 'setMark': {
      const marks = { ...state.marks };
      if (action.mark === 'none') delete marks[action.screen];
      else marks[action.screen] = action.mark;
      return bump({ marks });
    }

    case 'setSeed': {
      const seed = { ...state.seed, ...action.patch };
      // Mixed Quest guarantees 1-6 and 7-9 come from different quests, so
      // setting one half implies the other rather than allowing an impossible
      // "both 1st Quest" that would show the wrong item slots.
      if (questsMustDiffer(seed.dungeonQuest)) {
        if (action.patch.questLow && !action.patch.questHigh) {
          seed.questHigh = seed.questLow === '1st' ? '2nd' : '1st';
        } else if (action.patch.questHigh && !action.patch.questLow) {
          seed.questLow = seed.questHigh === '1st' ? '2nd' : '1st';
        } else if (seed.questLow === seed.questHigh) {
          seed.questHigh = seed.questLow === '1st' ? '2nd' : '1st';
        }
      }
      return bump({ seed });
    }

    case 'setLocation': {
      const current = state.locations[action.id] ?? { item: '', collected: false };
      if (current.item === action.item) return state;
      return bump({
        locations: { ...state.locations, [action.id]: { ...current, item: action.item } },
      });
    }

    case 'collectLocation': {
      const current = state.locations[action.id] ?? { item: '', collected: false };
      const locations = {
        ...state.locations,
        [action.id]: { ...current, collected: action.collected },
      };

      const entry = POOL_BY_ID.get(current.item);
      if (!action.collected || !entry) return bump({ locations });

      // A pool entry with no `itemId` — a Heart Container — records where it
      // was without touching inventory, since hearts aren't tracked there.
      const def = ITEMS_BY_ID.get(entry.itemId);
      if (!def) return bump({ locations });

      const held = state.items[entry.itemId] ?? 0;
      const raised = Math.max(held, Math.min(entry.value, maxValue(def)));
      return bump({ locations, items: { ...state.items, [entry.itemId]: raised } });
    }

    case 'addFloorSlot': {
      const key = String(action.level);
      const next = Math.min(
        Math.max((state.extraFloorSlots[key] ?? 0) + action.delta, 0),
        MAX_EXTRA_FLOOR_SLOTS,
      );
      if (next === (state.extraFloorSlots[key] ?? 0)) return state;
      return bump({ extraFloorSlots: { ...state.extraFloorSlots, [key]: next } });
    }

    case 'addHint': {
      const seq = state.hintSeq + 1;
      const hint: HintEntry = { id: `h${seq}`, subject: '', region: '', screen: '', note: '' };
      return bump({ hints: [...state.hints, hint], hintSeq: seq });
    }

    case 'updateHint': {
      const hints = state.hints.map((hint) =>
        hint.id === action.id ? { ...hint, ...action.patch } : hint,
      );
      return bump({ hints });
    }

    case 'removeHint': {
      const hints = state.hints.filter((hint) => hint.id !== action.id);
      if (hints.length === state.hints.length) return state;
      // Don't leave the map highlighting a region no hint mentions any more.
      const stillReferenced = hints.some((hint) => hint.region === state.focusRegion);
      return bump({ hints, focusRegion: stillReferenced ? state.focusRegion : '' });
    }

    case 'focusRegion': {
      const next = state.focusRegion === action.region ? '' : action.region;
      if (next === state.focusRegion) return state;
      return bump({ focusRegion: next });
    }

    case 'replace':
      // A peer's state is adopted whole, `rev` included, so both windows land
      // on the same counter and neither treats the other as stale afterwards.
      return { ...action.state, updatedAt: now };

    case 'import':
      // A file the user just opened here wins over whatever peers hold, so its
      // `rev` is lifted above both sides rather than adopted as-is.
      return {
        ...action.state,
        rev: Math.max(state.rev, action.state.rev ?? 0) + 1,
        updatedAt: now,
      };

    case 'reset':
      return { ...createInitialState(now), rev: state.rev + 1 };
  }
}

export type Listener = (state: TrackerState, action: Action | null) => void;

export interface Store {
  getState(): TrackerState;
  dispatch(action: Action): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: TrackerState = createInitialState()): Store {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) {
        // Same reasoning as the render patch loop: one bad subscriber must not
        // stop persistence or the cross-window broadcast from running.
        try {
          listener(state, action);
        } catch (error) {
          console.error('Store listener failed', error);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Triforce pieces currently held. */
export function triforceCount(state: TrackerState): number {
  return Object.values(state.dungeons).filter((d) => d.triforce).length;
}

