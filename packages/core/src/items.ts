/**
 * Item definitions for The Legend of Zelda (NES) and Zelda 1 Randomizer.
 *
 * Every item carries the sprite *key* it should render with — never a URL.
 * URLs live in `sprites/manifest.json` so the art source can change without
 * touching game data. See docs/SPRITES.md.
 */

export type ItemGroup = 'weapons' | 'equipment' | 'quest' | 'consumables';

/**
 * - `toggle`      have it or not (0 | 1)
 * - `progressive` ordered upgrade chain; state is the index into `stages`
 *
 * There is no counter kind: rupees, keys and hearts are all on the game's own
 * HUD, and re-typing a number the screen already shows is busywork.
 */
export type ItemKind = 'toggle' | 'progressive';

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
  /** Sprite key for `toggle` items. */
  readonly sprite?: string;
  /** Stage 1..n for `progressive` items. Stage 0 is always "not obtained". */
  readonly stages?: readonly ItemStage[];
  /** Shown in the item tooltip. */
  readonly note?: string;
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'sword',
    name: 'Sword',
    kind: 'progressive',
    group: 'weapons',
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
    sprite: 'item.bow',
    note: 'Useless without arrows.',
  },
  {
    id: 'arrow',
    name: 'Arrow',
    kind: 'progressive',
    group: 'weapons',
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
    sprite: 'item.bomb',
  },
  {
    id: 'rod',
    name: 'Magical Rod',
    kind: 'toggle',
    group: 'weapons',
    sprite: 'item.rod',
  },
  {
    id: 'book',
    name: 'Book of Magic',
    kind: 'toggle',
    group: 'weapons',
    sprite: 'item.book',
    note: 'Upgrades the Magical Rod to fire beams.',
  },
  {
    id: 'candle',
    name: 'Candle',
    kind: 'progressive',
    group: 'equipment',
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
    stages: [
      { sprite: 'item.ring.blue', name: 'Blue Ring' },
      { sprite: 'item.ring.red', name: 'Red Ring' },
    ],
  },
  {
    id: 'shield',
    name: 'Magical Shield',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.shield.magical',
    note: 'Bought in shops; blocks projectiles the small shield cannot.',
  },
  {
    id: 'raft',
    name: 'Raft',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.raft',
  },
  {
    id: 'ladder',
    name: 'Step Ladder',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.ladder',
  },
  {
    id: 'recorder',
    name: 'Recorder',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.recorder',
  },
  {
    id: 'bracelet',
    name: 'Power Bracelet',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.bracelet',
  },
  {
    id: 'magicalKey',
    name: 'Magical Key',
    kind: 'toggle',
    group: 'equipment',
    sprite: 'item.key.magical',
  },
  {
    id: 'bait',
    name: 'Bait',
    kind: 'toggle',
    group: 'quest',
    sprite: 'item.bait',
  },
  {
    id: 'letter',
    name: 'Letter',
    kind: 'toggle',
    group: 'quest',
    sprite: 'item.letter',
    note: 'Unlocks potion purchases from the old women.',
  },
  {
    id: 'potion',
    name: 'Potion',
    kind: 'progressive',
    group: 'consumables',
    stages: [
      { sprite: 'item.potion.blue', name: 'Life Potion' },
      { sprite: 'item.potion.red', name: '2nd Potion' },
    ],
  },
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((item) => [item.id, item]),
);

/** Highest value `id` can hold. Toggles cap at 1, progressives at their stage count. */
export function maxValue(def: ItemDef): number {
  switch (def.kind) {
    case 'toggle':
      return 1;
    case 'progressive':
      return def.stages?.length ?? 1;
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
  return def.name;
}
