/**
 * The dungeon sheet's 8x8 room cells, drawn by React.
 *
 * The markup, class hooks and data attributes are the ones the plain-DOM cells
 * had, so `styles.css` and any OBS custom CSS written against them still
 * apply. What changed is the hover text: a shadcn tooltip with the room as its
 * heading and one fact per line, which also opens on keyboard focus. The same
 * facts, joined into one line, stay the cell's accessible name.
 *
 * The panel (`rooms.ts`) keeps the view state — which level, which room is
 * selected — and what a click does; this only draws.
 */

import { memo } from 'react';
import {
  DOOR_STATES_BY_ID,
  DUNGEON_BOSSES_BY_ID,
  ROOM_COLUMNS,
  ROOM_ITEMS_BY_ID,
  ROOM_LAYOUTS_BY_ID,
  ROOM_ROWS,
  ROOM_SIDES,
  ROOM_STAIRS_BY_ID,
  roomId,
  type DoorState,
  type RoomNote,
  type RoomSide,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { SpriteArt } from '../shared/Sprite.js';
import { LayoutArt } from '../room-card/LayoutArt.js';
import { CellTip } from './CellTip.js';

/** Edge class suffixes, matching the `.n .e .s .w` hooks OBS CSS is written against. */
const SIDE_CLASS: Record<RoomSide, string> = {
  north: 'n',
  east: 'e',
  south: 's',
  west: 'w',
};

const SIDE_NAME: Record<RoomSide, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

/** Rendered edge length of the item sprite riding above it. */
const MARK_ART_SIZE = 15;

/** A door's name with its tag, so the state reads as words and not as a hue. */
function doorLabel(state: DoorState): string {
  const def = DOOR_STATES_BY_ID.get(state);
  return def ? `${def.name} (${def.tag})` : state;
}

type FlagIcon = 'boss' | 'push-maybe' | 'push-checked';

/**
 * The cell's corner marks, each a drawn shape so it reads without colour: a
 * skull, a dashed block for a push block not yet tried, and a solid block with
 * a check cut into it once it has been.
 */
const FLAG_PATHS: Record<FlagIcon, string> = {
  boss:
    'M8 1.5C4.4 1.5 2 4 2 7c0 1.9.9 3.3 2.2 4.1v2.4c0 .6.4 1 1 1h5.6c.6 0 1-.4 1-1v-2.4' +
    'C13.1 10.3 14 8.9 14 7c0-3-2.4-5.5-6-5.5ZM5.5 6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8Z' +
    'M10.5 6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8Z',
  'push-maybe': 'M2.5 2.5h11v11h-11Z',
  'push-checked': 'M2 2h12v12H2ZM4.6 8.2l2.3 2.3 4.6-4.6',
};

function Flag({ kind }: { kind: FlagIcon }) {
  return (
    <svg className={`z1r-room-flag z1r-room-flag-${kind}`} viewBox="0 0 16 16">
      <path d={FLAG_PATHS[kind]} />
    </svg>
  );
}

export interface RoomGridProps {
  readonly state: TrackerState;
  readonly level: number;
  readonly selected: string;
  readonly interactive: boolean;
  readonly resolver: SpriteResolver;
  /** A click on a room: the panel decides whether that selects, cycles or drops. */
  readonly onTouch: (room: string) => void;
  /** Whether what is being dragged from the palette can land in a room. */
  readonly canDrop: () => boolean;
}

const ROOM_IDS: readonly string[] = Array.from({ length: ROOM_ROWS * ROOM_COLUMNS }, (_, index) =>
  roomId((index % ROOM_COLUMNS) + 1, Math.floor(index / ROOM_COLUMNS) + 1),
);

export function RoomGrid({ state, level, selected, interactive, resolver, onTouch, canDrop }: RoomGridProps) {
  const rooms = state.rooms[String(level)] ?? {};
  const entrance = state.levelStarts[String(level)];
  const ladderHeld = (state.items['ladder'] ?? 0) >= 1;
  return (
    <TooltipProvider delay={300}>
      {ROOM_IDS.map((id) => (
        <RoomCell
          key={id}
          id={id}
          level={level}
          note={rooms[id]}
          isEntrance={entrance === id}
          ladderHeld={ladderHeld}
          isSelected={id === selected}
          interactive={interactive}
          resolver={resolver}
          onTouch={onTouch}
          canDrop={canDrop}
        />
      ))}
    </TooltipProvider>
  );
}

interface RoomCellProps {
  readonly id: string;
  readonly level: number;
  readonly note: RoomNote | undefined;
  readonly isEntrance: boolean;
  readonly ladderHeld: boolean;
  readonly isSelected: boolean;
  readonly interactive: boolean;
  readonly resolver: SpriteResolver;
  readonly onTouch: (room: string) => void;
  readonly canDrop: () => boolean;
}

/**
 * One room. Memoised on its own note, so a change to one room redraws one
 * cell: the reducer hands back the same note object for every room it did not
 * touch.
 */
const RoomCell = memo(function RoomCell({
  id,
  level,
  note,
  isEntrance,
  ladderHeld,
  isSelected,
  interactive,
  resolver,
  onTouch,
  canDrop,
}: RoomCellProps) {
  /*
   * Water in the way: the Ladder's sprite in the top-right corner. Once the
   * Ladder is held it stays, dimmed and checked, so the room still reads as one
   * that needed it — and now does not.
   */
  const ladderState = note?.ladder ? (ladderHeld ? 'clear' : 'blocked') : '';
  const layoutDef = note?.layout ? ROOM_LAYOUTS_BY_ID.get(note.layout) : undefined;
  const collected = !!note?.item && note.collected;
  const boss = note?.boss ?? '';
  const push = note?.pushBlock ?? '';
  const stairs = note?.stairs ?? 'none';
  const transport = note?.transport ?? 0;
  const itemDef = note?.item ? ROOM_ITEMS_BY_ID.get(note.item) : undefined;

  // Every fact about the room, in words: the tooltip's lines, and joined into
  // one line, the cell's accessible name.
  const facts: string[] = [];
  if (isEntrance) facts.push('entrance');
  if (ladderState === 'blocked') facts.push('needs the Ladder');
  if (ladderState === 'clear') facts.push('needed the Ladder — held, passable now');
  if (layoutDef) facts.push(`${layoutDef.name} layout`);
  if (note) {
    facts.push(note.visited ? 'visited' : note.known ? 'known from the map, not visited' : 'not visited');
    if (note.item) {
      const name = itemDef?.name ?? note.item;
      facts.push(`holds ${name}${note.collected ? ', collected' : ''}`);
    }
    const bossDef = boss ? DUNGEON_BOSSES_BY_ID.get(boss) : undefined;
    if (bossDef) facts.push(bossDef.name);
    const stairDef = stairs === 'none' ? undefined : ROOM_STAIRS_BY_ID.get(stairs);
    if (stairDef) facts.push(`${stairDef.name} (${stairDef.tag})`);
    if (transport) facts.push(`transport pair ${transport}`);
    const walls = ROOM_SIDES.filter((side) => note.doors[side] !== 'unknown').map(
      (side) => `${SIDE_NAME[side]} ${doorLabel(note.doors[side])}`,
    );
    if (walls.length) facts.push(walls.join(', '));
  }
  const label = [id, ...facts].join(' — ');

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="z1r-room"
        data-room={id}
        data-visited={String(!!note?.visited)}
        data-known={String(!!note?.known)}
        data-start={String(isEntrance)}
        data-ladder={ladderState}
        data-collected={String(collected)}
        aria-current={isSelected ? 'true' : 'false'}
        aria-label={label}
        disabled={!interactive}
        onClick={interactive ? () => onTouch(id) : undefined}
        // A palette drag lands like a click with the item armed: the drag
        // armed it, so the click handler places it.
        onDragEnter={interactive ? (event) => canDrop() && event.preventDefault() : undefined}
        onDragOver={
          interactive
            ? (event) => {
                if (!canDrop()) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }
            : undefined
        }
        onDrop={
          interactive
            ? (event) => {
                event.preventDefault();
                onTouch(id);
              }
            : undefined
        }
      >
        {/*
         * The doorways, drawn and nothing more. The compass on the room card is
         * the one way to set a door, so these take no clicks and are hidden
         * from assistive tech: the cell's own label names every known side.
         */}
        {ROOM_SIDES.map((side) => (
          <span
            key={side}
            className={`z1r-room-door ${SIDE_CLASS[side]}`}
            data-side={SIDE_CLASS[side]}
            data-door={note?.doors[side] ?? 'unknown'}
            aria-hidden="true"
          />
        ))}
        <span className="z1r-room-mark">
          {/* Drawn shapes, not tints, so the two kinds of staircase read apart
              without colour. */}
          {stairs === 'item' && (
            <SpriteArt resolver={resolver} spriteKey="ui.stairs" size={MARK_ART_SIZE} className="z1r-room-stairs" />
          )}
          {transport ? <span className="z1r-room-transport">{transport}</span> : null}
          {itemDef && <SpriteArt resolver={resolver} spriteKey={itemDef.sprite} size={MARK_ART_SIZE} />}
        </span>
        {/* A collected item's corner check: a shape, so it does not rest on colour. */}
        <span className="z1r-room-got" aria-hidden="true" hidden={!collected}>
          ✓
        </span>
        {/* The level's entrance: the overworld's start pennant, one per level. */}
        <span className="z1r-room-start">
          {isEntrance && <SpriteArt resolver={resolver} spriteKey="mark.start" size={14} />}
        </span>
        <span className="z1r-room-ladder">
          {ladderState && <SpriteArt resolver={resolver} spriteKey="item.ladder" size={14} />}
          {ladderState === 'clear' && <span className="z1r-room-ladder-ok">✓</span>}
        </span>
        {/* The room's layout, faint across the floor under everything else. */}
        <span className="z1r-room-layout">
          {layoutDef && <LayoutArt def={layoutDef} className="z1r-room-layout-art" />}
        </span>
        <span className="z1r-room-flags" aria-hidden="true">
          {boss && <Flag kind="boss" />}
          {push && <Flag kind={push === 'maybe' ? 'push-maybe' : 'push-checked'} />}
        </span>
      </TooltipTrigger>
      <TooltipContent className="z1r-ui max-w-64">
        <CellTip heading={`Level ${level} · ${id}`} lines={facts} />
      </TooltipContent>
    </Tooltip>
  );
});
