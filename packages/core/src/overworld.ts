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
export type MarkKind =
  | 'none'
  | 'dungeon'
  | 'shop'
  | 'heart'
  | 'item'
  | 'bombable'
  | 'burnable'
  | 'pushable'
  | 'warp'
  | 'empty';

export interface MarkDef {
  readonly kind: MarkKind;
  readonly name: string;
  /** Sprite key; `none` renders nothing. */
  readonly sprite: string | null;
  /** Fallback colour used by the glyph renderer when no sprite URL is set. */
  readonly color: string;
}

export const MARKS: readonly MarkDef[] = [
  { kind: 'none', name: 'Unmarked', sprite: null, color: 'transparent' },
  { kind: 'dungeon', name: 'Dungeon', sprite: 'mark.dungeon', color: '#c34a4a' },
  { kind: 'shop', name: 'Shop', sprite: 'mark.shop', color: '#3f8fd0' },
  { kind: 'heart', name: 'Heart Container', sprite: 'mark.heart', color: '#e05c7a' },
  { kind: 'item', name: 'Item', sprite: 'mark.item', color: '#d9a441' },
  { kind: 'bombable', name: 'Bombable', sprite: 'mark.bombable', color: '#8e8e8e' },
  { kind: 'burnable', name: 'Burnable', sprite: 'mark.burnable', color: '#e2762f' },
  { kind: 'pushable', name: 'Pushable', sprite: 'mark.pushable', color: '#7a6a52' },
  { kind: 'warp', name: 'Warp', sprite: 'mark.warp', color: '#8f5cc4' },
  { kind: 'empty', name: 'Checked / Nothing', sprite: 'mark.empty', color: '#3a3a3a' },
];

export const MARKS_BY_KIND: ReadonlyMap<MarkKind, MarkDef> = new Map(
  MARKS.map((m) => [m.kind, m]),
);

const MARK_ORDER: readonly MarkKind[] = MARKS.map((m) => m.kind);

export function cycleMark(current: MarkKind, direction: 1 | -1 = 1): MarkKind {
  const index = MARK_ORDER.indexOf(current);
  const next = (index + direction + MARK_ORDER.length) % MARK_ORDER.length;
  return MARK_ORDER[next] ?? 'none';
}
