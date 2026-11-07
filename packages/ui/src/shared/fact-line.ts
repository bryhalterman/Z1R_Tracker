/**
 * A cell's or tile's facts as one line: what it is, then a fact at a time.
 *
 * The map screens, the dungeon rooms and the palette tiles each list their
 * facts one per line in a tooltip; joined with this, the same facts are the
 * element's accessible name, so the two never say different things.
 */
export function factLine(parts: readonly string[]): string {
  return parts.join(' — ');
}
