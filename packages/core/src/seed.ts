/**
 * Seed metadata and the randomizer settings that change what the tracker shows.
 *
 * Z1R has far more flags than are modelled here. The line drawn is deliberate:
 * a setting gets a typed field **only if it changes the tracker's structure**
 * — how many item slots a dungeon has, what kind they are, or which named
 * locations exist. Everything else is cosmetic or combat-affecting and lives
 * in the free-text `flags` string, which round-trips untouched.
 *
 * Item counts and slot kinds come from the Dungeon Quest tables at
 * https://z1r.wiki/wiki/Dungeon_Quest
 */

import { DUNGEONS } from './dungeons.js';

/** https://z1r.wiki/wiki/Dungeon_Quest */
export type DungeonQuest =
  | '1st'
  | '2nd'
  | 'mixed'
  | 'shapes'
  | 'mixed-shapes'
  | 'random-no-shapes'
  | 'random';

export const DUNGEON_QUESTS: readonly { value: DungeonQuest; label: string }[] = [
  { value: '1st', label: '1st Quest' },
  { value: '2nd', label: '2nd Quest' },
  { value: 'mixed', label: 'Mixed Quest' },
  { value: 'shapes', label: 'Shapes' },
  { value: 'mixed-shapes', label: 'Mixed + Shapes' },
  { value: 'random-no-shapes', label: 'Random No Shapes' },
  { value: 'random', label: 'Random' },
];

/** https://z1r.wiki/wiki/Dungeon_Items_(Flags) — "Item Shuffle" dropdown. */
export type ItemShuffle = 'none' | 'dungeon' | 'anywhere-hearts-in-dungeons' | 'items-hearts' | 'random';

export const ITEM_SHUFFLES: readonly { value: ItemShuffle; label: string; note: string }[] = [
  { value: 'none', label: 'None', note: 'Everything in vanilla locations' },
  { value: 'dungeon', label: 'Dungeon Items', note: 'Heart on floor of each dungeon' },
  {
    value: 'anywhere-hearts-in-dungeons',
    label: 'Items Anywhere, Hearts within Dungeons',
    note: '1 heart per dungeon 1-8, may be in a stair',
  },
  { value: 'items-hearts', label: 'Items + Hearts', note: 'Full shuffle of all hearts and items' },
  { value: 'random', label: 'Random', note: 'Randomizer picks one of the above' },
];

/** Either concrete quest a level's layout can resolve to. */
export type ConcreteQuest = '1st' | '2nd';

export interface SeedSettings {
  /** Seed number or string, as shown in the randomizer. */
  seed: string;
  /** The full flag string. Stored verbatim; never parsed. */
  flags: string;
  dungeonQuest: DungeonQuest;
  itemShuffle: ItemShuffle;
  /** Triforce / hearts / keys / compass / map join the shuffle. */
  shuffleDungeonDrops: boolean;
  /** Bomb / rupee / key drops join the shuffle — allows extra floor items. */
  shuffleMinorDrops: boolean;
  /** Ladder, raft, bracelet, recorder, bow (and wand when swordless) may be in L9. */
  importantItemsIn9: boolean;
  /** Mirrored Overworld flips the map left-to-right — and the hint regions with it. */
  mirroredOverworld: boolean;
  /**
   * Which quest levels 1-6 turned out to be, and 7-9 respectively. Fixed
   * quests derive these; Mixed and the Random options can't be known until
   * you're in the seed, so the player sets them as they find out.
   */
  questLow: ConcreteQuest;
  questHigh: ConcreteQuest;
  notes: string;
}

export function createSeedSettings(): SeedSettings {
  return {
    seed: '',
    flags: '',
    dungeonQuest: '1st',
    itemShuffle: 'items-hearts',
    shuffleDungeonDrops: true,
    shuffleMinorDrops: false,
    importantItemsIn9: false,
    mirroredOverworld: false,
    questLow: '1st',
    questHigh: '1st',
    notes: '',
  };
}

/**
 * True when the quest split is the player's to record rather than implied by
 * the setting. Mixed splits 1-6 and 7-9 across both quests; the Random options
 * aren't known until the seed is opened.
 */
export function questIsAmbiguous(quest: DungeonQuest): boolean {
  return quest === 'mixed' || quest === 'mixed-shapes' || quest === 'random-no-shapes' || quest === 'random';
}

/** Mixed guarantees 1-6 and 7-9 come from *different* quests. */
export function questsMustDiffer(quest: DungeonQuest): boolean {
  return quest === 'mixed' || quest === 'mixed-shapes';
}

/** The quest whose item layout a given level follows. */
export function questForLevel(settings: SeedSettings, level: number): ConcreteQuest {
  switch (settings.dungeonQuest) {
    case '1st':
      return '1st';
    case '2nd':
      return '2nd';
    // "Shapes will always follow First Quest logic for items and Triforce placement."
    case 'shapes':
      return '1st';
    default:
      return level <= 6 ? settings.questLow : settings.questHigh;
  }
}

export type SlotKind = 'floor' | 'stair';

/**
 * Item slots per level, per quest, from the Dungeon Quest tables.
 * Level 9 is the only dungeon with no Heart Container.
 */
const QUEST_SLOTS: Record<ConcreteQuest, Record<number, readonly SlotKind[]>> = {
  '1st': {
    1: ['floor', 'stair'],
    2: ['floor'],
    3: ['stair'],
    4: ['stair'],
    5: ['stair'],
    6: ['stair'],
    7: ['stair'],
    8: ['stair', 'stair'],
    9: ['stair', 'stair'],
  },
  '2nd': {
    1: ['floor'],
    2: ['stair'],
    3: ['floor'],
    4: ['stair', 'stair'],
    5: ['stair'],
    6: ['stair'],
    7: ['stair'],
    8: ['stair', 'stair'],
    9: ['stair', 'stair'],
  },
};

/** Level 9 has no Heart Container in either quest. */
export function hasHeartContainer(level: number): boolean {
  return level !== 9;
}

export function slotsForLevel(settings: SeedSettings, level: number): readonly SlotKind[] {
  return QUEST_SLOTS[questForLevel(settings, level)][level] ?? [];
}

/* --------------------------------------------------------------- locations */

export type LocationKind = 'floor' | 'stair' | 'heart' | 'overworld';

export interface LocationDef {
  /** Stable id; also the state key. */
  readonly id: string;
  readonly label: string;
  readonly kind: LocationKind;
  /** Present for dungeon locations. */
  readonly level?: number;
  /** Longer explanation for the tooltip. */
  readonly note?: string;
}

/**
 * Named overworld item locations that the randomizer shuffles independently.
 * https://z1r.wiki/wiki/Dungeon_Items_(Flags)
 */
export const OVERWORLD_LOCATIONS: readonly LocationDef[] = [
  {
    id: 'ow.whiteSword',
    label: 'White Sword Cave',
    kind: 'overworld',
    note: 'Gated behind 4-6 Heart Containers depending on the shops flags.',
  },
  { id: 'ow.armos', label: 'Armos', kind: 'overworld', note: 'The item under an Armos statue.' },
  { id: 'ow.coast', label: 'Coast', kind: 'overworld', note: 'The ladder-only spot on the coast.' },
];

/**
 * Every item location this seed contains, in tracking order.
 *
 * Derived from settings rather than stored, so changing the Dungeon Quest
 * re-shapes the list instead of leaving stale slots behind. State keys off
 * `id`, so a slot that disappears keeps its recorded value should the setting
 * be changed back.
 */
export function deriveLocations(
  settings: SeedSettings,
  extraFloorSlots: Readonly<Record<string, number>> = {},
): LocationDef[] {
  const locations: LocationDef[] = [];

  for (const dungeon of DUNGEONS) {
    const level = dungeon.level;
    const slots = slotsForLevel(settings, level);

    let floorIndex = 0;
    let stairIndex = 0;
    for (const kind of slots) {
      const index = kind === 'floor' ? floorIndex++ : stairIndex++;
      locations.push({
        id: `d${level}.${kind}.${index}`,
        label: `L${level} ${kind === 'floor' ? 'floor' : 'stair'}${slots.filter((s) => s === kind).length > 1 ? ` ${index + 1}` : ''}`,
        kind,
        level,
      });
    }

    // "Shuffle Minor Dungeon Drops … can allow multiple major items to be
    // found on the floor", so extra floor slots are addable when it's on.
    const extra = settings.shuffleMinorDrops ? (extraFloorSlots[String(level)] ?? 0) : 0;
    for (let i = 0; i < extra; i++) {
      const index = floorIndex + i;
      locations.push({
        id: `d${level}.floor.${index}`,
        label: `L${level} floor ${index + 1}`,
        kind: 'floor',
        level,
        note: 'Extra floor drop from Shuffle Minor Dungeon Drops.',
      });
    }

    if (hasHeartContainer(level)) {
      locations.push({
        id: `d${level}.heart`,
        label: `L${level} heart`,
        kind: 'heart',
        level,
      });
    }
  }

  locations.push(...OVERWORLD_LOCATIONS);
  return locations;
}

/**
 * A concrete thing the randomizer can place.
 *
 * The wiki's shuffle pool names specific tiers — "Red Candle", not "Candle" —
 * so a pool entry can't just be an item id. It carries the tracker item it
 * grants and the value that item takes, which lets recording *where* something
 * was found also mark that you have it.
 */
export interface PoolEntry {
  readonly id: string;
  readonly name: string;
  /** The `ItemDef` id this grants. */
  readonly itemId: string;
  /** Value to set that item to. Counters increment instead. */
  readonly value: number;
  readonly sprite: string;
}

/**
 * The 15-item shuffle pool, verbatim from the Dungeon Items flags page.
 * https://z1r.wiki/wiki/Dungeon_Items_(Flags)
 */
export const SHUFFLE_POOL: readonly PoolEntry[] = [
  { id: 'book', name: 'Book', itemId: 'book', value: 1, sprite: 'item.book' },
  { id: 'boomerang', name: 'Boomerang', itemId: 'boomerang', value: 1, sprite: 'item.boomerang.wood' },
  { id: 'bow', name: 'Bow', itemId: 'bow', value: 1, sprite: 'item.bow' },
  // Heart Containers are still placeable, but the running total is on the
  // game's own HUD, so there is no inventory item to grant.
  { id: 'heart', name: 'Heart Container', itemId: '', value: 0, sprite: 'item.heart' },
  { id: 'ladder', name: 'Ladder', itemId: 'ladder', value: 1, sprite: 'item.ladder' },
  {
    id: 'magicalBoomerang',
    name: 'Magical Boomerang',
    itemId: 'boomerang',
    value: 2,
    sprite: 'item.boomerang.magical',
  },
  { id: 'magicalKey', name: 'Magical Key', itemId: 'magicalKey', value: 1, sprite: 'item.key.magical' },
  { id: 'bracelet', name: 'Power Bracelet', itemId: 'bracelet', value: 1, sprite: 'item.bracelet' },
  { id: 'raft', name: 'Raft', itemId: 'raft', value: 1, sprite: 'item.raft' },
  { id: 'recorder', name: 'Recorder', itemId: 'recorder', value: 1, sprite: 'item.recorder' },
  { id: 'redCandle', name: 'Red Candle', itemId: 'candle', value: 2, sprite: 'item.candle.red' },
  { id: 'redRing', name: 'Red Ring', itemId: 'ring', value: 2, sprite: 'item.ring.red' },
  { id: 'silverArrow', name: 'Silver Arrow', itemId: 'arrow', value: 2, sprite: 'item.arrow.silver' },
  // The randomizer calls the Magical Rod the "Wand".
  { id: 'wand', name: 'Wand', itemId: 'rod', value: 1, sprite: 'item.rod' },
  { id: 'whiteSword', name: 'White Sword', itemId: 'sword', value: 2, sprite: 'item.sword.white' },
];

export const POOL_BY_ID: ReadonlyMap<string, PoolEntry> = new Map(
  SHUFFLE_POOL.map((entry) => [entry.id, entry]),
);
