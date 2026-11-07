/**
 * What a dungeon sheet cell says about its room, worked out without React:
 * the ladder state and every fact the tooltip lists and the accessible name
 * joins.
 */

import {
  DOOR_STATES_BY_ID,
  DUNGEON_BOSSES_BY_ID,
  ROOM_ITEMS_BY_ID,
  ROOM_SIDES,
  ROOM_STAIRS_BY_ID,
  type DoorState,
  type RoomLayoutDef,
  type RoomNote,
  type RoomSide,
} from '@z1r/core';

const SIDE_NAME: Record<RoomSide, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

/** '' for a room with no water, else whether the held Ladder gets you across. */
export type LadderState = '' | 'clear' | 'blocked';

/**
 * Water in the way: the Ladder's sprite in the top-right corner. Once the
 * Ladder is held it stays, dimmed and checked, so the room still reads as one
 * that needed it — and now does not.
 */
export function ladderState(note: RoomNote | undefined, ladderHeld: boolean): LadderState {
  if (!note?.ladder) return '';
  return ladderHeld ? 'clear' : 'blocked';
}

/** A door's name with its tag, so the state reads as words and not as a hue. */
export function doorLabel(state: DoorState): string {
  const def = DOOR_STATES_BY_ID.get(state);
  return def ? `${def.name} (${def.tag})` : state;
}

function visitFact(note: RoomNote): string {
  if (note.visited) return 'visited';
  return note.known ? 'known from the map, not visited' : 'not visited';
}

function itemFacts(note: RoomNote): string[] {
  if (!note.item) return [];
  const name = ROOM_ITEMS_BY_ID.get(note.item)?.name ?? note.item;
  return [`holds ${name}${note.collected ? ', collected' : ''}`];
}

function bossFacts(note: RoomNote): string[] {
  const boss = note.boss ?? '';
  const bossDef = boss ? DUNGEON_BOSSES_BY_ID.get(boss) : undefined;
  return bossDef ? [bossDef.name] : [];
}

/** The staircase, and the transport pair it is half of. */
function stairFacts(note: RoomNote): string[] {
  const facts: string[] = [];
  const stairs = note.stairs ?? 'none';
  const stairDef = stairs === 'none' ? undefined : ROOM_STAIRS_BY_ID.get(stairs);
  if (stairDef) facts.push(`${stairDef.name} (${stairDef.tag})`);
  const transport = note.transport ?? 0;
  if (transport) facts.push(`transport pair ${transport}`);
  return facts;
}

/** Every side whose door is known, on one line. */
function doorFacts(note: RoomNote): string[] {
  const walls = ROOM_SIDES.filter((side) => note.doors[side] !== 'unknown').map(
    (side) => `${SIDE_NAME[side]} ${doorLabel(note.doors[side])}`,
  );
  return walls.length ? [walls.join(', ')] : [];
}

/**
 * Every fact about the room, in words: the tooltip's lines, and joined into
 * one line, the cell's accessible name.
 */
export function roomFacts(
  note: RoomNote | undefined,
  isEntrance: boolean,
  ladder: LadderState,
  layoutDef: RoomLayoutDef | undefined,
): string[] {
  const facts: string[] = [];
  if (isEntrance) facts.push('entrance');
  if (ladder === 'blocked') facts.push('needs the Ladder');
  if (ladder === 'clear') facts.push('needed the Ladder — held, passable now');
  if (layoutDef) facts.push(`${layoutDef.name} layout`);
  if (note) {
    facts.push(
      visitFact(note),
      ...itemFacts(note),
      ...bossFacts(note),
      ...stairFacts(note),
      ...doorFacts(note),
    );
  }
  return facts;
}
