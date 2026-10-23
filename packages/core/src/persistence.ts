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
  type ScreenNote,
  type Store,
  type TrackerState,
} from './state.js';

import {
  bossAllowedOnLevel,
  DOOR_STATES_BY_ID,
  emptyRoom,
  isRoomFrom,
  isRoomId,
  isRoomLevel,
  roomIsBare,
  ROOM_ITEMS_BY_ID,
  ROOM_SIDES,
  ROOM_STAIRS_BY_ID,
  ROOM_TRANSPORT_COUNT,
  ROOM_TRANSPORT_PAIR_SIZE,
  type DoorState,
  type RoomDoors,
  type RoomNote,
  type RoomStairKind,
} from './rooms.js';

import {
  DUNGEON_BLOCKS_BY_ID,
  isScreenId,
  MARKS_BY_KIND,
  SECRET_SIZES_BY_ID,
  OVERWORLD_STAIRWAY_COUNT,
  SHOP_STOCK_BY_ID,
  type MarkKind,
  type SecretSize,
} from './overworld.js';
import { OVERWORLD_LOCATIONS, SCREEN_ITEMS_BY_ID, type SeedSettings } from './seed.js';

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
/**
 * Drop marks whose kind no longer exists.
 *
 * The palette used to carry ten kinds; it carries three. A save written before
 * that still holds `bombable`, `warp` and the rest, and merging it in unchanged
 * left screens tagged with a kind no renderer has a definition for — they came
 * back as blank cells that still refused to look unmarked, and exporting wrote
 * them straight back out again.
 */
function conformMarks(saved: unknown): Record<string, MarkKind> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, MarkKind> = {};
  for (const [screen, kind] of Object.entries(saved as Record<string, unknown>)) {
    if (typeof kind !== 'string' || kind === 'none') continue;
    if (!MARKS_BY_KIND.has(kind as MarkKind)) continue;
    out[screen] = kind as MarkKind;
  }
  return out;
}

/**
 * Prices, keyed by stock id and clamped the way the reducer clamps them.
 *
 * Everything here is drawn as a numeral on a 50px map cell, so a NaN, an
 * Infinity or a negative would either print as nonsense or push the line off
 * the tile. Anything that is not a whole positive number is dropped rather
 * than repaired, and so is a price for an item this shop does not stock — an
 * orphan renders nowhere and would sit in the save forever.
 */
function conformShopPrices(saved: unknown, shop: readonly string[]): Record<string, number> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [stock, value] of Object.entries(saved as Record<string, unknown>)) {
    if (!shop.includes(stock)) continue;
    const price = Number(value);
    if (!Number.isFinite(price)) continue;
    // Truncated, not rejected, so this matches `setShopPrice` exactly and the
    // two cannot drift. 0 and below is the empty value: no key.
    const whole = Math.max(Math.trunc(price), 0);
    if (whole === 0) continue;
    out[stock] = whole;
  }
  return out;
}

/**
 * Structural check on per-screen detail, which is entirely new in v6.
 *
 * Everything here is drawn straight onto the map, so a bad shape is a render
 * error rather than a wrong number: `shop` is indexed and mapped over, and a
 * string where an array belongs would iterate character by character.
 */
function conformScreenNotes(saved: unknown): Record<string, ScreenNote> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, ScreenNote> = {};
  for (const [screen, value] of Object.entries(saved as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const note = value as Partial<ScreenNote>;

    const level = Number(note.dungeon);
    const dungeon = Number.isInteger(level) ? Math.min(Math.max(level, 0), 9) : 0;
    // Same treatment as the level: coerced, then clamped to the numbers that
    // exist. 0 is "unnumbered", which a stairway written by an older save is.
    const stairNumber = Number(note.stairway);
    const stairway = Number.isInteger(stairNumber)
      ? Math.min(Math.max(stairNumber, 0), OVERWORLD_STAIRWAY_COUNT)
      : 0;
    // Ids are looked up in a table to render, so an unknown one draws nothing
    // and would sit in the save forever as an invisible entry.
    const shop = Array.isArray(note.shop)
      ? [...new Set(note.shop.filter((id): id is string => typeof id === 'string'))]
          .filter((id) => SHOP_STOCK_BY_ID.has(id))
          .sort()
      : [];
    // Absent in every save written before v10, which is simply no prices.
    const shopPrices = conformShopPrices(note.shopPrices, shop);
    const blocks = Array.isArray(note.blocks)
      ? [...new Set(note.blocks.filter((id): id is string => typeof id === 'string'))]
          .filter((id) => DUNGEON_BLOCKS_BY_ID.has(id))
          .sort()
      : [];
    const item = typeof note.item === 'string' && SCREEN_ITEMS_BY_ID.has(note.item) ? note.item : '';
    // Checked against the real list: an unknown spot id renders as nothing and
    // would sit in the save forever as an invisible entry.
    const spot =
      typeof note.spot === 'string' && OVERWORLD_LOCATIONS.some((l) => l.id === note.spot)
        ? note.spot
        : '';
    // New in v12, so absent from every earlier save, which reads as not
    // collected. Strictly true, and never without an item: a flag with nothing
    // to be about would attach itself to whatever item is placed next.
    const collected = note.collected === true && item !== '';
    // New in v13; absent reads as unknown.
    const secret =
      typeof note.secret === 'string' && SECRET_SIZES_BY_ID.has(note.secret)
        ? (note.secret as SecretSize)
        : '';

    if (
      dungeon === 0 &&
      stairway === 0 &&
      shop.length === 0 &&
      blocks.length === 0 &&
      spot === '' &&
      item === '' &&
      secret === ''
    ) {
      continue;
    }
    out[screen] = { dungeon, stairway, shop, shopPrices, blocks, spot, item, collected, secret };
  }
  return out;
}

/**
 * Door ids this model has renamed, old id to current one.
 *
 * `bomb` became `bombed` when the state's meaning inverted: it used to mark a
 * bombable wall, a way through that wanted a bomb, and now marks one that was
 * bombed and stayed shut. The id is carried across rather than dropped, because
 * an edge somebody deliberately marked is worth keeping on the sheet, and a
 * state visible enough to argue with invites the correction a silent reset to
 * `unknown` never would.
 */
const DOOR_STATE_RENAMES: ReadonlyMap<string, DoorState> = new Map([['bomb', 'bombed']]);

/**
 * Each side checked against the table; anything else reads as `unknown`.
 *
 * Renamed ids are translated first, so they never reach the unknown-value path.
 */
function conformDoors(saved: unknown): RoomDoors {
  const doors = emptyRoom().doors;
  if (!saved || typeof saved !== 'object') return doors;
  const source = saved as Record<string, unknown>;
  for (const side of ROOM_SIDES) {
    const value = source[side];
    if (typeof value !== 'string') continue;
    const renamed = DOOR_STATE_RENAMES.get(value);
    if (renamed) {
      doors[side] = renamed;
      continue;
    }
    if (!DOOR_STATES_BY_ID.has(value)) continue;
    doors[side] = value as DoorState;
  }
  return doors;
}

/**
 * Keep at most two rooms per transport number.
 *
 * A number names one staircase, so a save holding three is corrupt however it
 * got that way. The oldest claims go, which is the same comparison the reducer
 * evicts by — a repaired save then behaves exactly like one that was never
 * broken. The staircase itself stays recorded on the rooms that lose the
 * number; only the pairing was impossible.
 */
function conformPairs(rooms: Record<string, RoomNote>): Record<string, RoomNote> {
  const byNumber = new Map<number, [string, RoomNote][]>();
  for (const entry of Object.entries(rooms)) {
    if (entry[1].transport === 0) continue;
    const held = byNumber.get(entry[1].transport) ?? [];
    held.push(entry);
    byNumber.set(entry[1].transport, held);
  }

  const out = { ...rooms };
  for (const held of byNumber.values()) {
    if (held.length <= ROOM_TRANSPORT_PAIR_SIZE) continue;
    held.sort(([aId, a], [bId, b]) => a.transportSeq - b.transportSeq || aId.localeCompare(bId));
    for (const [room, note] of held.slice(0, held.length - ROOM_TRANSPORT_PAIR_SIZE)) {
      out[room] = { ...note, transport: 0, transportSeq: 0 };
    }
  }
  return out;
}

/**
 * Per-level room maps, new in v11; `collected` and `from` joined in v12.
 *
 * Absent in every earlier save, which is simply no rooms recorded. Everything
 * below is checked against the tables rather than merged, for the same reason
 * marks are: a door state, a staircase kind, a boss or an item id that has no
 * definition renders as nothing, and merging it in would keep it in the save
 * and in every export forever. Both key levels are validated too — a room id
 * off the 8x8 grid has no cell to draw in, and a level outside 1-9 has no grid
 * at all.
 */
function conformRooms(saved: unknown): Record<string, Record<string, RoomNote>> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, Record<string, RoomNote>> = {};

  for (const [level, value] of Object.entries(saved as Record<string, unknown>)) {
    const number = Number(level);
    if (!isRoomLevel(number)) continue;
    if (!value || typeof value !== 'object') continue;

    const kept: Record<string, RoomNote> = {};
    for (const [room, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!isRoomId(room)) continue;
      if (!raw || typeof raw !== 'object') continue;
      const note = raw as Partial<RoomNote>;

      // Strictly true, so a truthy string or 1 does not read as visited.
      const visited = note.visited === true;
      const item =
        typeof note.item === 'string' && ROOM_ITEMS_BY_ID.has(note.item) ? note.item : '';
      // Ganon and Zelda on any level but 9 are dropped rather than moved: the
      // room they were recorded in cannot exist, so neither can the boss.
      const boss =
        typeof note.boss === 'string' && bossAllowedOnLevel(note.boss, number) ? note.boss : '';
      const stairs: RoomStairKind =
        typeof note.stairs === 'string' && ROOM_STAIRS_BY_ID.has(note.stairs)
          ? (note.stairs as RoomStairKind)
          : 'none';
      // Only transport stairs carry a pair number, same rule the reducer holds.
      // Coerced then checked whole: a 2.5, a -1 and a NaN all read as unpaired
      // rather than being rounded into a pair nobody placed.
      const pair = Number(note.transport);
      const transport =
        stairs === 'transport' && Number.isInteger(pair) && pair >= 1 && pair <= ROOM_TRANSPORT_COUNT
          ? pair
          : 0;
      // The eviction stamp is meaningless without a number. A missing one
      // leaves 0, which simply makes that room the first candidate to evict.
      const seq = Number(note.transportSeq);
      const transportSeq = transport !== 0 && Number.isInteger(seq) && seq > 0 ? seq : 0;
      const doors = conformDoors(note.doors);
      // Both new in v12. An earlier room loads as uncollected and `auto`, which
      // is what a room recorded before either existed meant. Collected follows
      // the reducer's rule that an empty room cannot be.
      const collected = note.collected === true && item !== '';
      const from = isRoomFrom(note.from) ? note.from : 'auto';

      const conformed: RoomNote = {
        visited,
        item,
        boss,
        stairs,
        transport,
        transportSeq,
        doors,
        collected,
        from,
      };
      // Absence is the empty state, so a room that conformed down to nothing
      // must not be written back out as sixty-four unknown doors.
      if (roomIsBare(conformed)) continue;
      kept[room] = conformed;
    }

    if (Object.keys(kept).length === 0) continue;
    out[level] = conformPairs(kept);
  }
  return out;
}

function conformLevelStarts(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [level, room] of Object.entries(saved as Record<string, unknown>)) {
    if (!isRoomLevel(Number(level)) || typeof room !== 'string' || !isRoomId(room)) continue;
    out[String(Number(level))] = room;
  }
  return out;
}

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
    marks: conformMarks(candidate.marks),
    screenNotes: conformScreenNotes(candidate.screenNotes),
    // Absent in every save written before v11, which loads as no rooms.
    rooms: conformRooms(candidate.rooms),
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
    // Both new in v13. A screen or room that does not exist would draw nowhere
    // and outlive every Clear, so it is dropped.
    startScreen:
      typeof candidate.startScreen === 'string' && isScreenId(candidate.startScreen)
        ? candidate.startScreen
        : '',
    levelStarts: conformLevelStarts(candidate.levelStarts),
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
