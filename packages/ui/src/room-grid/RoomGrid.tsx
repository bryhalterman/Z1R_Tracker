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
  ROOM_COLUMNS,
  ROOM_ITEMS_BY_ID,
  ROOM_LAYOUTS_BY_ID,
  ROOM_ROWS,
  ROOM_SIDES,
  roomId,
  type RoomNote,
  type RoomSide,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { SpriteArt } from '../shared/Sprite.js';
import { LayoutArt } from '../room-card/LayoutArt.js';
import { CellTip } from './CellTip.js';
import { dropTarget } from '../shared/drop-target.js';
import { ladderState, roomFacts } from './room-facts.js';

/** Edge class suffixes, matching the `.n .e .s .w` hooks OBS CSS is written against. */
const SIDE_CLASS: Record<RoomSide, string> = {
  north: 'n',
  east: 'e',
  south: 's',
  west: 'w',
};

/** Rendered edge length of the item sprite riding above it. */
const MARK_ART_SIZE = 15;

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
  readonly resolver: SpriteResolver;
  /** A click on a room: the panel decides whether that selects, cycles or drops. */
  readonly onTouch: (room: string) => void;
  /** Whether what is being dragged from the palette can land in a room. */
  readonly canDrop: () => boolean;
}

const ROOM_IDS: readonly string[] = Array.from({ length: ROOM_ROWS * ROOM_COLUMNS }, (_, index) =>
  roomId((index % ROOM_COLUMNS) + 1, Math.floor(index / ROOM_COLUMNS) + 1),
);

export function RoomGrid({ state, level, selected, resolver, onTouch, canDrop }: RoomGridProps) {
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
  resolver,
  onTouch,
  canDrop,
}: RoomCellProps) {
  const ladder = ladderState(note, ladderHeld);
  const layoutDef = note?.layout ? ROOM_LAYOUTS_BY_ID.get(note.layout) : undefined;
  const collected = !!note?.item && note.collected;
  const facts = roomFacts(note, isEntrance, ladder, layoutDef);
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
        data-ladder={ladder}
        data-collected={String(collected)}
        aria-current={isSelected ? 'true' : 'false'}
        aria-label={label}
        onClick={() => onTouch(id)}
        {...dropTarget(canDrop, () => onTouch(id))}
      >
        <RoomDoors note={note} />
        <RoomMarks note={note} resolver={resolver} />
        {/* A collected item's corner check: a shape, so it does not rest on colour. */}
        <span className="z1r-room-got" aria-hidden="true" hidden={!collected}>
          ✓
        </span>
        {/* The level's entrance: the overworld's start pennant, one per level. */}
        <span className="z1r-room-start">
          {isEntrance && <SpriteArt resolver={resolver} spriteKey="mark.start" size={14} />}
        </span>
        <span className="z1r-room-ladder">
          {ladder && <SpriteArt resolver={resolver} spriteKey="item.ladder" size={14} />}
          {ladder === 'clear' && <span className="z1r-room-ladder-ok">✓</span>}
        </span>
        {/* The room's layout, faint across the floor under everything else. */}
        <span className="z1r-room-layout">
          {layoutDef && <LayoutArt def={layoutDef} className="z1r-room-layout-art" />}
        </span>
        <RoomFlags note={note} />
      </TooltipTrigger>
      <TooltipContent className="z1r-ui max-w-64">
        <CellTip heading={`Level ${level} · ${id}`} lines={facts} />
      </TooltipContent>
    </Tooltip>
  );
});

/*
 * The doorways, drawn and nothing more. The compass on the room card is the
 * one way to set a door, so these take no clicks and are hidden from
 * assistive tech: the cell's own label names every known side.
 */
function RoomDoors({ note }: { note: RoomNote | undefined }) {
  return ROOM_SIDES.map((side) => (
    <span
      key={side}
      className={`z1r-room-door ${SIDE_CLASS[side]}`}
      data-side={SIDE_CLASS[side]}
      data-door={note?.doors[side] ?? 'unknown'}
      aria-hidden="true"
    />
  ));
}

/** The middle of the cell: the staircase, the transport pair and the item. */
function RoomMarks({ note, resolver }: { note: RoomNote | undefined; resolver: SpriteResolver }) {
  const stairs = note?.stairs ?? 'none';
  const transport = note?.transport ?? 0;
  const itemDef = note?.item ? ROOM_ITEMS_BY_ID.get(note.item) : undefined;
  return (
    <span className="z1r-room-mark">
      {/* Drawn shapes, not tints, so the two kinds of staircase read apart
          without colour. */}
      {stairs === 'item' && (
        <SpriteArt
          resolver={resolver}
          spriteKey="ui.stairs"
          size={MARK_ART_SIZE}
          className="z1r-room-stairs"
        />
      )}
      {transport ? <span className="z1r-room-transport">{transport}</span> : null}
      {itemDef && <SpriteArt resolver={resolver} spriteKey={itemDef.sprite} size={MARK_ART_SIZE} />}
    </span>
  );
}

/** The corner marks: a boss, and a push block suspected or tried. */
function RoomFlags({ note }: { note: RoomNote | undefined }) {
  const boss = note?.boss ?? '';
  const push = note?.pushBlock ?? '';
  return (
    <span className="z1r-room-flags" aria-hidden="true">
      {boss && <Flag kind="boss" />}
      {push && <Flag kind={push === 'maybe' ? 'push-maybe' : 'push-checked'} />}
    </span>
  );
}
