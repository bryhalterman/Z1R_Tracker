/**
 * The room card: everything about the selected room, in React with shadcn/ui.
 *
 * The first piece of the tracker written this way, so it is kept to one job.
 * It reads the whole state and the panel's view state as props and reports
 * every change through `commit`; the panel in `rooms.ts` still owns which room
 * and level are showing, and re-renders the card on every store change. Nothing here keeps a copy of anything the store holds.
 */

import { useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import {
  DOOR_STATES_BY_ID,
  DUNGEON_BOSSES,
  DUNGEON_BOSSES_BY_ID,
  POOL_BY_ID,
  ROOM_FROMS,
  ROOM_ITEMS_BY_ID,
  ROOM_LAYOUTS,
  ROOM_LAYOUTS_BY_ID,
  ROOM_LAYOUT_GROUPS,
  layoutCanHaveStairs,
  layoutCanPush,
  ROOM_PUSH_BLOCKS,
  ROOM_SIDES,
  ROOM_STAIRS,
  bossAllowedOnLevel,
  resolveRoomFrom,
  type Action,
  type DoorState,
  type RoomNote,
  type RoomNotePatch,
  type RoomItemDef,
  type RoomLayoutDef,
  type RoomPushBlock,
  type RoomSide,
  type RoomSlotKind,
  type RoomStairKind,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Button, buttonVariants } from '#components/ui/button';
import { Toggle } from '#components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#components/ui/command';
import { cn } from '#lib/utils';
import { LayoutArt } from './LayoutArt.js';
import { Sprite } from '../shared/Sprite.js';
import { dropTarget } from '../shared/drop-target.js';
import {
  bossTitle,
  collectedTitle,
  itemSlotTitle,
  nextPair,
  pairTitle,
  pairsShown,
  stairTitle,
  visitPatch,
  visitState,
  wipePatch,
} from './room-text.js';

/** Most-met first, so the keys under the left hand are the common ones. */
export const DOOR_ORDER: readonly DoorState[] = ['open', 'locked', 'shutter', 'wall', 'bombed', 'unknown'];

export interface RoomCardProps {
  state: TrackerState;
  level: number;
  /** Room id, or '' with nothing selected. */
  selected: string;
  resolver: SpriteResolver;
  /** Dispatches against the selected room and keeps it selected. */
  commit: (action: Action) => void;
  /** Whether what is being dragged from the palette can land in a room. */
  canDrop: () => boolean;
  /** A palette drag dropped on the item slot: place it in the selected room. */
  onDropItem: () => void;
}

const SIDE_CLASS: Record<RoomSide, string> = { north: 'n', east: 'e', south: 's', west: 'w' };
const SIDE_NAME: Record<RoomSide, string> = { north: 'North', east: 'East', south: 'South', west: 'West' };
const FROM_NAME: Record<RoomSlotKind, string> = { floor: 'Floor', stair: 'Stairs' };
const STAIR_WORD: Record<RoomStairKind, string> = { none: 'None', item: 'To item', transport: 'Transport' };
const PUSH_WORD: Record<RoomPushBlock, string> = { '': 'None', maybe: 'Maybe', checked: 'Checked' };
const PUSH_TITLE: Record<RoomPushBlock, string> = {
  '': 'No push block suspected here',
  maybe: 'A block here might push — not tried yet',
  checked: 'Tried the blocks here',
};

function doorLabel(state: DoorState): string {
  const def = DOOR_STATES_BY_ID.get(state);
  return def ? `${def.name} (${def.tag})` : state;
}

/** A labelled row: the key in a fixed column, the controls wrapping beside it. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
      <span className="pt-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * A two-state chip. The check in front of the label is its non-colour mark;
 * the pressed fill only repeats it.
 */
function CheckToggle({
  label,
  pressed,
  disabled,
  title,
  onPressedChange,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  title?: string;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={pressed}
      disabled={disabled}
      title={title}
      onPressedChange={onPressedChange}
      className="data-[pressed]:border-primary data-[pressed]:text-foreground"
    >
      {pressed ? <CheckIcon data-icon="inline-start" /> : null}
      {label}
    </Toggle>
  );
}

/** Why a row's options are greyed out, in words beside them. */
function NotAvailable({ reason }: { reason: string }) {
  return <span className="text-xs text-muted-foreground italic">Not available for {reason}</span>;
}

/**
 * One answer out of a few. Clicking the pressed answer again empties the
 * group, which `onChange` receives as ''.
 */
function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; text: string; title?: string; hidden?: boolean; disabled?: boolean }[];
  disabled?: boolean;
  onChange: (value: T | '') => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={0}
      value={value === null ? [] : [value]}
      disabled={disabled}
      onValueChange={(next) => onChange((next[0] as T | undefined) ?? '')}
    >
      {options
        .filter((option) => !option.hidden)
        .map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            title={option.title}
            disabled={option.disabled}
            className="data-[pressed]:border-primary data-[pressed]:underline data-[pressed]:underline-offset-4"
          >
            {option.text}
          </ToggleGroupItem>
        ))}
    </ToggleGroup>
  );
}

/** What every row of the card reads and writes through. */
interface RoomContext {
  readonly level: number;
  /** Room id, or '' with nothing selected. */
  readonly selected: string;
  readonly note: RoomNote | undefined;
  /** Nothing is selected, so every control is disabled. */
  readonly off: boolean;
  readonly commit: (action: Action) => void;
  /** Patches the selected room; a no-op with nothing selected. */
  readonly patch: (patch: RoomNotePatch) => void;
}

export function RoomCard(props: RoomCardProps) {
  const { state, level, selected, resolver, commit, canDrop, onDropItem } = props;
  /** A palette drag that can land is over the card. */
  const [dropping, setDropping] = useState(false);

  /*
   * The whole card takes a palette drag for the selected room — the same
   * placement a drop on the room's cell makes — so the drop does not have to
   * find the small Item box. The box shows where it will land.
   */
  const dropHandlers = dropTarget(
    () => !off && canDrop(),
    () => {
      if (!off) onDropItem();
    },
    { onAccept: () => setDropping(true), onLeave: () => setDropping(false) },
  );
  const rooms = state.rooms[String(level)] ?? {};
  const note = selected ? rooms[selected] : undefined;
  const off = !selected;
  const isEntrance = !!selected && state.levelStarts[String(level)] === selected;

  const patch = (patch: RoomNotePatch) => {
    if (selected) commit({ type: 'setRoomNote', level, room: selected, patch });
  };
  const room: RoomContext = { level, selected, note, off, commit, patch };

  const layoutDef = ROOM_LAYOUTS_BY_ID.get(note?.layout ?? '');
  /*
   * What the room's layout rules out, by the game's own rules — see
   * `layoutCanPush`. With no layout recorded nothing is ruled out. A ruled-out
   * row is greyed rather than hidden, and None stays live in it, so a value
   * recorded before the layout was known can still be taken back.
   */
  const pushRuledOut = !!layoutDef && !layoutCanPush(layoutDef);
  const stairsRuledOut = !!layoutDef && !layoutCanHaveStairs(layoutDef);

  return (
    <div
      className="z1r-ui grid gap-3 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground"
      {...dropHandlers}
    >
      <RoomHeader room={room} isEntrance={isEntrance} />

      {/*
       * The room on the left — its layout across the floor, its boss faint
       * behind that, and a wall on each side that opens a menu of door states
       * — and everything else about the room beside it. The two wrap into one
       * column when the card is narrow.
       */}
      <div className="flex flex-wrap items-start gap-3">
        <DoorRoom room={room} layoutDef={layoutDef} resolver={resolver} />

        <div className="grid min-w-[13rem] flex-1 gap-2">
          <Row label="Layout">
            <LayoutPicker
              value={note?.layout ?? ''}
              disabled={off}
              onPick={(id) => patch(id ? { layout: id, visited: true } : { layout: '' })}
            />
          </Row>

          <ItemRow room={room} dropping={dropping} resolver={resolver} />
          <FromRow room={room} />
          <BossRow room={room} resolver={resolver} />
          <StairsRow room={room} rooms={rooms} layoutDef={layoutDef} ruledOut={stairsRuledOut} />
          <PushRow room={room} layoutDef={layoutDef} ruledOut={pushRuledOut} />
          <FlagsRow room={room} />
        </div>
      </div>
    </div>
  );
}

/** The room, and the things you do to a room as a whole. */
function RoomHeader({ room, isEntrance }: { room: RoomContext; isEntrance: boolean }) {
  const { level, selected, note, off, commit, patch } = room;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn('mr-1 tabular-nums', selected ? 'text-base font-semibold' : 'text-muted-foreground')}
      >
        {selected ? `L${level} · ${selected}` : 'Click a room'}
      </span>
      {/* One three-way state: never on the map, seen on the map (the level's
          Map item, or a guide), or walked. Core keeps the two from ever
          both being set. */}
      <Segmented
        label="Whether this room is known from the map or has been visited"
        value={visitState(selected, note)}
        disabled={off}
        options={[
          { value: 'clear', text: 'Clear', title: 'Neither seen on the map nor walked' },
          {
            value: 'known',
            text: 'Known',
            title: "Seen on the level's map — the in-game Map or a guide — but not walked yet",
          },
          { value: 'visited', text: 'Visited', title: 'Walked into this room' },
        ]}
        onChange={(value) => patch(visitPatch(value))}
      />
      <CheckToggle
        label="Entrance"
        pressed={isEntrance}
        disabled={off}
        title="Make this the room the level is entered by. One per level."
        onPressedChange={() => selected && commit({ type: 'setLevelStart', level, room: selected })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-destructive"
        disabled={!note}
        title="Forget everything recorded about this room"
        onClick={() => patch(wipePatch())}
      >
        Wipe
      </Button>
    </div>
  );
}

/** The room drawn as a room: its boss and layout in the middle, a door control on each wall. */
function DoorRoom({
  room,
  layoutDef,
  resolver,
}: {
  room: RoomContext;
  layoutDef: RoomLayoutDef | undefined;
  resolver: SpriteResolver;
}) {
  const { level, selected, note, off, commit } = room;
  const bossDef = note?.boss ? DUNGEON_BOSSES_BY_ID.get(note.boss) : undefined;
  const paintWall = (side: RoomSide, door: DoorState) => {
    if (selected) commit({ type: 'setRoomDoor', level, room: selected, side, state: door });
  };
  return (
    <div className="w-[150px] flex-none">
      <div className="z1r-door-room" role="group" aria-label="Doors">
        <div className="z1r-door-hub">
          <span className="z1r-door-boss">
            {bossDef ? <Sprite resolver={resolver} spriteKey={bossDef.sprite} size={48} /> : null}
          </span>
          <span className="z1r-door-layout">
            {layoutDef ? <LayoutArt def={layoutDef} className="z1r-room-layout-art" /> : null}
          </span>
        </div>
        {ROOM_SIDES.map((side) => (
          <DoorWall
            key={side}
            side={side}
            current={note?.doors[side] ?? 'unknown'}
            disabled={off}
            onPick={(door) => paintWall(side, door)}
          />
        ))}
      </div>
    </div>
  );
}

/** The item comes from the palette; this row shows it and whether it is held. */
function ItemRow({
  room,
  dropping,
  resolver,
}: {
  room: RoomContext;
  dropping: boolean;
  resolver: SpriteResolver;
}) {
  const { level, selected, note, off, commit } = room;
  const itemDef = note?.item ? ROOM_ITEMS_BY_ID.get(note.item) : undefined;
  return (
    <Row label="Item">
      <ItemSlot itemDef={itemDef} dropping={dropping} resolver={resolver} />
      <span className={cn(itemDef ? '' : 'text-muted-foreground italic')}>
        {itemDef ? itemDef.name : 'none'}
      </span>
      <CheckToggle
        label="Collected"
        pressed={!!itemDef && !!note?.collected}
        disabled={off || !itemDef}
        title={collectedTitle(itemDef?.name, !!note?.collected)}
        onPressedChange={(pressed) =>
          selected && note?.item && commit({ type: 'collectRoom', level, room: selected, collected: pressed })
        }
      />
      {itemDef ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={off}
          title={`Forget that ${itemDef.name} is here`}
          onClick={() => selected && commit({ type: 'setRoomItem', level, room: selected, item: '' })}
        >
          Clear
        </Button>
      ) : null}
    </Row>
  );
}

/** The box the room's item sits in, and where a palette drag will land. */
function ItemSlot({
  itemDef,
  dropping,
  resolver,
}: {
  itemDef: RoomItemDef | undefined;
  dropping: boolean;
  resolver: SpriteResolver;
}) {
  return (
    <span
      className={cn(
        'inline-grid size-7 place-items-center rounded-md border',
        itemDef ? 'border-border' : 'border-dashed border-border',
        // A shape, not a tint: a dashed ring outside the slot while an
        // item it can take is over it.
        dropping && 'outline-2 outline-offset-2 outline-dashed outline-primary',
      )}
      title={itemSlotTitle(itemDef?.name)}
    >
      {itemDef ? <Sprite resolver={resolver} spriteKey={itemDef.sprite} size={18} /> : null}
    </span>
  );
}

/** Only a pool entry fills a slot, so only a pool entry is asked how it was found. */
function FromRow({ room }: { room: RoomContext }) {
  const { level, selected, note, off, commit } = room;
  if (!note || !POOL_BY_ID.has(note.item)) return null;
  const autoFrom = resolveRoomFrom({ ...note, from: 'auto' });
  return (
    <Row label="From">
      <Segmented
        label="Which location slot this item fills"
        value={note.from ?? 'auto'}
        disabled={off}
        options={ROOM_FROMS.map((from) => ({
          value: from,
          text: from === 'auto' ? `Auto · ${FROM_NAME[autoFrom]}` : FROM_NAME[from],
        }))}
        onChange={(from) => from && selected && commit({ type: 'setRoomFrom', level, room: selected, from })}
      />
    </Row>
  );
}

function BossRow({ room, resolver }: { room: RoomContext; resolver: SpriteResolver }) {
  const { level, selected, note, off, commit, patch } = room;
  const setBoss = (boss: string) => {
    if (!selected) return;
    // Picking the boss a room already has clears it, so the row needs no
    // second control to undo with.
    if (boss === '' || note?.boss === boss) {
      commit({ type: 'setRoomBoss', level, room: selected, boss: '' });
    } else patch({ boss, visited: true });
  };
  return (
    <Row label="Boss">
      <ToggleGroup
        aria-label="Boss in this room"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={note?.boss ? [note.boss] : []}
        disabled={off}
        onValueChange={(next) => setBoss(next[0] ?? '')}
      >
        {DUNGEON_BOSSES.filter((boss) => bossAllowedOnLevel(boss.id, level)).map((boss) => (
          <ToggleGroupItem
            key={boss.id}
            value={boss.id}
            title={bossTitle(boss)}
            aria-label={boss.name}
            className="size-8 px-0 data-[pressed]:border-primary data-[pressed]:ring-2 data-[pressed]:ring-primary"
          >
            <Sprite resolver={resolver} spriteKey={boss.sprite} size={22} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Row>
  );
}

function StairsRow({
  room,
  rooms,
  layoutDef,
  ruledOut,
}: {
  room: RoomContext;
  rooms: Record<string, RoomNote>;
  layoutDef: RoomLayoutDef | undefined;
  ruledOut: boolean;
}) {
  const { selected, note, off, patch } = room;
  const stairs = note?.stairs ?? 'none';

  const setStairs = (kind: RoomStairKind | '') => {
    if (!selected || kind === '') return;
    if (kind !== 'transport') {
      // `none` leaves the visited mark alone — clearing a staircase is not a
      // statement about having been in the room.
      patch(kind === 'none' ? { stairs: kind } : { stairs: kind, visited: true });
      return;
    }
    // A transport staircase is half of a pair, so it is given a number on the
    // spot rather than left unpaired and silent.
    patch({ stairs: 'transport', transport: note?.transport || nextPair(rooms), visited: true });
  };

  return (
    <Row label="Stairs">
      <Segmented
        label="What the staircase in this room is"
        value={selected ? stairs : null}
        disabled={off}
        options={ROOM_STAIRS.map((stair) => ({
          value: stair.id,
          text: STAIR_WORD[stair.id],
          title: stairTitle(stair),
          disabled: ruledOut && stair.id !== 'none',
        }))}
        onChange={setStairs}
      />
      {ruledOut && layoutDef ? <NotAvailable reason={layoutDef.name} /> : null}
      {stairs === 'transport' ? <TransportPairs room={room} pairs={pairsShown(rooms)} /> : null}
    </Row>
  );
}

/** Which transport pair a transport staircase is half of. */
function TransportPairs({ room, pairs }: { room: RoomContext; pairs: number }) {
  const { level, selected, note, off, commit } = room;
  const transport = note?.transport ?? 0;
  return (
    <Segmented
      label="Which transport pair this staircase is half of"
      value={transport ? String(transport) : null}
      disabled={off}
      options={Array.from({ length: pairs }, (_, index) => ({
        value: String(index + 1),
        text: String(index + 1),
        title: pairTitle(index + 1, transport),
      }))}
      onChange={(value) => {
        if (!selected) return;
        // The pressed number again unpairs; the staircase itself stays.
        commit(
          value === ''
            ? { type: 'clearRoomTransport', level, room: selected }
            : { type: 'placeRoomTransport', level, room: selected, number: Number(value) },
        );
      }}
    />
  );
}

function PushRow({
  room,
  layoutDef,
  ruledOut,
}: {
  room: RoomContext;
  layoutDef: RoomLayoutDef | undefined;
  ruledOut: boolean;
}) {
  const { selected, note, off, patch } = room;
  return (
    <Row label="Push">
      <Segmented
        label="Whether a block in this room might push"
        value={selected ? (note?.pushBlock ?? '') || 'none' : null}
        disabled={off}
        options={ROOM_PUSH_BLOCKS.map((value) => ({
          value: value || 'none',
          text: PUSH_WORD[value],
          title: PUSH_TITLE[value],
          disabled: ruledOut && value !== '',
        }))}
        onChange={(value) => patch({ pushBlock: value === 'maybe' || value === 'checked' ? value : '' })}
      />
      {ruledOut && layoutDef ? <NotAvailable reason={layoutDef.name} /> : null}
    </Row>
  );
}

function FlagsRow({ room }: { room: RoomContext }) {
  const { note, off, patch } = room;
  return (
    <Row label="Room">
      <CheckToggle
        label="Cleared"
        pressed={!!note?.cleared}
        disabled={off}
        title="Every enemy in this room killed"
        onPressedChange={(pressed) => patch({ cleared: pressed })}
      />
      <CheckToggle
        label="Needs Ladder"
        pressed={!!note?.ladder}
        disabled={off}
        title="Water in the way: this room needs the Ladder"
        onPressedChange={(pressed) => patch({ ladder: pressed })}
      />
    </Row>
  );
}

/**
 * One wall of the room: shows its door, and opens a menu of the six door
 * states on a click. The current state carries a check, so the menu does not
 * lean on colour; keys 1-6 pick while it is open. Right-click clears the wall
 * without opening anything.
 */
function DoorWall({
  side,
  current,
  disabled,
  onPick,
}: {
  side: RoomSide;
  current: DoorState;
  disabled: boolean;
  onPick: (door: DoorState) => void;
}) {
  const [open, setOpen] = useState(false);
  // Closed for good when the control is disabled, not just hidden: masking it
  // with `open && !disabled` left `open` true, and the popover came back on its
  // own the moment the control was enabled again.
  if (disabled && open) setOpen(false);
  const pick = (door: DoorState) => {
    onPick(door);
    setOpen(false);
  };
  const title = disabled
    ? 'Pick a room first'
    : `${SIDE_NAME[side]}: ${doorLabel(current)} — click to choose, right-click to clear`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="z1r-door-wall"
        data-side={SIDE_CLASS[side]}
        data-door={current}
        disabled={disabled}
        title={title}
        aria-label={title}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!disabled) onPick('unknown');
        }}
      >
        <span className="z1r-door-line" />
        <span className="z1r-door-tag">
          {current === 'unknown' ? '?' : (DOOR_STATES_BY_ID.get(current)?.tag ?? '')}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="z1r-ui w-44 p-1"
        onKeyDown={(event) => {
          const door = DOOR_ORDER[Number(event.key) - 1];
          if (door && /^[1-6]$/.test(event.key)) {
            event.preventDefault();
            pick(door);
          }
        }}
      >
        <div role="menu" aria-label={`${SIDE_NAME[side]} door`} className="grid">
          {DOOR_ORDER.map((door, index) => {
            const def = DOOR_STATES_BY_ID.get(door);
            const word = door === 'unknown' ? 'Clear' : (def?.name.split(',')[0] ?? door);
            const checked = door === current;
            return (
              <button
                key={door}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                title={def?.name ?? 'Not looked at yet'}
                className={cn(
                  'flex h-7 items-center gap-2 rounded-md px-2 text-left text-sm outline-none',
                  'hover:bg-accent focus-visible:bg-accent',
                  checked && 'font-semibold',
                )}
                onClick={() => pick(door)}
              >
                <span className="inline-flex w-3 justify-center">
                  {checked ? <CheckIcon className="size-3.5" /> : null}
                </span>
                <span data-door={door} className="inline-flex">
                  <span className="z1r-door-line" />
                </span>
                <span className="flex-1 truncate">{word}</span>
                <kbd className="text-[0.7rem] text-muted-foreground">{index + 1}</kbd>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The layout picker: shadcn's combobox pattern, a popover holding a command
 * list that filters as you type. Each entry is the layout's picture and its
 * name, filed under what fills the room.
 */
function LayoutPicker({
  value,
  disabled,
  onPick,
}: {
  value: string;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Closed for good when the control is disabled, not just hidden: masking it
  // with `open && !disabled` left `open` true, and the popover came back on its
  // own the moment the control was enabled again.
  if (disabled && open) setOpen(false);
  // Typing is the fastest way to a layout, so the filter takes focus on open.
  const filter = useRef<HTMLInputElement>(null);
  const current = ROOM_LAYOUTS_BY_ID.get(value);
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        title={
          current ? `${current.name} — pick a different layout` : 'Pick what stands on this room’s floor'
        }
      >
        {current ? (
          <span className="inline-flex h-4 w-7 border border-border">
            <LayoutArt def={current} className="size-full" />
          </span>
        ) : null}
        <span className={cn(current ? '' : 'text-muted-foreground italic')}>
          {current ? current.name : 'not recorded'}
        </span>
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" initialFocus={filter} className="z1r-ui w-72 p-0">
        <Command>
          <CommandInput ref={filter} placeholder="Filter layouts" />
          <CommandList className="max-h-80">
            <CommandEmpty>No layout by that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Not recorded" data-checked={value === ''} onSelect={() => pick('')}>
                Not recorded
              </CommandItem>
            </CommandGroup>
            {ROOM_LAYOUT_GROUPS.map((group) => (
              <CommandGroup key={group.id} heading={group.name}>
                {ROOM_LAYOUTS.filter((layout) => layout.group === group.id).map((layout) => (
                  <CommandItem
                    key={layout.id}
                    value={layout.name}
                    data-checked={layout.id === value}
                    onSelect={() => pick(layout.id)}
                  >
                    <span className="inline-flex h-5 w-9 shrink-0 border border-border bg-background">
                      <LayoutArt def={layout} className="size-full" />
                    </span>
                    {layout.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
