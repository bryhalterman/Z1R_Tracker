/**
 * Item definitions for The Legend of Zelda (NES) and Zelda 1 Randomizer.
 *
 * Every item carries the sprite *key* it should render with — never a URL.
 * URLs live in `sprites/manifest.json` so the art source can change without
 * touching game data. See docs/SPRITES.md.
 */

export type Game = 'z1' | 'z1r';

export type ItemGroup = 'weapons' | 'equipment' | 'quest' | 'consumables';

/**
 * - `toggle`      have it or not (0 | 1)
 * - `progressive` ordered upgrade chain; state is the index into `stages`
 * - `counter`     numeric, clamped to `max`
 */
export type ItemKind = 'toggle' | 'progressive' | 'counter';

export interface ItemStage {
  /** Sprite key for this stage. */
  readonly sprite: string;
  readonly name: string;
}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly kind: ItemKind;
  readonly group: ItemGroup;
  /** Which builds show this item. Vanilla-only helpers are hidden in `z1r`. */
  readonly games: readonly Game[];
  /** Sprite key for `toggle` and `counter` items. */
  readonly sprite?: string;
  /** Stage 1..n for `progressive` items. Stage 0 is always "not obtained". */
  readonly stages?: readonly ItemStage[];
  /** Upper bound for `counter` items. */
  readonly max?: number;
  /** Shown in the item tooltip. */
  readonly note?: string;
}

const BOTH: readonly Game[] = ['z1', 'z1r'];

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'sword',
    name: 'Sword',
    kind: 'progressive',
    group: 'weapons',
    games: BOTH,
    stages: [
      { sprite: 'item.sword.wood', name: 'Wooden Sword' },
      { sprite: 'item.sword.white', name: 'White Sword' },
      { sprite: 'item.sword.magical', name: 'Magical Sword' },
    ],
  },
  {
    id: 'bow',
    name: 'Bow',
    kind: 'toggle',
    group: 'weapons',
    games: BOTH,
    sprite: 'item.bow',
    note: 'Useless without arrows.',
  },
  {
    id: 'arrow',
    name: 'Arrow',
    kind: 'progressive',
    group: 'weapons',
    games: BOTH,
    stages: [
      { sprite: 'item.arrow.wood', name: 'Wooden Arrow' },
      { sprite: 'item.arrow.silver', name: 'Silver Arrow' },
    ],
    note: 'Silver Arrow is required to finish Ganon.',
  },
  {
    id: 'boomerang',
    name: 'Boomerang',
    kind: 'progressive',
    group: 'weapons',
    games: BOTH,
    stages: [
      { sprite: 'item.boomerang.wood', name: 'Boomerang' },
      { sprite: 'item.boomerang.magical', name: 'Magical Boomerang' },
    ],
  },
  {
    id: 'bomb',
    name: 'Bombs',
    kind: 'toggle',
    group: 'weapons',
    games: BOTH,
    sprite: 'item.bomb',
  },
  {
    id: 'rod',
    name: 'Magical Rod',
    kind: 'toggle',
    group: 'weapons',
    games: BOTH,
    sprite: 'item.rod',
  },
  {
    id: 'book',
    name: 'Book of Magic',
    kind: 'toggle',
    group: 'weapons',
    games: BOTH,
    sprite: 'item.book',
    note: 'Upgrades the Magical Rod to fire beams.',
  },
  {
    id: 'candle',
    name: 'Candle',
    kind: 'progressive',
    group: 'equipment',
    games: BOTH,
    stages: [
      { sprite: 'item.candle.blue', name: 'Blue Candle' },
      { sprite: 'item.candle.red', name: 'Red Candle' },
    ],
  },
  {
    id: 'ring',
    name: 'Ring',
    kind: 'progressive',
    group: 'equipment',
    games: BOTH,
    stages: [
      { sprite: 'item.ring.blue', name: 'Blue Ring' },
      { sprite: 'item.ring.red', name: 'Red Ring' },
    ],
  },
  {
    id: 'raft',
    name: 'Raft',
    kind: 'toggle',
    group: 'equipment',
    games: BOTH,
    sprite: 'item.raft',
  },
  {
    id: 'ladder',
    name: 'Step Ladder',
    kind: 'toggle',
    group: 'equipment',
    games: BOTH,
    sprite: 'item.ladder',
  },
  {
    id: 'recorder',
    name: 'Recorder',
    kind: 'toggle',
    group: 'equipment',
    games: BOTH,
    sprite: 'item.recorder',
  },
  {
    id: 'bracelet',
    name: 'Power Bracelet',
    kind: 'toggle',
    group: 'equipment',
    games: BOTH,
    sprite: 'item.bracelet',
  },
  {
    id: 'magicalKey',
    name: 'Magical Key',
    kind: 'toggle',
    group: 'equipment',
    games: BOTH,
    sprite: 'item.key.magical',
  },
  {
    id: 'bait',
    name: 'Bait',
    kind: 'toggle',
    group: 'quest',
    games: BOTH,
    sprite: 'item.bait',
  },
  {
    id: 'letter',
    name: 'Letter',
    kind: 'toggle',
    group: 'quest',
    games: BOTH,
    sprite: 'item.letter',
    note: 'Unlocks potion purchases from the old women.',
  },
  {
    id: 'potion',
    name: 'Potion',
    kind: 'progressive',
    group: 'consumables',
    games: BOTH,
    stages: [
      { sprite: 'item.potion.blue', name: 'Life Potion' },
      { sprite: 'item.potion.red', name: '2nd Potion' },
    ],
  },
  {
    id: 'heartContainers',
    name: 'Heart Containers',
    kind: 'counter',
    group: 'consumables',
    games: BOTH,
    sprite: 'item.heart',
    max: 16,
  },
  {
    id: 'keys',
    name: 'Keys',
    kind: 'counter',
    group: 'consumables',
    games: BOTH,
    sprite: 'item.key',
    max: 99,
  },
  {
    id: 'rupees',
    name: 'Rupees',
    kind: 'counter',
    group: 'consumables',
    games: BOTH,
    sprite: 'item.rupee',
    max: 255,
  },
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((item) => [item.id, item]),
);

export function itemsForGame(game: Game): readonly ItemDef[] {
  return ITEMS.filter((item) => item.games.includes(game));
}

/** Highest value `id` can hold. Toggles cap at 1, progressives at their stage count. */
export function maxValue(def: ItemDef): number {
  switch (def.kind) {
    case 'toggle':
      return 1;
    case 'progressive':
      return def.stages?.length ?? 1;
    case 'counter':
      return def.max ?? 99;
  }
}

/**
 * Sprite key to draw for `value`. Returns the *first* stage sprite for an
 * unobtained progressive item so the grid shows a dimmed silhouette rather
 * than an empty cell.
 */
export function spriteFor(def: ItemDef, value: number): string {
  if (def.kind === 'progressive') {
    const stages = def.stages ?? [];
    const index = Math.min(Math.max(value, 1), stages.length) - 1;
    return stages[index]?.sprite ?? 'unknown';
  }
  return def.sprite ?? 'unknown';
}

/** Human label for the current value, e.g. "Magical Sword" or "Bombs". */
export function labelFor(def: ItemDef, value: number): string {
  if (def.kind === 'progressive' && value > 0) {
    const stages = def.stages ?? [];
    return stages[Math.min(value, stages.length) - 1]?.name ?? def.name;
  }
  if (def.kind === 'counter') {
    return `${def.name}: ${value}`;
  }
  return def.name;
}
