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
  /**
   * How in-game hints refer to this level, verbatim from the Dungeon Quest
   * tables. Identical across 1st and 2nd Quest — a hint reads as this phrase
   * followed by an overworld region, e.g. "Digdogger gazes… By a Lake".
   * https://z1r.wiki/wiki/Dungeon_Quest
   */
  readonly hint: string;
}

export const DUNGEONS: readonly DungeonDef[] = [
  {
    level: 1,
    name: 'Eagle',
    sprite: 'dungeon.1',
    hint: 'Aquamentus awaits…',
  },
  {
    level: 2,
    name: 'Moon',
    sprite: 'dungeon.2',
    hint: 'Dodongo dwells…',
  },
  {
    level: 3,
    name: 'Manji',
    sprite: 'dungeon.3',
    hint: 'Manhandla threatens…',
  },
  {
    level: 4,
    name: 'Snake',
    sprite: 'dungeon.4',
    hint: 'Gleeok lurks…',
  },
  {
    level: 5,
    name: 'Lizard',
    sprite: 'dungeon.5',
    hint: 'Digdogger gazes…',
  },
  {
    level: 6,
    name: 'Dragon',
    sprite: 'dungeon.6',
    hint: 'Gohma creeps…',
  },
  {
    level: 7,
    name: 'Demon',
    sprite: 'dungeon.7',
    hint: 'Goriya grumbles…',
  },
  {
    level: 8,
    name: 'Lion',
    sprite: 'dungeon.8',
    hint: 'Gleeok returns…',
  },
  {
    level: 9,
    name: 'Death Mountain',
    sprite: 'dungeon.9',
    hint: '…is an entrance to death',
  },
];

export const DUNGEONS_BY_LEVEL: ReadonlyMap<number, DungeonDef> = new Map(
  DUNGEONS.map((d) => [d.level, d]),
);

/** Triforce pieces needed before Level 9's entrance opens. */
export const TRIFORCE_REQUIRED_FOR_L9 = 8;

/**
 * Levels that actually hold a piece — 1 to 8. Level 9 holds Ganon.
 *
 * Counting has to be restricted to these. `state.dungeons` is keyed by level
 * and carries an entry for 9 as well, so summing the whole map lets a save with
 * Level 9 flagged reach eight with only seven real pieces.
 */
export function holdsTriforcePiece(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= TRIFORCE_REQUIRED_FOR_L9;
}
