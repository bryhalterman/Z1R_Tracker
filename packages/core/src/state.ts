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
  cycleMark,
  isScreenId,
  OVERWORLD_STAIRWAY_COUNT,
  SECRET_SIZES_BY_ID,
  type MarkKind,
  type SecretSize,
} from './overworld.js';
import { SCREEN_ITEMS_BY_ID, createSeedSettings, questsMustDiffer, type SeedSettings } from './seed.js';
import {
  bossAllowedOnLevel,
  DOOR_STATES_BY_ID,
  emptyRoom,
  isRoomFrom,
  isRoomId,
  isRoomLevel,
  isRoomSide,
  roomIsBare,
  ROOM_ITEMS_BY_ID,
  ROOM_STAIRS_BY_ID,
  ROOM_TRANSPORT_COUNT,
  ROOM_TRANSPORT_PAIR_SIZE,
  type DoorState,
  type RoomFrom,
  type RoomNote,
  type RoomNotePatch,
  type RoomSide,
  type RoomStairKind,
} from './rooms.js';

export const STATE_VERSION = 13;

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
  /** Level -> extra floor slots added under Shuffle Minor Dungeon Drops. */
  extraFloorSlots: Record<string, number>;
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
  /** Been in this room, or not. */
  | { type: 'toggleRoomVisited'; level: number; room: string }
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
  /** Anything but `transport` also drops the pair number. */
  | { type: 'setRoomStairs'; level: number; room: string; stairs: RoomStairKind }
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
  return {
    dungeon: 0,
    stairway: 0,
    shop: [],
    shopPrices: {},
    blocks: [],
    spot: '',
    item: '',
    collected: false,
    secret: '',
  };
}

/** True once a note carries nothing worth keeping. */
function noteIsBare(note: ScreenNote): boolean {
  return (
    note.dungeon === 0 &&
    note.stairway === 0 &&
    note.shop.length === 0 &&
    // A price outlives nothing: `toggleShopStock` drops one with its stock, so
    // this only holds a note up when a price was written without the stock.
    Object.keys(note.shopPrices).length === 0 &&
    note.blocks.length === 0 &&
    note.spot === '' &&
    note.item === '' &&
    !note.collected &&
    note.secret === ''
  );
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

/** The level/room pair every room action is addressed by, or null if either is not real. */
function roomTarget(
  state: TrackerState,
  level: number,
  room: string,
): { level: string; current: RoomNote } | null {
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
    rooms: {},
    seed: createSeedSettings(),
    locations: {},
    extraFloorSlots: {},
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
  const collected =
    item !== '' && (requested !== undefined ? requested : sameItem && before.collected);
  return { collected, picked: collected && !(sameItem && before.collected) };
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
      const current = { ...emptyNote(), ...state.screenNotes[action.screen] };
      const next = { ...current, ...action.patch };
      if (typeof next.dungeon === 'number') {
        // 0 means "found but not yet identified", which is a real state.
        next.dungeon = Number.isInteger(next.dungeon) ? Math.min(Math.max(next.dungeon, 0), 9) : 0;
      }
      if (typeof next.stairway === 'number') {
        // 0 is "no number yet"; the UI places stairways through placeStairway,
        // which is what keeps the numbers unique.
        next.stairway = Number.isInteger(next.stairway)
          ? Math.min(Math.max(next.stairway, 0), OVERWORLD_STAIRWAY_COUNT)
          : 0;
      }
      // An unknown size reads as unknown rather than refusing the whole patch.
      if (!SECRET_SIZES_BY_ID.has(next.secret)) next.secret = '';
      // Coerced rather than refused, like the two numbers above: anything but
      // a literal `true` is not collected.
      const requested =
        action.patch.collected === undefined ? undefined : action.patch.collected === true;
      const settled = settleCollected(current, next.item, requested);
      next.collected = settled.collected;
      const screenNotes = pruneNote(state.screenNotes, action.screen, next);
      if (!settled.picked) return bump({ screenNotes });
      return bump({ screenNotes, items: grantPoolEntry(state.items, next.item) });
    }

    case 'placeDungeon': {
      const level = Math.min(Math.max(Math.trunc(action.level) || 0, 1), 9);
      const marks = { ...state.marks };
      const screenNotes = { ...state.screenNotes };

      /*
       * A level exists once. Marking it somewhere new means the old spot was
       * wrong, so the marker moves rather than duplicating — two screens both
       * claiming Level 3 is worse than no marker at all, because you cannot
       * tell which one to walk to.
       *
       * The note travels with it. Blockers belong to the dungeon, not to the
       * square of grass it was mistakenly pinned on.
       */
      let carried: ScreenNote | undefined;
      for (const [screen, note] of Object.entries(screenNotes)) {
        if (screen === action.screen || note.dungeon !== level) continue;
        carried = note;
        delete screenNotes[screen];
        delete marks[screen];
      }

      marks[action.screen] = 'dungeon';
      screenNotes[action.screen] = {
        ...emptyNote(),
        ...carried,
        ...screenNotes[action.screen],
        dungeon: level,
      };
      return bump({ marks, screenNotes });
    }

    case 'placeStairway': {
      const number = Math.min(
        Math.max(Math.trunc(action.number) || 0, 1),
        OVERWORLD_STAIRWAY_COUNT,
      );
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
      screenNotes[action.screen] = {
        ...emptyNote(),
        ...screenNotes[action.screen],
        stairway: number,
      };
      return bump({ marks, screenNotes });
    }

    case 'toggleDungeonBlock': {
      const current = state.screenNotes[action.screen] ?? emptyNote();
      const held = current.blocks.includes(action.block);
      const next: ScreenNote = {
        ...current,
        blocks: held
          ? current.blocks.filter((id) => id !== action.block)
          : [...current.blocks, action.block].sort(),
      };
      return bump({ screenNotes: pruneNote(state.screenNotes, action.screen, next) });
    }

    case 'clearMap':
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

    case 'setStartScreen': {
      if (action.screen !== '' && !isScreenId(action.screen)) return state;
      const startScreen = action.screen === state.startScreen ? '' : action.screen;
      if (startScreen === state.startScreen) return state;
      return bump({ startScreen });
    }

    case 'setLevelStart': {
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
    }

    case 'collectScreen': {
      const current = state.screenNotes[action.screen];
      // Checked rather than trusted from the type: this arrives over a
      // BroadcastChannel too, where nothing has been through the compiler.
      if (typeof action.collected !== 'boolean') return state;
      // Nothing on the screen means nothing to have picked up. Storing the
      // flag anyway would outlive the item it was about the moment one is set.
      if (!current || current.item === '') return state;
      if (current.collected === action.collected) return state;
      const next: ScreenNote = { ...current, collected: action.collected };
      const screenNotes = pruneNote(state.screenNotes, action.screen, next);
      if (!action.collected) return bump({ screenNotes });
      return bump({ screenNotes, items: grantPoolEntry(state.items, current.item) });
    }

    case 'toggleShopStock': {
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
      return bump({ screenNotes: pruneNote(state.screenNotes, action.screen, next) });
    }

    case 'setShopPrice': {
      const current = state.screenNotes[action.screen] ?? emptyNote();
      // Rupees are whole and never negative, and anything unparseable reads as
      // "no price" rather than as a number nobody can act on.
      const price = Number.isFinite(action.price) ? Math.max(Math.trunc(action.price), 0) : 0;
      const shopPrices = { ...current.shopPrices };
      // 0 is the empty value, so it removes the key rather than being stored —
      // same rule as a bare note, and it keeps exports free of `{"bomb":0}`.
      if (price === 0) delete shopPrices[action.stock];
      else shopPrices[action.stock] = price;
      const next: ScreenNote = { ...current, shopPrices };
      return bump({ screenNotes: pruneNote(state.screenNotes, action.screen, next) });
    }

    case 'toggleRoomVisited': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      const next: RoomNote = { ...target.current, visited: !target.current.visited };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'setRoomDoor': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      // Checked against the tables rather than trusted from the type: this same
      // action arrives from a BroadcastChannel and from a save file, where
      // nothing has been through the compiler.
      if (!isRoomSide(action.side) || !DOOR_STATES_BY_ID.has(action.state)) return state;
      if (target.current.doors[action.side] === action.state) return state;
      const next: RoomNote = {
        ...target.current,
        doors: { ...target.current.doors, [action.side]: action.state },
      };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'setRoomItem': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      // '' is the empty value — "no item here" — so it clears rather than being
      // refused. Anything else has to be a real id, or the room would carry a
      // reference that renders as nothing and never goes away.
      if (action.item !== '' && !ROOM_ITEMS_BY_ID.has(action.item)) return state;
      if (target.current.item === action.item) return state;
      /*
       * Where the item is, not that you have it. Granting it here would make a
       * map note silently fill in the inventory, and un-noting it could not
       * take the grant back — collecting is `collectRoom`'s business and stays
       * there. The collected flag goes with the old item: it was about that
       * item, and a pickup of one says nothing about the next.
       */
      const next: RoomNote = { ...target.current, item: action.item, collected: false };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'collectRoom': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      if (typeof action.collected !== 'boolean') return state;
      // An empty room has nothing to have picked up, and a flag stored on one
      // would be about whichever item was placed there next.
      if (target.current.item === '') return state;
      if (target.current.collected === action.collected) return state;
      const next: RoomNote = { ...target.current, collected: action.collected };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      const rooms = writeRooms(state.rooms, target.level, levelRooms);
      // Un-collecting never revokes, the same promise `collectLocation` makes:
      // the inventory may have been raised by other means since.
      if (!action.collected) return bump({ rooms });
      return bump({ rooms, items: grantPoolEntry(state.items, target.current.item) });
    }

    case 'setRoomFrom': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      // Refused, not defaulted: an unknown value is a caller bug, and reading
      // it as `auto` would move the item to a slot nobody chose.
      if (!isRoomFrom(action.from)) return state;
      if (target.current.from === action.from) return state;
      const next: RoomNote = { ...target.current, from: action.from };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'setRoomBoss': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      // Ganon and Zelda exist in Level 9 and nowhere else, so this refuses
      // rather than clamps: there is no nearby value to fall back to, and
      // storing one would draw a room that cannot exist.
      if (action.boss !== '' && !bossAllowedOnLevel(action.boss, action.level)) return state;
      if (target.current.boss === action.boss) return state;
      const next: RoomNote = { ...target.current, boss: action.boss };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'setRoomStairs': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      if (!ROOM_STAIRS_BY_ID.has(action.stairs)) return state;
      if (target.current.stairs === action.stairs) return state;
      // A pair number belongs to a transport staircase. Leaving it behind on an
      // item staircase would keep the room in a pair it is no longer part of,
      // and the other half would point at nothing.
      const paired = action.stairs === 'transport';
      const next: RoomNote = {
        ...target.current,
        stairs: action.stairs,
        transport: paired ? target.current.transport : 0,
        transportSeq: paired ? target.current.transportSeq : 0,
      };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'placeRoomTransport': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      // Refused, not clamped: a 7 or a 2.5 is a caller bug, and quietly turning
      // it into a 4 would pair two rooms the player never paired.
      if (!Number.isInteger(action.number)) return state;
      if (action.number < 1 || action.number > ROOM_TRANSPORT_COUNT) return state;
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
    }

    case 'clearRoomTransport': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      if (target.current.transport === 0) return state;
      // The staircase stays; only the number goes.
      const next: RoomNote = { ...target.current, transport: 0, transportSeq: 0 };
      const levelRooms = { ...state.rooms[target.level], [action.room]: next };
      return bump({ rooms: writeRooms(state.rooms, target.level, levelRooms) });
    }

    case 'setRoomNote': {
      const target = roomTarget(state, action.level, action.room);
      if (!target) return state;
      const patch = action.patch;

      /*
       * One bad field refuses the whole patch rather than being dropped from
       * it. A patch is one user gesture — a detail strip committing several
       * fields together — so applying the half that parsed would record a room
       * the player never described.
       */
      if (patch.visited !== undefined && typeof patch.visited !== 'boolean') return state;
      if (patch.item !== undefined && patch.item !== '' && !ROOM_ITEMS_BY_ID.has(patch.item)) {
        return state;
      }
      if (patch.boss !== undefined && patch.boss !== '') {
        if (!bossAllowedOnLevel(patch.boss, action.level)) return state;
      }
      if (patch.stairs !== undefined && !ROOM_STAIRS_BY_ID.has(patch.stairs)) return state;
      if (patch.doors !== undefined) {
        for (const [side, door] of Object.entries(patch.doors)) {
          if (!isRoomSide(side)) return state;
          if (typeof door !== 'string' || !DOOR_STATES_BY_ID.has(door)) return state;
        }
      }
      if (patch.transport !== undefined) {
        if (!Number.isInteger(patch.transport)) return state;
        if (patch.transport < 0 || patch.transport > ROOM_TRANSPORT_COUNT) return state;
      }
      if (patch.from !== undefined && !isRoomFrom(patch.from)) return state;
      if (patch.collected !== undefined && typeof patch.collected !== 'boolean') return state;
      // Same refusal as `collectRoom`: collecting an empty room is not a fact.
      const item = patch.item ?? target.current.item;
      if (patch.collected === true && item === '') return state;
      const settled = settleCollected(target.current, item, patch.collected);

      const merged: RoomNote = {
        ...target.current,
        ...patch,
        doors: { ...target.current.doors, ...patch.doors },
        // Bookkeeping for the eviction order, not a fact about the room, so it
        // is never taken from a caller — `pairTransport` is what stamps it.
        transportSeq: target.current.transportSeq,
        collected: settled.collected,
      };
      // Same two rules the single-field actions enforce, so a patch cannot
      // reach a state a sequence of clicks could not.
      if (merged.stairs !== 'transport') {
        merged.transport = 0;
        merged.transportSeq = 0;
      }

      const existing = state.rooms[target.level] ?? {};
      const levelRooms =
        merged.transport !== 0 && merged.transport !== target.current.transport
          ? pairTransport(existing, action.room, merged, merged.transport)
          : { ...existing, [action.room]: merged };
      const rooms = writeRooms(state.rooms, target.level, levelRooms);
      if (!settled.picked) return bump({ rooms });
      return bump({ rooms, items: grantPoolEntry(state.items, merged.item) });
    }

    case 'clearRooms': {
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

      if (!action.collected) return bump({ locations });
      // A Heart Container records where it was without touching inventory —
      // see `grantPoolEntry`, which every collect gesture shares.
      return bump({ locations, items: grantPoolEntry(state.items, current.item) });
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

