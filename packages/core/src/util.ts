/**
 * Small shared helpers: the number clamps the reducer and `migrate` read
 * values through, the id lookup every definition table is built with, and the
 * grid cell id the overworld, the dungeon sheets and the region map share.
 *
 * No imports, so any module in the package can use them without a cycle.
 */

/**
 * A whole number from 0 to `max`, and 0 for anything that is not whole.
 *
 * How a screen note's level and stairway numbers are read, by the reducer and
 * by `migrate` alike, so the two cannot drift. 0 is a real value for both — a
 * dungeon found but not identified, a stairway not yet numbered — which is why
 * a bad value lands there rather than being refused.
 */
export function clampWhole(value: number, max: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), max) : 0;
}

/**
 * A finite number truncated toward zero and held to 0 through `max`; 0 for
 * anything that is not a finite number, Infinity included.
 *
 * Unlike `clampWhole`, a fraction is truncated rather than read as 0.
 */
export function truncWhole(value: unknown, max = Number.POSITIVE_INFINITY): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value as number), 0), max) : 0;
}

/**
 * `value` truncated toward zero and held to `min` through `max`. NaN reads as 0
 * before the clamp, and Infinity clamps to `max` like any large number.
 */
export function truncClamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value) || 0, min), max);
}

const GRID_ROWS = 'ABCDEFGH';

/**
 * A grid cell's id: a row letter and a column number, as in "C7". `col` and
 * `row` are 1-based; a row outside A-H reads as "?".
 */
export function gridCellId(col: number, row: number): string {
  return `${GRID_ROWS[row - 1] ?? '?'}${col}`;
}

/** A definition list keyed by `id`, for lookups. Later entries win on a repeated id. */
export function byId<T extends { readonly id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((entry) => [entry.id, entry]));
}
