/**
 * What an overworld screen cell says about its mark, worked out without React:
 * the centred art, the short line under the mark, the shop's columns, and the
 * facts the tooltip lists and the accessible name joins. One describer per
 * mark kind, so a mark's wording lives in one place.
 */

import {
  DUNGEON_BLOCKS_BY_ID,
  OVERWORLD_LOCATIONS,
  POOL_BY_ID,
  SCREEN_ITEMS_BY_ID,
  SECRET_SIZES_BY_ID,
  SHOP_STOCK_BY_ID,
  type MarkDef,
  type MarkKind,
  type PoolEntry,
  type RegionDef,
  type ScreenNote,
} from '@z1r/core';

/**
 * How many stock icons a shop tile draws.
 *
 * A map cell is about 50x34 CSS pixels at dock width, which is three columns of
 * roughly 16px: a 14px sprite and a price of up to three digits under it. A
 * fourth column would be legible as neither. Anything past the third is
 * counted in the corner and spelled out in full in the tooltip.
 */
export const MAX_SHOP_ICONS = 3;

/**
 * Two letters for a cell label.
 *
 * A cell is under 90px and already carries an icon, so anything longer than
 * this wraps or clips. Two letters is enough to tell "RA" from "BO" when you
 * know which handful of items are still missing.
 */
export function shortCode(name: string | undefined): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  // Initials for a two-word name — "White Sword" reads better as WS than WH.
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** The named overworld spot an item screen is, or '' / undefined when it is not one. */
function spotLabel(note: ScreenNote | undefined): string | undefined {
  return note?.spot ? OVERWORLD_LOCATIONS.find((l) => l.id === note.spot)?.label : '';
}

/** The comma-joined `POOL_BY_ID` ids a dungeon cell is handed, as entries. */
export function insideEntries(inside: string): PoolEntry[] {
  return inside
    ? inside
        .split(',')
        .map((entry) => POOL_BY_ID.get(entry))
        .filter((entry): entry is PoolEntry => !!entry)
    : [];
}

export interface ShopView {
  /** Stock ids drawn as icons, capped at `MAX_SHOP_ICONS`. */
  readonly stocked: readonly string[];
  /** How many more the shop sells than the cell draws. */
  readonly overflow: number;
  /** The price under each drawn icon; 0 where none is recorded. */
  readonly prices: readonly number[];
  readonly pricesShown: boolean;
  /** Digits in the widest recorded price, 0 when none is shown. */
  readonly widest: number;
}

/**
 * What this shop sells, capped at what a map cell can hold. Three icons and
 * three prices fill a 50x34 cell exactly; the rest are counted in the corner
 * and listed in full in the tooltip.
 */
export function shopView(mark: MarkKind, note: ScreenNote | undefined): ShopView {
  const stocked = mark === 'shop' ? (note?.shop ?? []).slice(0, MAX_SHOP_ICONS) : [];
  const overflow = mark === 'shop' ? (note?.shop.length ?? 0) - stocked.length : 0;
  const prices = stocked.map((stockId) => note?.shopPrices[stockId] ?? 0);
  const pricesShown = prices.some((price) => price > 0);
  // The widest number decides the type size: three columns of "250" at the
  // normal size would run into each other.
  const widest = pricesShown ? Math.max(...prices.map((price) => (price > 0 ? String(price).length : 0))) : 0;
  return { stocked, overflow, prices, pricesShown, widest };
}

/**
 * The sprite drawn in the middle of the cell, if any.
 *
 * An item screen draws the item, not a generic star. Once you know what is
 * sitting there, the star is telling you nothing the mark did not — and the
 * map is read at a glance, where a sword reads faster than "SW".
 */
export function centredSprite(
  mark: MarkKind,
  note: ScreenNote | undefined,
  def: MarkDef | undefined,
  stockedCount: number,
): string | null | undefined {
  const held = mark === 'item' && note?.item ? SCREEN_ITEMS_BY_ID.get(note.item) : undefined;
  // A dungeon, a warp and a stocked shop draw their own art; none of them
  // wants the centred one as well.
  return mark === 'dungeon' || mark === 'stairway' || stockedCount > 0
    ? undefined
    : (held?.sprite ?? def?.sprite);
}

const DETAIL: Partial<Record<MarkKind, (note: ScreenNote | undefined) => string>> = {
  // Just the blockers — the numeral carries the level.
  dungeon: (note) =>
    (note?.blocks ?? [])
      .map((blockId) => DUNGEON_BLOCKS_BY_ID.get(blockId)?.code ?? '')
      .filter(Boolean)
      .join(' '),
  /*
   * The sprite already says *what* it is, so the label says *where*: "CO"
   * under a boomerang is the coast item. Falls back to the item when the spot
   * is unnamed, and to a bare `?` when neither is known yet.
   */
  item: (note) => {
    const itemName = note?.item ? SCREEN_ITEMS_BY_ID.get(note.item)?.name : '';
    return shortCode(spotLabel(note)) || shortCode(itemName) || '?';
  },
  // The size as one letter, the text channel for it; blank until known.
  rupeeSecret: (note) => (note?.secret ? (SECRET_SIZES_BY_ID.get(note.secret)?.code ?? '') : ''),
};

/** The text under the mark: blockers, a spot code, a secret's size. */
export function screenDetail(mark: MarkKind, note: ScreenNote | undefined): string {
  return DETAIL[mark]?.(note) ?? '';
}

export interface ScreenFactsInput {
  readonly mark: MarkKind;
  readonly note: ScreenNote | undefined;
  readonly def: MarkDef | undefined;
  readonly inside: readonly PoolEntry[];
  /** A warp's staircase lines, `|`-joined; '' for other screens. */
  readonly exits: string;
  readonly isStart: boolean;
  readonly isCoast: boolean;
  readonly coastReady: boolean;
  readonly level9Ready: boolean;
}

type Describer = (cell: ScreenFactsInput) => string[];

function dungeonFacts({ note, inside, level9Ready }: ScreenFactsInput): string[] {
  const facts = [note?.dungeon ? `Level ${note.dungeon}` : 'Dungeon (unidentified)'];
  if (inside.length) facts.push(`holds ${inside.map((entry) => entry.name).join(', ')}`);
  const blocked = (note?.blocks ?? []).map((blockId) => DUNGEON_BLOCKS_BY_ID.get(blockId)?.name ?? blockId);
  if (blocked.length) facts.push(`blocked by ${blocked.join(', ')}`);
  if (level9Ready) facts.push('every Triforce piece held — Level 9 is open');
  return facts;
}

/*
 * Every item, not just the three the cell had room for, with the price
 * beside each one that has it. This is also the tile's non-colour,
 * non-picture channel: a shop reads without recognising a single sprite.
 */
function shopFacts({ note }: ScreenFactsInput): string[] {
  const recorded = note?.shopPrices ?? {};
  const stock = (note?.shop ?? []).map((s) => {
    const name = SHOP_STOCK_BY_ID.get(s)?.name ?? s;
    const price = recorded[s] ?? 0;
    return price > 0 ? `${name} ${price}` : name;
  });
  return [stock.length ? `Shop: ${stock.join(', ')}` : 'Shop'];
}

function itemFacts({ note, isCoast, coastReady }: ScreenFactsInput): string[] {
  const facts = [spotLabel(note) || 'Item'];
  facts.push(note?.item ? (SCREEN_ITEMS_BY_ID.get(note.item)?.name ?? '') : 'contents unknown');
  if (note?.item) facts.push(note.collected ? 'collected' : 'not collected');
  if (isCoast) facts.push(coastReady ? 'Ladder held — reachable now' : 'needs the Ladder');
  return facts;
}

function stairwayFacts({ note, exits }: ScreenFactsInput): string[] {
  const facts = [note?.stairway ? `Warp ${note.stairway}` : 'Warp (unnumbered)'];
  if (exits) facts.push(...exits.split('|'));
  return facts;
}

function rupeeSecretFacts({ note }: ScreenFactsInput): string[] {
  const size = note?.secret ? SECRET_SIZES_BY_ID.get(note.secret) : undefined;
  return [size ? `${size.name} rupee secret` : 'Rupee secret (size unknown)'];
}

const FACTS: Partial<Record<MarkKind, Describer>> = {
  dungeon: dungeonFacts,
  shop: shopFacts,
  item: itemFacts,
  stairway: stairwayFacts,
  rupeeSecret: rupeeSecretFacts,
};

/** Any other mark is its name; an unmarked screen says nothing. */
function plainFacts({ mark, def }: ScreenFactsInput): string[] {
  return def && mark !== 'none' ? [def.name] : [];
}

/**
 * Every fact about the screen, in words: the tooltip's lines, and joined
 * with the screen and region into one line, the cell's accessible name.
 */
export function screenFacts(cell: ScreenFactsInput): string[] {
  const facts = (FACTS[cell.mark] ?? plainFacts)(cell);
  if (cell.isStart) facts.push('start screen');
  return facts;
}

/** The tooltip heading: the screen, and its region when it has one. */
export function screenHeading(id: string, region: RegionDef | undefined): string {
  return region ? `${id} · ${region.name}` : id;
}

/** The cell's accessible name: screen, region and facts on one line. */
export function screenLabel(id: string, region: RegionDef | undefined, facts: readonly string[]): string {
  return [id, ...(region ? [region.name] : []), ...facts].join(' — ');
}
