/**
 * Overworld grid model.
 *
 * The Z1 overworld is a fixed 16x8 grid of screens. Columns are numbered 1-16
 * left to right, rows are lettered A-H top to bottom, so the starting screen
 * (bottom-centre, where the first cave sits) is `H8`. Screen ids are stable
 * across vanilla and randomizer because the *map* never shuffles — only what
 * sits on each screen does.
 */

export const OVERWORLD_COLUMNS = 16;
export const OVERWORLD_ROWS = 8;

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** `col` is 1-based (1-16), `row` is 1-based (1-8). */
export function screenId(col: number, row: number): string {
  const label = ROW_LABELS[row - 1] ?? '?';
  return `${label}${col}`;
}

const SCREEN_ID_SET: ReadonlySet<string> = new Set(allScreenIds());

/** True for the 128 screens that exist. */
export function isScreenId(id: string): boolean {
  return SCREEN_ID_SET.has(id);
}

export function allScreenIds(): string[] {
  const ids: string[] = [];
  for (let row = 1; row <= OVERWORLD_ROWS; row++) {
    for (let col = 1; col <= OVERWORLD_COLUMNS; col++) {
      ids.push(screenId(col, row));
    }
  }
  return ids;
}

/**
 * What a player wants to record on a screen. `cycleMark` walks this list in
 * order on left-click and backwards on right-click, which is how every
 * randomizer tracker people already use behaves.
 */
export type MarkKind =
  | 'none'
  | 'dungeon'
  | 'shop'
  | 'item'
  | 'gamble'
  | 'hintroom'
  | 'doorRepair'
  | 'rupeeSecret'
  | 'stairway'
  | 'visited';

export interface MarkDef {
  readonly kind: MarkKind;
  readonly name: string;
  /** Sprite key; `none` renders nothing. */
  readonly sprite: string | null;
  /** Fallback colour used by the glyph renderer when no sprite URL is set. */
  readonly color: string;
}

/*
 * Three marks, not ten.
 *
 * The rest — bombable, burnable, pushable, warp, heart, checked — described the
 * *terrain*, which the map image behind each cell already shows, and which does
 * not change between seeds. What the randomizer moves is where the dungeons and
 * shops are, so those are what a tracker has to record. Each of the two now
 * carries detail of its own, which is worth far more than another icon: which
 * dungeon, and what the shop sells.
 */
export const MARKS: readonly MarkDef[] = [
  { kind: 'none', name: 'Unmarked', sprite: null, color: 'transparent' },
  { kind: 'dungeon', name: 'Dungeon', sprite: 'mark.dungeon', color: '#c34a4a' },
  { kind: 'shop', name: 'Shop', sprite: 'mark.shop', color: '#3f8fd0' },
  { kind: 'item', name: 'Item', sprite: 'mark.item', color: '#d9a441' },
  // The other two things a cave can be. Both are worth a second visit — a
  // gambling room once the rupees are spare, a hint room the moment you have
  // forgotten what it said — and neither is an item, a shop or a dead end.
  { kind: 'gamble', name: 'Gambling', sprite: 'mark.gamble', color: '#4bb572' },
  { kind: 'hintroom', name: 'Hint room', sprite: 'mark.hintroom', color: '#9b7fd4' },
  // The two money caves, from bryhalterman/Z1R_Tracker#1. A door repair is
  // worth marking so you do not walk into it twice; a rupee secret so you can
  // come back for it when broke, and it carries its size — see `SECRET_SIZES`.
  { kind: 'doorRepair', name: 'Door repair', sprite: 'mark.doorRepair', color: '#b8763a' },
  { kind: 'rupeeSecret', name: 'Rupee secret', sprite: 'mark.rupeeSecret', color: '#4fa3e0' },
  // The four warp staircases. Each carries its number, 1-4, because the four
  // look alike and the number is the only thing that says which one you just
  // came out of — so this mark has a detail row like a dungeon's.
  { kind: 'stairway', name: 'Warp', sprite: 'mark.stairway', color: '#2fb0a6' },
  // "Been here, nothing to come back for" is as worth recording as a find —
  // without it every unmarked screen is ambiguous between unchecked and empty,
  // which is most of the map for most of a run.
  { kind: 'visited', name: 'Checked, nothing', sprite: 'mark.empty', color: '#8e8e8e' },
];

/**
 * How many warp staircases a seed has.
 *
 * Counted, not enforced. The map shows found-of-four so the set can be seen to
 * be complete; a rule that refused a fifth mark would be asserting an invariant
 * across every seed and settings combination, and would fight the player over
 * it when wrong.
 */
export const OVERWORLD_STAIRWAY_COUNT = 4;

/**
 * How big a rupee secret is.
 *
 * The three tiers https://z1r.wiki/wiki/Secrets uses. The amounts themselves
 * are randomized per seed under Shuffle Shop Items, so the tier is what can be
 * recorded; `range` is the wiki's randomized range, for the tooltip.
 */
export type SecretSize = '' | 'small' | 'medium' | 'large';

export interface SecretSizeDef {
  readonly id: Exclude<SecretSize, ''>;
  readonly name: string;
  /** One letter, drawn on the map cell under the mark. */
  readonly code: string;
  readonly range: string;
}

export const SECRET_SIZES: readonly SecretSizeDef[] = [
  { id: 'small', name: 'Small', code: 'S', range: '1–20' },
  { id: 'medium', name: 'Medium', code: 'M', range: '25–40' },
  { id: 'large', name: 'Large', code: 'L', range: '50–150' },
];

export const SECRET_SIZES_BY_ID: ReadonlyMap<string, SecretSizeDef> = new Map(
  SECRET_SIZES.map((entry) => [entry.id, entry]),
);

/**
 * Shop stock worth remembering.
 *
 * Not a full price list — the point is "did I see arrows anywhere?", asked
 * hours later when the bow finally turns up. Anything you would not backtrack
 * across the map for does not belong here.
 */
export interface ShopStockDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Two-letter tag, so the stock reads without relying on the icons. */
  readonly code: string;
}

export const SHOP_STOCK: readonly ShopStockDef[] = [
  { id: 'bomb', name: 'Bombs', sprite: 'item.bomb', code: 'BM' },
  { id: 'key', name: 'Keys', sprite: 'item.key', code: 'KY' },
  { id: 'arrow', name: 'Arrows', sprite: 'item.arrow.wood', code: 'AR' },
  { id: 'potion', name: 'Potion', sprite: 'item.potion.blue', code: 'PO' },
  // The one piece of real progression sold rather than found, and the one you
  // most want to be able to find your way back to once the rupees are in.
  { id: 'blueRing', name: 'Blue Ring', sprite: 'item.ring.blue', code: 'BR' },
  { id: 'bait', name: 'Meat', sprite: 'item.bait', code: 'MT' },
  { id: 'heart', name: 'Heart Container', sprite: 'item.heart', code: 'HC' },
  { id: 'magicalShield', name: 'Magical Shield', sprite: 'item.shield.magical', code: 'MS' },
  // Sold in the Blue Candle Shop by default (https://z1r.wiki/wiki/Shops).
  { id: 'blueCandle', name: 'Blue Candle', sprite: 'item.candle.blue', code: 'BC' },
];

export const SHOP_STOCK_BY_ID: ReadonlyMap<string, ShopStockDef> = new Map(
  SHOP_STOCK.map((entry) => [entry.id, entry]),
);

/**
 * What is stopping you getting further into a dungeon you have already found.
 *
 * The question this answers is "can I finish that one yet?", asked from the
 * overworld with a new item in hand. Without it you go back in to find out, and
 * the answer is usually no.
 *
 * These are the five things that actually turn you around in Z1R. Enemies you
 * fight; a locked door with no key, water with no ladder, a wall with no bombs,
 * an eye with no bow or a Digdogger with no recorder simply end the trip.
 */
export interface DungeonBlockDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Two letters, so the tag reads without depending on the icons. */
  readonly code: string;
}

export const DUNGEON_BLOCKS: readonly DungeonBlockDef[] = [
  { id: 'key', name: 'Locked door', sprite: 'item.key.magical', code: 'KY' },
  { id: 'bomb', name: 'Bomb wall', sprite: 'item.bomb', code: 'BM' },
  { id: 'ladder', name: 'Ladder gap', sprite: 'item.ladder', code: 'LD' },
  { id: 'bow', name: 'Needs the Bow', sprite: 'item.bow', code: 'BW' },
  { id: 'recorder', name: 'Needs the Recorder', sprite: 'item.recorder', code: 'RC' },
];

export const DUNGEON_BLOCKS_BY_ID: ReadonlyMap<string, DungeonBlockDef> = new Map(
  DUNGEON_BLOCKS.map((entry) => [entry.id, entry]),
);

/**
 * The named overworld spot whose item needs the Ladder.
 *
 * This used to be a hardcoded screen id, which was a guess about where the
 * coast ledge sits and wrong the moment a seed moved it. It is keyed off the
 * spot the player tags instead, so the "you can reach it now" hint follows
 * whichever screen they actually marked.
 */
export const COAST_SPOT_ID = 'ow.coast';

/** The item the coast ledge is only reachable with. */
export const COAST_ITEM_REQUIRES = 'ladder';

export const MARKS_BY_KIND: ReadonlyMap<MarkKind, MarkDef> = new Map(
  MARKS.map((m) => [m.kind, m]),
);

const MARK_ORDER: readonly MarkKind[] = MARKS.map((m) => m.kind);

export function cycleMark(current: MarkKind, direction: 1 | -1 = 1): MarkKind {
  const index = MARK_ORDER.indexOf(current);
  const next = (index + direction + MARK_ORDER.length) % MARK_ORDER.length;
  return MARK_ORDER[next] ?? 'none';
}
