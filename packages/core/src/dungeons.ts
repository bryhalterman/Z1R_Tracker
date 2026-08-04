/**
 * Dungeon (Level) definitions.
 *
 * Vanilla Z1 has fixed overworld entrances and a fixed item per level. The
 * randomizer shuffles both, so the tracker records what you *found* rather
 * than asserting what should be there — `vanilla*` fields are hints only,
 * shown in the `z1` build and hidden in `z1r`.
 */

export interface DungeonDef {
  /** Level number, 1-9. */
  readonly level: number;
  readonly name: string;
  /** Sprite key for the level marker. */
  readonly sprite: string;
  /** Vanilla overworld screen, as an 8x16 grid reference (col,row). Hint only. */
  readonly vanillaScreen: string;
  /** Vanilla major item. Hint only — never used as logic in `z1r`. */
  readonly vanillaItem: string;
  /** Vanilla boss. Hint only. */
  readonly vanillaBoss: string;
}

export const DUNGEONS: readonly DungeonDef[] = [
  {
    level: 1,
    name: 'Eagle',
    sprite: 'dungeon.1',
    vanillaScreen: 'H7',
    vanillaItem: 'bow',
    vanillaBoss: 'Aquamentus',
  },
  {
    level: 2,
    name: 'Moon',
    sprite: 'dungeon.2',
    vanillaScreen: 'M4',
    vanillaItem: 'boomerang',
    vanillaBoss: 'Dodongo',
  },
  {
    level: 3,
    name: 'Manji',
    sprite: 'dungeon.3',
    vanillaScreen: 'D6',
    vanillaItem: 'raft',
    vanillaBoss: 'Manhandla',
  },
  {
    level: 4,
    name: 'Snake',
    sprite: 'dungeon.4',
    vanillaScreen: 'N2',
    vanillaItem: 'ladder',
    vanillaBoss: 'Gleeok',
  },
  {
    level: 5,
    name: 'Lizard',
    sprite: 'dungeon.5',
    vanillaScreen: 'H1',
    vanillaItem: 'recorder',
    vanillaBoss: 'Digdogger',
  },
  {
    level: 6,
    name: 'Dragon',
    sprite: 'dungeon.6',
    vanillaScreen: 'C3',
    vanillaItem: 'rod',
    vanillaBoss: 'Gohma',
  },
  {
    level: 7,
    name: 'Demon',
    sprite: 'dungeon.7',
    vanillaScreen: 'F5',
    vanillaItem: 'boomerang.magical',
    vanillaBoss: 'Aquamentus',
  },
  {
    level: 8,
    name: 'Lion',
    sprite: 'dungeon.8',
    vanillaScreen: 'K6',
    vanillaItem: 'book',
    vanillaBoss: 'Gleeok',
  },
  {
    level: 9,
    name: 'Death Mountain',
    sprite: 'dungeon.9',
    vanillaScreen: 'B1',
    vanillaItem: 'arrow.silver',
    vanillaBoss: 'Ganon',
  },
];

export const DUNGEONS_BY_LEVEL: ReadonlyMap<number, DungeonDef> = new Map(
  DUNGEONS.map((d) => [d.level, d]),
);

/** Levels that award a Triforce piece. Level 9 holds Ganon, not a piece. */
export const TRIFORCE_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Triforce pieces needed before Level 9's entrance opens. */
export const TRIFORCE_REQUIRED_FOR_L9 = 8;
