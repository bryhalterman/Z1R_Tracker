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
import {
  conformSpot,
  cycleMark,
  isScreenId,
  OVERWORLD_STAIRWAY_COUNT,
  SECRET_SIZES_BY_ID,
  type MarkKind,
  type SecretSize,
} from './overworld.js';
import { SCREEN_ITEMS_BY_ID, createSeedSettings, questsMustDiffer, type SeedSettings } from './seed.js';
import {
  emptyRoom,
  isDoorState,
  isRoomBoss,
  isRoomFrom,
  isRoomItem,
  isRoomPushBlock,
  isRoomId,
  isRoomLevel,
  isRoomSide,
  isRoomStairKind,
  isRoomTransport,
  roomIsBare,
  ROOM_TRANSPORT_PAIR_SIZE,
  type DoorState,
  type RoomFrom,
  type RoomNote,
  type RoomNotePatch,
  type RoomSide,
} from './rooms.js';
import { isRoomLayout } from './layouts.js';
import { emptyNote, fitNoteToMark, noteIsBare, sameNote } from './notes.js';
import { clampWhole, truncClamp, truncWhole } from './util.js';

export const STATE_VERSION = 13;

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
  /**
   * Which of the four warp staircases this is, 1-4. 0 means unnumbered.
   *
   * The four are interchangeable to look at, so the number is the only thing
   * that says which one you are standing on and where it comes out.
   */
  stairway: number;
  /** `ShopStockDef` ids seen for sale here. */
  shop: string[];
  /**
   * Stock id -> rupee price, for the ones you bothered to write down.
   *
   * Sparse and always optional: an absent key means "no price recorded", which
   * is the normal case. Recording one is for the decision you actually make
   * from the map — whether the 100-rupee ring is worth the walk right now.
   */
  shopPrices: Record<string, number>;
  /** `DungeonBlockDef` ids: what turned you back last time you went in. */
  blocks: string[];
  /**
   * Which named overworld spot this is — `ow.whiteSword`, `ow.armos`,
   * `ow.coast`. Empty when the screen holds an item that is not one of them.
   */
  spot: string;
  /** Shuffle-pool entry id sitting on this screen. */
  item: string;
  /**
   * Whether `item` has been picked up. Same rule as a room's flag: it is about
   * the current item only, so changing or clearing the item drops it.
   */
  collected: boolean;
  /** How big a rupee secret is. '' while unknown, and on every other mark. */
  secret: SecretSize;
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
  /**
   * level number (as string) -> room id -> what is known about that room.
   *
   * Keyed by level the same way `dungeons` is, so one level's map can be read,
   * cleared or broadcast without touching the other eight. Sparse at both
   * levels: an absent level is a level nothing has been recorded for, and an
   * absent room inside one is a bare room.
   */
  rooms: Record<string, Record<string, RoomNote>>;
  /** Seed number, flag string, and the settings that reshape the tracker. */
  seed: SeedSettings;
  /**
   * Location id -> what's there. Sparse: absent means untouched.
   *
   * No longer what the item locations show. Those are derived from rooms and
   * screens by `deriveItemLocations`, which reads this only for a slot the
   * maps leave empty — the slots an older save recorded here directly.
   *
   * Keyed by id rather than by position so changing the Dungeon Quest reshapes
   * the location list without discarding what was already recorded — switch
   * back and the entries are still there.
   */
  locations: Record<string, LocationState>;
  /** Hints heard, in the order they were recorded. */
  hints: HintEntry[];
  /** Monotonic source of hint ids — the reducer must stay deterministic. */
  hintSeq: number;
  /** Region highlighted on the overworld grid, or '' for none. */
  focusRegion: string;
  /**
   * The screen the run started on, or '' for not recorded. One per map, so it
   * is a field rather than a mark: the start screen usually has a cave of its
   * own, and the pennant sits on top of whatever that screen is marked as.
   */
  startScreen: string;
  /** level number (as string) -> the room that level is entered by. */
  levelStarts: Record<string, string>;
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
  /**
   * Set a screen's mark and write its note in one edit — placing an item on a
   * screen, or stamping a rupee secret with its size. Two dispatches would
   * save and broadcast the half-done state between them.
   */
  | { type: 'markScreen'; screen: string; mark: MarkKind; patch: Partial<ScreenNote> }
  /** Add or remove one stock entry without resending the whole list. */
  | { type: 'toggleShopStock'; screen: string; stock: string }
  /** Price of one stock entry. 0 clears it — a price is never required. */
  | { type: 'setShopPrice'; screen: string; stock: string; price: number }
  /** Same, for what is blocking progress inside a dungeon. */
  | { type: 'toggleDungeonBlock'; screen: string; block: string }
  /**
   * Put Level N on a screen. There is only one of each, so this moves it if it
   * was already somewhere, rather than leaving two.
   */
  | { type: 'placeDungeon'; screen: string; level: number }
  /**
   * Put stairway N on a screen. Same rule as a level: there is one of each, so
   * this moves it rather than leaving two screens claiming the same number.
   */
  | { type: 'placeStairway'; screen: string; number: number }
  /** Wipe every overworld mark, leaving items and Triforce alone. */
  | { type: 'clearMap' }
  /**
   * Put the start pennant on a screen. There is one, so this moves it; the
   * screen that already has it takes it off, and so does ''.
   */
  | { type: 'setStartScreen'; screen: string }
  /** The same for one level's entrance room. */
  | { type: 'setLevelStart'; level: number; room: string }
  /**
   * Mark a screen's item picked up. Same grant and same refusal as
   * `collectRoom`: there has to be an item on the screen to collect.
   */
  | { type: 'collectScreen'; screen: string; collected: boolean }
  /** What one of a room's four doorways turned out to be. */
  | { type: 'setRoomDoor'; level: number; room: string; side: RoomSide; state: DoorState }
  /**
   * Record which item sits in a room. Does not touch inventory, and a changed
   * or cleared item drops the room's collected flag.
   */
  | { type: 'setRoomItem'; level: number; room: string; item: string }
  /**
   * Mark a room's item picked up. Collecting grants it the way
   * `collectLocation` does; unchecking never revokes. Refused on a room with
   * no item, since there is nothing to have collected.
   */
  | { type: 'collectRoom'; level: number; room: string; collected: boolean }
  /** How a room's item was found, which picks the location slot it fills. */
  | { type: 'setRoomFrom'; level: number; room: string; from: RoomFrom }
  /** Which boss is in a room. '' clears it. Ganon and Zelda only on Level 9. */
  | { type: 'setRoomBoss'; level: number; room: string; boss: string }
  /**
   * Put transport pair N on a room, and make it transport stairs.
   *
   * A number names one staircase, so two rooms hold it. A third claiming it
   * evicts whichever of the two has held it longest.
   */
  | { type: 'placeRoomTransport'; level: number; room: string; number: number }
  /** Unpair a room, leaving the staircase itself recorded. */
  | { type: 'clearRoomTransport'; level: number; room: string }
  /**
   * Write several room facts at once. Every field is validated as above, and
   * `collected: true` in a patch grants the item exactly as `collectRoom` does.
   */
  | { type: 'setRoomNote'; level: number; room: string; patch: RoomNotePatch }
  /** Wipe one level's room map, leaving the other levels alone. */
  | { type: 'clearRooms'; level: number }
  | { type: 'setSeed'; patch: Partial<SeedSettings> }
  /** Mark a location picked up. Collecting also grants the item; unchecking never revokes it. */
  | { type: 'collectLocation'; id: string; collected: boolean }
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

/**
 * Store a note, or drop the key when it has emptied out.
 *
 * Same rule as `marks`: absence is the empty state, so a save never accumulates
 * `{dungeon: 0, shop: [], item: ''}` for every screen the player ever touched
 * and then changed their mind about.
 *
 * Every note is stored through here, so this is also where it is fitted to the
 * screen's mark: a level or stairway number, or dungeon blockers, on a screen
 * not marked to carry them would be taken by `placeDungeon` or
 * `placeStairway` for the old marker and the screen deleted over it.
 *
 * Returns `notes` itself when the stored entry would not change, so a caller
 * can tell a no-op from a write.
 */
function pruneNote(
  notes: Record<string, ScreenNote>,
  marks: Record<string, MarkKind>,
  screen: string,
  note: ScreenNote,
): Record<string, ScreenNote> {
  const fitted = fitNoteToMark(note, marks[screen]);
  if (fitted === notes[screen]) return notes;
  const next = { ...notes };
  if (noteIsBare(fitted)) delete next[screen];
  else next[screen] = fitted;
  return next;
}

/**
 * Store one level's rooms, dropping bare rooms and then an emptied level.
 *
 * Same rule as a screen note, one layer deeper: absence is the empty state at
 * both levels, so a save never carries sixty-four all-unknown rooms for a level
 * the player clicked around in and then changed their mind about.
 */
function writeRooms(
  rooms: Record<string, Record<string, RoomNote>>,
  level: string,
  levelRooms: Record<string, RoomNote>,
): Record<string, Record<string, RoomNote>> {
  const kept: Record<string, RoomNote> = {};
  for (const [room, note] of Object.entries(levelRooms)) {
    if (!roomIsBare(note)) kept[room] = note;
  }
  const next = { ...rooms };
  if (Object.keys(kept).length === 0) delete next[level];
  else next[level] = kept;
  return next;
}

/** A room action's address: the level key, and the room as it stands. */
interface RoomTarget {
  level: string;
  current: RoomNote;
}

/** The level/room pair every room action is addressed by, or null if either is not real. */
function roomTarget(state: TrackerState, level: number, room: string): RoomTarget | null {
  if (!isRoomLevel(level) || !isRoomId(room)) return null;
  const key = String(level);
  return { level: key, current: state.rooms[key]?.[room] ?? emptyRoom() };
}

/**
 * Give one room a transport number, enforcing two rooms per number.
 *
 * The number names a single staircase, so a third room claiming it means one of
 * the first two was wrong. The oldest claim goes, because the two you placed
 * most recently are the two you are still thinking about — and because dropping
 * the newest would make the click that placed it do nothing.
 *
 * "Oldest" is `transportSeq`, stamped here as one past the highest stamp in the
 * level. That makes stamps unique within a level by construction; the room id
 * tie-break below only exists so a hand-edited save with duplicate stamps still
 * evicts deterministically rather than by object key order.
 */
function pairTransport(
  levelRooms: Record<string, RoomNote>,
  room: string,
  note: RoomNote,
  number: number,
): Record<string, RoomNote> {
  const next = { ...levelRooms };
  let stamp = 0;
  for (const held of Object.values(next)) stamp = Math.max(stamp, held.transportSeq);

  const holders = Object.entries(next)
    .filter(([id, held]) => id !== room && held.transport === number)
    .sort(([aId, a], [bId, b]) => a.transportSeq - b.transportSeq || aId.localeCompare(bId));

  // A pair plus the incoming room is one too many, so evict from the front
  // until there is room. A loop rather than a single shift: a save repaired
  // from a corrupt state could arrive holding more than two.
  while (holders.length >= ROOM_TRANSPORT_PAIR_SIZE) {
    const oldest = holders.shift();
    if (!oldest) break;
    // The staircase itself stays recorded — you did see stairs there. Only the
    // pairing was wrong, and an unnumbered transport staircase is a real state.
    next[oldest[0]] = { ...oldest[1], transport: 0, transportSeq: 0 };
  }

  next[room] = { ...note, stairs: 'transport', transport: number, transportSeq: stamp + 1 };
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

  const note = state.screenNotes[screen];
  if (!note) return { marks };
  if (mark === 'none') {
    const screenNotes = { ...state.screenNotes };
    delete screenNotes[screen];
    return { marks, screenNotes };
  }
  const screenNotes = pruneNote(state.screenNotes, marks, screen, note);
  // Nothing for the new mark to drop: the notes object stays as it was.
  return screenNotes === state.screenNotes ? { marks } : { marks, screenNotes };
}

/**
 * Apply a patch to one screen's note, for `setScreenNote` and `markScreen`.
 *
 * Null when the stored note and the inventory come out unchanged, so neither
 * action bumps `rev` — and so saves and broadcasts — for an edit that did
 * nothing.
 */
function editScreenNote(
  state: TrackerState,
  screen: string,
  patch: Partial<ScreenNote>,
): Partial<TrackerState> | null {
  const current = { ...emptyNote(), ...state.screenNotes[screen] };
  const next = { ...current, ...patch };
  if (typeof next.dungeon === 'number') {
    // 0 means "found but not yet identified", which is a real state.
    next.dungeon = clampWhole(next.dungeon, 9);
  }
  if (typeof next.stairway === 'number') {
    // 0 is "no number yet"; the UI places stairways through placeStairway,
    // which is what keeps the numbers unique.
    next.stairway = clampWhole(next.stairway, OVERWORLD_STAIRWAY_COUNT);
  }
  // An unknown size reads as unknown rather than refusing the whole patch.
  if (!SECRET_SIZES_BY_ID.has(next.secret)) next.secret = '';
  // The coast spot belongs to its screen: set there by the item, refused
  // anywhere else.
  next.spot = conformSpot(screen, next.spot, next.item, state.seed.mirroredOverworld);
  // Coerced rather than refused, like the two numbers above: anything but
  // a literal `true` is not collected.
  const requested = patch.collected === undefined ? undefined : patch.collected === true;
  const settled = settleCollected(current, next.item, requested);
  next.collected = settled.collected;
  const screenNotes = pruneNote(state.screenNotes, state.marks, screen, next);
  const items = settled.picked ? grantPoolEntry(state.items, next.item) : state.items;
  if (sameNote(screenNotes[screen], state.screenNotes[screen]) && items === state.items) return null;
  return items === state.items ? { screenNotes } : { screenNotes, items };
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
    rooms: {},
    seed: createSeedSettings(),
    locations: {},
    hints: [],
    hintSeq: 0,
    focusRegion: '',
    startScreen: '',
    levelStarts: {},
    startedAt: now,
    updatedAt: now,
  };
}

function clampItem(id: string, value: number): number {
  const def = ITEMS_BY_ID.get(id);
  if (!def) return 0;
  return Math.min(Math.max(value, 0), maxValue(def));
}

/**
 * The inventory after picking up one shuffle-pool entry.
 *
 * The single place a pickup turns into inventory, shared by every collect
 * gesture — a location slot, a room, a screen — so the three cannot drift.
 * Raises and never lowers: collecting the White Sword while the Magical
 * Sword is held changes nothing.
 *
 * A pool entry with no `itemId` — a Heart Container — and an id that is not a
 * pool entry at all, such as a Map, return the inventory untouched; hearts
 * aren't tracked there and the dungeon-only pickups have no inventory item.
 * Returns the same object when nothing rises, so callers can tell.
 */
function grantPoolEntry(items: Record<string, number>, poolId: string): Record<string, number> {
  const entry = SCREEN_ITEMS_BY_ID.get(poolId);
  if (!entry) return items;
  const def = ITEMS_BY_ID.get(entry.itemId);
  if (!def) return items;
  const held = items[entry.itemId] ?? 0;
  const raised = Math.max(held, Math.min(entry.value, maxValue(def)));
  if (raised === held) return items;
  return { ...items, [entry.itemId]: raised };
}

/**
 * The collected flag after an edit that may also have changed the item.
 *
 * A flag is about one item, so a changed or cleared item drops it unless the
 * same edit says otherwise, and an empty slot is never collected. `picked` is
 * true only when this edit is the one that collected it — granting on every
 * later edit would re-raise an inventory slot the player had since lowered by
 * hand, from a click that had nothing to do with it.
 */
function settleCollected(
  before: { item: string; collected: boolean },
  item: string,
  requested: boolean | undefined,
): { collected: boolean; picked: boolean } {
  const sameItem = before.item === item;
  const collected = item !== '' && (requested !== undefined ? requested : sameItem && before.collected);
  return { collected, picked: collected && !(sameItem && before.collected) };
}

/** Applies a change and advances the sync counter. Every local edit goes through here. */
type Bump = (patch: Partial<TrackerState>) => TrackerState;

/**
 * The reducer for one action type. `now` is only read by the actions that
 * replace the state outright; every other edit stamps it through `bump`.
 */
type Handler<K extends Action['type']> = (
  state: TrackerState,
  action: Extract<Action, { type: K }>,
  bump: Bump,
  now: number,
) => TrackerState;

/**
 * One handler per action type. A mapped type rather than a switch, so an action
 * added to `Action` without a handler is a compile error instead of a reducer
 * that falls off the end and hands the store `undefined`.
 */
type Handlers = { readonly [K in Action['type']]: Handler<K> };

const ITEM_HANDLERS: Pick<Handlers, 'cycleItem' | 'setItem' | 'setDungeon'> = {
  cycleItem(state, action, bump) {
    const def = ITEMS_BY_ID.get(action.id);
    if (!def) return state;
    const current = state.items[action.id] ?? 0;
    const limit = maxValue(def);
    // Both kinds wrap back round to 0, so a click past the top clears.
    const next = (current + action.direction + (limit + 1)) % (limit + 1);
    if (next === current) return state;
    return bump({ items: { ...state.items, [action.id]: next } });
  },

  setItem(state, action, bump) {
    const value = clampItem(action.id, action.value);
    if ((state.items[action.id] ?? 0) === value) return state;
    return bump({ items: { ...state.items, [action.id]: value } });
  },

  setDungeon(state, action, bump) {
    const key = String(action.level);
    const current = state.dungeons[key] ?? emptyDungeon();
    const next = { ...current, ...action.patch };
    if (next.triforce === current.triforce) return state;
    return bump({ dungeons: { ...state.dungeons, [key]: next } });
  },
};

const MARK_HANDLERS: Pick<
  Handlers,
  'cycleMark' | 'setMark' | 'markScreen' | 'placeDungeon' | 'placeStairway' | 'clearMap' | 'setStartScreen'
> = {
  cycleMark(state, action, bump) {
    const current = state.marks[action.screen] ?? 'none';
    const next = cycleMark(current, action.direction);
    return bump(writeMark(state, action.screen, next));
  },

  setMark(state, action, bump) {
    const written = writeMark(state, action.screen, action.mark);
    const unchanged =
      (state.marks[action.screen] ?? 'none') === action.mark &&
      (written.screenNotes ?? state.screenNotes) === state.screenNotes;
    return unchanged ? state : bump(written);
  },

  markScreen(state, action, bump) {
    const marked = { ...state, ...writeMark(state, action.screen, action.mark) };
    const edited = editScreenNote(marked, action.screen, action.patch);
    const markChanged = (state.marks[action.screen] ?? 'none') !== action.mark;
    if (!edited && !markChanged && marked.screenNotes === state.screenNotes) return state;
    return bump({ marks: marked.marks, screenNotes: marked.screenNotes, ...edited });
  },

  placeDungeon(state, action, bump) {
    const level = truncClamp(action.level, 1, 9);
    const marks = { ...state.marks };
    const screenNotes = { ...state.screenNotes };

    /*
     * A level exists once. Marking it somewhere new means the old spot was
     * wrong, so the marker moves rather than duplicating — two screens both
     * claiming Level 3 is worse than no marker at all, because you cannot
     * tell which one to walk to.
     *
     * The blockers travel with it: they belong to the dungeon, not to the
     * square of grass it was mistakenly pinned on. Nothing else does — a
     * shop's stock or a coast spot belongs to the screen it was recorded
     * on — and they join any the new screen already lists rather than
     * being hidden under them.
     */
    const carried: string[] = [];
    for (const [screen, note] of Object.entries(screenNotes)) {
      if (screen === action.screen || note.dungeon !== level) continue;
      carried.push(...note.blocks);
      delete screenNotes[screen];
      delete marks[screen];
    }

    marks[action.screen] = 'dungeon';
    const target = { ...emptyNote(), ...screenNotes[action.screen] };
    const placed: ScreenNote = {
      ...target,
      blocks: [...new Set([...target.blocks, ...carried])].sort(),
      dungeon: level,
    };
    return bump({ marks, screenNotes: pruneNote(screenNotes, marks, action.screen, placed) });
  },

  placeStairway(state, action, bump) {
    const number = truncClamp(action.number, 1, OVERWORLD_STAIRWAY_COUNT);
    const marks = { ...state.marks };
    const screenNotes = { ...state.screenNotes };

    /*
     * Same rule as a level: there is one stairway 2, so marking a new one
     * means the old one was wrong and the marker moves rather than
     * duplicating. Nothing is carried across — a stairway note holds only
     * its number, unlike a dungeon, whose blockers belong to the dungeon.
     */
    for (const [screen, note] of Object.entries(screenNotes)) {
      if (screen === action.screen || note.stairway !== number) continue;
      delete screenNotes[screen];
      delete marks[screen];
    }

    marks[action.screen] = 'stairway';
    const placed: ScreenNote = {
      ...emptyNote(),
      ...screenNotes[action.screen],
      stairway: number,
    };
    return bump({ marks, screenNotes: pruneNote(screenNotes, marks, action.screen, placed) });
  },

  clearMap(state, _action, bump) {
    /*
     * Deliberately only the map. A run ends with most of 128 screens marked
     * and none of it is worth carrying into the next seed, but the items and
     * Triforce have their own controls — wiping those here would make this a
     * second Reset wearing a friendlier label.
     */
    if (
      Object.keys(state.marks).length === 0 &&
      Object.keys(state.screenNotes).length === 0 &&
      state.startScreen === ''
    ) {
      return state;
    }
    // The start pennant is on the map, so it goes with it.
    return bump({ marks: {}, screenNotes: {}, startScreen: '' });
  },

  setStartScreen(state, action, bump) {
    if (action.screen !== '' && !isScreenId(action.screen)) return state;
    const startScreen = action.screen === state.startScreen ? '' : action.screen;
    if (startScreen === state.startScreen) return state;
    return bump({ startScreen });
  },
};

const SCREEN_NOTE_HANDLERS: Pick<
  Handlers,
  'setScreenNote' | 'toggleDungeonBlock' | 'collectScreen' | 'toggleShopStock' | 'setShopPrice'
> = {
  setScreenNote(state, action, bump) {
    const edited = editScreenNote(state, action.screen, action.patch);
    return edited ? bump(edited) : state;
  },

  toggleDungeonBlock(state, action, bump) {
    // Blockers belong to a dungeon. With the dungeon brush armed the card
    // offers them for whatever screen is selected, so this is reachable on a
    // shop; refusing keeps an invisible blocker off it.
    if (state.marks[action.screen] !== 'dungeon') return state;
    const current = state.screenNotes[action.screen] ?? emptyNote();
    const held = current.blocks.includes(action.block);
    const next: ScreenNote = {
      ...current,
      blocks: held
        ? current.blocks.filter((id) => id !== action.block)
        : [...current.blocks, action.block].sort(),
    };
    return bump({ screenNotes: pruneNote(state.screenNotes, state.marks, action.screen, next) });
  },

  collectScreen(state, action, bump) {
    const current = state.screenNotes[action.screen];
    // Checked rather than trusted from the type: this arrives over a
    // BroadcastChannel too, where nothing has been through the compiler.
    if (typeof action.collected !== 'boolean') return state;
    // Nothing on the screen means nothing to have picked up. Storing the
    // flag anyway would outlive the item it was about the moment one is set.
    if (!current || current.item === '') return state;
    if (current.collected === action.collected) return state;
    const next: ScreenNote = { ...current, collected: action.collected };
    const screenNotes = pruneNote(state.screenNotes, state.marks, action.screen, next);
    if (!action.collected) return bump({ screenNotes });
    return bump({ screenNotes, items: grantPoolEntry(state.items, current.item) });
  },

  toggleShopStock(state, action, bump) {
    const current = state.screenNotes[action.screen] ?? emptyNote();
    const held = current.shop.includes(action.stock);
    // The price belongs to the stock entry. Leaving it behind would put the
    // old number back the next time the same item was ticked, which reads as
    // the tracker inventing a price nobody saw.
    const shopPrices = { ...current.shopPrices };
    if (held) delete shopPrices[action.stock];
    const next: ScreenNote = {
      ...current,
      shop: held
        ? current.shop.filter((id) => id !== action.stock)
        : // Sorted so two screens with the same stock serialise identically,
          // and the icons never reorder as you tick them.
          [...current.shop, action.stock].sort(),
      shopPrices,
    };
    return bump({ screenNotes: pruneNote(state.screenNotes, state.marks, action.screen, next) });
  },

  setShopPrice(state, action, bump) {
    const current = state.screenNotes[action.screen] ?? emptyNote();
    // Rupees are whole and never negative, and anything unparseable reads as
    // "no price" rather than as a number nobody can act on.
    const price = truncWhole(action.price);
    // A price belongs to stock the shop carries; one for anything else would
    // render nowhere. Clearing one is always allowed.
    if (price !== 0 && !current.shop.includes(action.stock)) return state;
    if ((current.shopPrices[action.stock] ?? 0) === price) return state;
    const shopPrices = { ...current.shopPrices };
    // 0 is the empty value, so it removes the key rather than being stored —
    // same rule as a bare note, and it keeps exports free of `{"bomb":0}`.
    if (price === 0) delete shopPrices[action.stock];
    else shopPrices[action.stock] = price;
    const next: ScreenNote = { ...current, shopPrices };
    return bump({ screenNotes: pruneNote(state.screenNotes, state.marks, action.screen, next) });
  },
};

/** One room, edited, stored back into its level. */
function roomsWith(
  state: TrackerState,
  target: RoomTarget,
  room: string,
  next: RoomNote,
): Record<string, Record<string, RoomNote>> {
  const levelRooms = { ...state.rooms[target.level], [room]: next };
  return writeRooms(state.rooms, target.level, levelRooms);
}

/**
 * The shared shape of the single-field room actions: address the room, let
 * `edit` produce its new note, store it.
 *
 * `edit` returns null to refuse — a value that is not real, or one the room
 * already holds — and the state comes back untouched, so a no-op never bumps
 * `rev`.
 */
function editRoom(
  state: TrackerState,
  bump: Bump,
  level: number,
  room: string,
  edit: (current: RoomNote) => RoomNote | null,
): TrackerState {
  const target = roomTarget(state, level, room);
  if (!target) return state;
  const next = edit(target.current);
  return next ? bump({ rooms: roomsWith(state, target, room, next) }) : state;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** A check on one field of a room patch, given the level the room is on. */
type RoomPatchCheck<K extends keyof RoomNotePatch> = (
  value: NonNullable<RoomNotePatch[K]>,
  level: number,
) => boolean;

/**
 * What each field of a `setRoomNote` patch has to be, checked against the
 * tables rather than trusted from the type.
 *
 * Every field is listed, so one added to `RoomNote` has to be given a check —
 * or `null`, deliberately — before this compiles. Checked in this order.
 */
const ROOM_PATCH_CHECKS: { readonly [K in keyof RoomNotePatch]-?: RoomPatchCheck<K> | null } = {
  visited: isBoolean,
  known: isBoolean,
  item: isRoomItem,
  boss: isRoomBoss,
  stairs: isRoomStairKind,
  doors: (doors) => Object.entries(doors).every(([side, door]) => isRoomSide(side) && isDoorState(door)),
  // 0 is unpaired, which a patch may set; a pair number has to be real.
  transport: (transport) => transport === 0 || isRoomTransport(transport),
  // Never taken from a caller — `mergeRoomPatch` keeps the stored stamp — so
  // there is nothing to refuse.
  transportSeq: null,
  from: isRoomFrom,
  collected: isBoolean,
  ladder: isBoolean,
  layout: isRoomLayout,
  pushBlock: isRoomPushBlock,
  cleared: isBoolean,
};

const ROOM_PATCH_FIELDS = Object.keys(ROOM_PATCH_CHECKS) as (keyof RoomNotePatch)[];

/** Whether every field a patch carries passes its check. An absent field is not checked. */
function roomPatchIsValid(patch: RoomNotePatch, level: number): boolean {
  // Known and visited are one three-way state — clear, known, visited — so
  // a patch claiming both is a gesture that cannot happen.
  if (patch.known === true && patch.visited === true) return false;
  return ROOM_PATCH_FIELDS.every((field) => {
    const value = patch[field];
    const check = ROOM_PATCH_CHECKS[field] as ((value: unknown, level: number) => boolean) | null;
    return value === undefined || check === null || check(value, level);
  });
}

/** The room a valid patch describes, held to the rules the single-field actions keep. */
function mergeRoomPatch(current: RoomNote, patch: RoomNotePatch, collected: boolean): RoomNote {
  const merged: RoomNote = {
    ...current,
    ...patch,
    doors: { ...current.doors, ...patch.doors },
    // Bookkeeping for the eviction order, not a fact about the room, so it
    // is never taken from a caller — `pairTransport` is what stamps it.
    transportSeq: current.transportSeq,
    collected,
  };
  // Setting one side of the known / visited pair clears the other. Every
  // gesture that records a room as walked — a sheet click, a boss, a
  // staircase — arrives here as `visited: true`, and takes the premark off.
  if (patch.visited === true) merged.known = false;
  if (patch.known === true) merged.visited = false;
  // Same two rules the single-field actions enforce, so a patch cannot
  // reach a state a sequence of clicks could not.
  if (merged.stairs !== 'transport') {
    merged.transport = 0;
    merged.transportSeq = 0;
  }
  return merged;
}

const ROOM_HANDLERS: Pick<
  Handlers,
  | 'setLevelStart'
  | 'setRoomDoor'
  | 'setRoomItem'
  | 'collectRoom'
  | 'setRoomFrom'
  | 'setRoomBoss'
  | 'placeRoomTransport'
  | 'clearRoomTransport'
  | 'setRoomNote'
  | 'clearRooms'
> = {
  setLevelStart(state, action, bump) {
    if (!isRoomLevel(action.level)) return state;
    if (action.room !== '' && !isRoomId(action.room)) return state;
    const key = String(action.level);
    const current = state.levelStarts[key] ?? '';
    const room = action.room === current ? '' : action.room;
    if (room === current) return state;
    const levelStarts = { ...state.levelStarts };
    if (room) levelStarts[key] = room;
    else delete levelStarts[key];
    return bump({ levelStarts });
  },

  setRoomDoor(state, action, bump) {
    return editRoom(state, bump, action.level, action.room, (current) => {
      // Checked against the tables rather than trusted from the type: this same
      // action arrives from a BroadcastChannel and from a save file, where
      // nothing has been through the compiler.
      if (!isRoomSide(action.side) || !isDoorState(action.state)) return null;
      if (current.doors[action.side] === action.state) return null;
      return { ...current, doors: { ...current.doors, [action.side]: action.state } };
    });
  },

  setRoomItem(state, action, bump) {
    return editRoom(state, bump, action.level, action.room, (current) => {
      // '' is the empty value — "no item here" — so it clears rather than being
      // refused. Anything else has to be a real id, or the room would carry a
      // reference that renders as nothing and never goes away.
      if (!isRoomItem(action.item)) return null;
      if (current.item === action.item) return null;
      /*
       * Where the item is, not that you have it. Granting it here would make a
       * map note silently fill in the inventory, and un-noting it could not
       * take the grant back — collecting is `collectRoom`'s business and stays
       * there. The collected flag goes with the old item: it was about that
       * item, and a pickup of one says nothing about the next.
       */
      return { ...current, item: action.item, collected: false };
    });
  },

  collectRoom(state, action, bump) {
    const target = roomTarget(state, action.level, action.room);
    if (!target) return state;
    if (typeof action.collected !== 'boolean') return state;
    // An empty room has nothing to have picked up, and a flag stored on one
    // would be about whichever item was placed there next.
    if (target.current.item === '') return state;
    if (target.current.collected === action.collected) return state;
    const next: RoomNote = { ...target.current, collected: action.collected };
    const rooms = roomsWith(state, target, action.room, next);
    // Un-collecting never revokes, the same promise `collectLocation` makes:
    // the inventory may have been raised by other means since.
    if (!action.collected) return bump({ rooms });
    return bump({ rooms, items: grantPoolEntry(state.items, target.current.item) });
  },

  setRoomFrom(state, action, bump) {
    return editRoom(state, bump, action.level, action.room, (current) => {
      // Refused, not defaulted: an unknown value is a caller bug, and reading
      // it as `auto` would move the item to a slot nobody chose.
      if (!isRoomFrom(action.from)) return null;
      if (current.from === action.from) return null;
      return { ...current, from: action.from };
    });
  },

  setRoomBoss(state, action, bump) {
    return editRoom(state, bump, action.level, action.room, (current) => {
      // Ganon and Zelda exist in Level 9 and nowhere else, so this refuses
      // rather than clamps: there is no nearby value to fall back to, and
      // storing one would draw a room that cannot exist.
      if (!isRoomBoss(action.boss, action.level)) return null;
      if (current.boss === action.boss) return null;
      return { ...current, boss: action.boss };
    });
  },

  placeRoomTransport(state, action, bump) {
    const target = roomTarget(state, action.level, action.room);
    if (!target) return state;
    // Refused, not clamped: a 7 or a 2.5 is a caller bug, and quietly turning
    // it into a 4 would pair two rooms the player never paired.
    if (!isRoomTransport(action.number)) return state;
    // Re-placing the number a room already holds would restamp it as the
    // newest of the pair, which would change which room an eviction picks.
    if (target.current.transport === action.number) return state;
    const levelRooms = pairTransport(
      state.rooms[target.level] ?? {},
      action.room,
      target.current,
      action.number,
    );
    return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
  },

  clearRoomTransport(state, action, bump) {
    return editRoom(state, bump, action.level, action.room, (current) => {
      if (current.transport === 0) return null;
      // The staircase stays; only the number goes.
      return { ...current, transport: 0, transportSeq: 0 };
    });
  },

  setRoomNote(state, action, bump) {
    const target = roomTarget(state, action.level, action.room);
    if (!target) return state;
    const patch = action.patch;

    /*
     * One bad field refuses the whole patch rather than being dropped from
     * it. A patch is one user gesture — a detail strip committing several
     * fields together — so applying the half that parsed would record a room
     * the player never described.
     */
    if (!roomPatchIsValid(patch, action.level)) return state;
    // Same refusal as `collectRoom`: collecting an empty room is not a fact.
    const item = patch.item ?? target.current.item;
    if (patch.collected === true && item === '') return state;
    const settled = settleCollected(target.current, item, patch.collected);
    const merged = mergeRoomPatch(target.current, patch, settled.collected);

    const existing = state.rooms[target.level] ?? {};
    const levelRooms =
      merged.transport !== 0 && merged.transport !== target.current.transport
        ? pairTransport(existing, action.room, merged, merged.transport)
        : { ...existing, [action.room]: merged };
    const rooms = writeRooms(state.rooms, target.level, levelRooms);
    if (!settled.picked) return bump({ rooms });
    return bump({ rooms, items: grantPoolEntry(state.items, merged.item) });
  },

  clearRooms(state, action, bump) {
    const key = String(action.level);
    if (!(key in state.rooms) && !(key in state.levelStarts)) return state;
    /*
     * One level, not all nine. The room map is the thing you redraw when you
     * realise you mapped a level wrong, and losing the other eight to that
     * mistake would be worse than the mistake.
     */
    const rooms = { ...state.rooms };
    delete rooms[key];
    // The entrance is drawn on the sheet, so clearing the sheet clears it.
    const levelStarts = { ...state.levelStarts };
    delete levelStarts[key];
    return bump({ rooms, levelStarts });
  },
};

function otherQuest(quest: SeedSettings['questLow']): SeedSettings['questLow'] {
  return quest === '1st' ? '2nd' : '1st';
}

/**
 * Mixed Quest guarantees 1-6 and 7-9 come from different quests, so setting
 * one half implies the other rather than allowing an impossible "both 1st
 * Quest" that would show the wrong item slots.
 *
 * Writes into `seed`, which the caller has already copied.
 */
function pairQuests(seed: SeedSettings, patch: Partial<SeedSettings>): void {
  if (!questsMustDiffer(seed.dungeonQuest)) return;
  if (patch.questLow && !patch.questHigh) {
    seed.questHigh = otherQuest(seed.questLow);
  } else if (patch.questHigh && !patch.questLow) {
    seed.questLow = otherQuest(seed.questHigh);
  } else if (seed.questLow === seed.questHigh) {
    seed.questHigh = otherQuest(seed.questLow);
  }
}

/** Every note with its Coast spot re-fitted to the screen that is the coast now. */
function respotNotes(notes: Record<string, ScreenNote>, mirrored: boolean): Record<string, ScreenNote> {
  const screenNotes: Record<string, ScreenNote> = {};
  for (const [screen, note] of Object.entries(notes)) {
    screenNotes[screen] = {
      ...note,
      spot: conformSpot(screen, note.spot, note.item, mirrored),
    };
  }
  return screenNotes;
}

const SEED_HANDLERS: Pick<Handlers, 'setSeed' | 'collectLocation'> = {
  setSeed(state, action, bump) {
    const seed = { ...state.seed, ...action.patch };
    pairQuests(seed, action.patch);
    // Mirroring moves the coast between F16 and F1, so the Coast spot moves
    // with it: off the old screen's item and onto the new one's.
    if (seed.mirroredOverworld === state.seed.mirroredOverworld) return bump({ seed });
    return bump({ seed, screenNotes: respotNotes(state.screenNotes, seed.mirroredOverworld) });
  },

  collectLocation(state, action, bump) {
    const current = state.locations[action.id] ?? { item: '', collected: false };
    if (typeof action.collected !== 'boolean' || current.collected === action.collected) return state;
    // Same refusal as `collectRoom` and `collectScreen`: an entry with no
    // known item has nothing to have collected. Clearing one an older save
    // holds is still allowed.
    if (action.collected && current.item === '') return state;
    const locations = {
      ...state.locations,
      [action.id]: { ...current, collected: action.collected },
    };

    if (!action.collected) return bump({ locations });
    // A Heart Container records where it was without touching inventory —
    // see `grantPoolEntry`, which every collect gesture shares.
    return bump({ locations, items: grantPoolEntry(state.items, current.item) });
  },
};

const HINT_HANDLERS: Pick<Handlers, 'addHint' | 'updateHint' | 'removeHint' | 'focusRegion'> = {
  addHint(state, _action, bump) {
    const seq = state.hintSeq + 1;
    const hint: HintEntry = { id: `h${seq}`, subject: '', region: '', screen: '', note: '' };
    return bump({ hints: [...state.hints, hint], hintSeq: seq });
  },

  updateHint(state, action, bump) {
    const index = state.hints.findIndex((hint) => hint.id === action.id);
    if (index < 0) return state;
    const current = state.hints[index]!;
    const next = { ...current, ...action.patch, id: current.id };
    const fields = Object.keys(next) as (keyof HintEntry)[];
    if (fields.every((field) => next[field] === current[field])) return state;
    const hints = state.hints.map((hint, i) => (i === index ? next : hint));
    return bump({ hints });
  },

  removeHint(state, action, bump) {
    const hints = state.hints.filter((hint) => hint.id !== action.id);
    if (hints.length === state.hints.length) return state;
    // Don't leave the map highlighting a region no hint mentions any more.
    const stillReferenced = hints.some((hint) => hint.region === state.focusRegion);
    return bump({ hints, focusRegion: stillReferenced ? state.focusRegion : '' });
  },

  focusRegion(state, action, bump) {
    const next = state.focusRegion === action.region ? '' : action.region;
    if (next === state.focusRegion) return state;
    return bump({ focusRegion: next });
  },
};

const LIFECYCLE_HANDLERS: Pick<Handlers, 'replace' | 'import' | 'reset'> = {
  replace(_state, action, _bump, now) {
    // A peer's state is adopted whole, `rev` included, so both windows land
    // on the same counter and neither treats the other as stale afterwards.
    return { ...action.state, updatedAt: now };
  },

  import(state, action, _bump, now) {
    // A file the user just opened here wins over whatever peers hold, so its
    // `rev` is lifted above both sides rather than adopted as-is.
    return {
      ...action.state,
      rev: Math.max(state.rev, action.state.rev ?? 0) + 1,
      updatedAt: now,
    };
  },

  reset(state, _action, _bump, now) {
    return { ...createInitialState(now), rev: state.rev + 1 };
  },
};

const HANDLERS: Handlers = {
  ...ITEM_HANDLERS,
  ...MARK_HANDLERS,
  ...SCREEN_NOTE_HANDLERS,
  ...ROOM_HANDLERS,
  ...SEED_HANDLERS,
  ...HINT_HANDLERS,
  ...LIFECYCLE_HANDLERS,
};

export function reduce(state: TrackerState, action: Action, now = Date.now()): TrackerState {
  const bump: Bump = (patch) => ({
    ...state,
    ...patch,
    rev: state.rev + 1,
    updatedAt: now,
  });

  // Own keys only. An action that arrives over a BroadcastChannel has not been
  // through the compiler, and a type such as `toString` must not reach
  // Object.prototype. An unknown type changes nothing.
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, action.type)
    ? (HANDLERS[action.type] as Handler<Action['type']>)
    : undefined;
  return handler ? handler(state, action, bump, now) : state;
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
