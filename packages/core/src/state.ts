/**
 * Tracker state and the reducer over it.
 *
 * State is a plain serialisable object on purpose: the same value is written
 * to localStorage, posted across a BroadcastChannel to sync the OBS dock with
 * the OBS browser source, and exported to a JSON file. Nothing in here may
 * hold a DOM node, a class instance, or a function.
 */

import { ITEMS, ITEMS_BY_ID, maxValue } from './items.js';
import { DUNGEONS, holdsTriforcePiece } from './dungeons.js';
import { cycleMark, type MarkKind } from './overworld.js';
import { POOL_BY_ID, createSeedSettings, questsMustDiffer, type SeedSettings } from './seed.js';

export const STATE_VERSION = 7;

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

/**
 * Detail hanging off a marked screen.
 *
 * Kept beside `marks` rather than folded into it because the mark is the shape
 * on the map and this is what is written on it — a screen can be marked before
 * any of it is known, and clearing the mark clears this with it.
 *
 * Every field is meaningful only for one mark kind, and all three are cheap, so
 * they share one record rather than a union that persistence would have to
 * discriminate on load.
 */
export interface ScreenNote {
  /** Level 1-9 once known, 0 while the dungeon is found but unidentified. */
  dungeon: number;
  /** `ShopStockDef` ids seen for sale here. */
  shop: string[];
  /**
   * Which named overworld spot this is — `ow.whiteSword`, `ow.armos`,
   * `ow.coast`. Empty when the screen holds an item that is not one of them.
   */
  spot: string;
  /** Shuffle-pool entry id sitting on this screen. */
  item: string;
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
  /** overworld screen id -> detail for that mark. Sparse: absent means bare. */
  screenNotes: Record<string, ScreenNote>;
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
  /** Write detail onto a marked screen: which dungeon, what stock, which item. */
  | { type: 'setScreenNote'; screen: string; patch: Partial<ScreenNote> }
  /** Add or remove one stock entry without resending the whole list. */
  | { type: 'toggleShopStock'; screen: string; stock: string }
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

function emptyNote(): ScreenNote {
  return { dungeon: 0, shop: [], spot: '', item: '' };
}

/** True once a note carries nothing worth keeping. */
function noteIsBare(note: ScreenNote): boolean {
  return note.dungeon === 0 && note.shop.length === 0 && note.spot === '' && note.item === '';
}

/**
 * Store a note, or drop the key when it has emptied out.
 *
 * Same rule as `marks`: absence is the empty state, so a save never accumulates
 * `{dungeon: 0, shop: [], item: ''}` for every screen the player ever touched
 * and then changed their mind about.
 */
function pruneNote(
  notes: Record<string, ScreenNote>,
  screen: string,
  note: ScreenNote,
): Record<string, ScreenNote> {
  const next = { ...notes };
  if (noteIsBare(note)) delete next[screen];
  else next[screen] = note;
  return next;
}

/**
 * Set a screen's mark, discarding its detail when the mark is cleared.
 *
 * Unmarking a screen has to take the note with it. Leaving it behind means
 * re-marking a screen later silently restores a dungeon number or a shop stock
 * list from a previous guess, which reads as the tracker inventing data.
 */
function writeMark(state: TrackerState, screen: string, mark: MarkKind): Partial<TrackerState> {
  const marks = { ...state.marks };
  // Don't persist 'none' — an unmarked screen is the absence of a key.
  if (mark === 'none') delete marks[screen];
  else marks[screen] = mark;

  if (mark !== 'none') return { marks };
  if (!(screen in state.screenNotes)) return { marks };
  const screenNotes = { ...state.screenNotes };
  delete screenNotes[screen];
  return { marks, screenNotes };
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
    screenNotes: {},
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
      return bump(writeMark(state, action.screen, next));
    }

    case 'setMark':
      return bump(writeMark(state, action.screen, action.mark));

    case 'setScreenNote': {
      const next = { ...emptyNote(), ...state.screenNotes[action.screen], ...action.patch };
      if (typeof next.dungeon === 'number') {
        // 0 means "found but not yet identified", which is a real state.
        next.dungeon = Number.isInteger(next.dungeon) ? Math.min(Math.max(next.dungeon, 0), 9) : 0;
      }
      return bump({ screenNotes: pruneNote(state.screenNotes, action.screen, next) });
    }

    case 'toggleShopStock': {
      const current = state.screenNotes[action.screen] ?? emptyNote();
      const held = current.shop.includes(action.stock);
      const next: ScreenNote = {
        ...current,
        shop: held
          ? current.shop.filter((id) => id !== action.stock)
          : // Sorted so two screens with the same stock serialise identically,
            // and the icons never reorder as you tick them.
            [...current.shop, action.stock].sort(),
      };
      return bump({ screenNotes: pruneNote(state.screenNotes, action.screen, next) });
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
  // Keyed by level, and that includes Level 9 — which holds Ganon, not a piece.
  // Counting the whole map let a save with 9 flagged reach eight on seven.
  return Object.entries(state.dungeons).filter(
    ([level, dungeon]) => dungeon.triforce && holdsTriforcePiece(Number(level)),
  ).length;
}

