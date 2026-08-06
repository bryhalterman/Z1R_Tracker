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
export type MarkKind = 'none' | 'dungeon' | 'shop';

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
];

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
  { id: 'key', name: 'Keys', sprite: 'item.key.magical', code: 'KY' },
  { id: 'arrow', name: 'Arrows', sprite: 'item.arrow.wood', code: 'AR' },
  { id: 'potion', name: 'Potion', sprite: 'item.potion.blue', code: 'PO' },
];

export const SHOP_STOCK_BY_ID: ReadonlyMap<string, ShopStockDef> = new Map(
  SHOP_STOCK.map((entry) => [entry.id, entry]),
);

/**
 * The screen holding the coast item, before mirroring.
 *
 * There is exactly one of these and it never moves: an item sat on a ledge on
 * the east coast that nothing but the Ladder reaches. It is called out here
 * rather than left as one more thing to mark because it is the classic "come
 * back later" — you see it long before you can take it, and by the time the
 * Ladder shows up you have forgotten it exists.
 *
 * Mirror this with `mirrorScreen` when the seed flips the overworld.
 */
export const COAST_ITEM_SCREEN = 'F16';

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
