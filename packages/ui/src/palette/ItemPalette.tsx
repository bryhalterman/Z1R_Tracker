/**
 * The item palette, in React with shadcn/ui: a column on the page's left edge.
 *
 * Three ways to put an item on the map, all ending the same way:
 *
 *  - Right click arms it; the next click on a room or an overworld screen puts
 *    it there, and puts it down: one find, one placement. Right-clicking the
 *    armed item again, or Escape, puts it down without placing it.
 *  - Drag it onto a room, an overworld screen, or the room card's item slot.
 *  - From the keyboard, Enter or Space arms it.
 *
 * A left click says whether you hold it. The arrow keys step the held stage.
 *
 * Every tier is its own tile — Wooden, White and Magical Sword are three — and
 * the tiers of one item sit together in a joined strip, the way the Levels
 * strip joins its numbers. The Wooden Arrow and the Blue Ring are bought rather
 * than found, so their tiles only say whether you hold them: dashed, and never
 * armed or dragged.
 *
 * Tiles are "style B": a held item is a raised tile with a solid ring and its
 * sprite at full strength; one you do not hold is hollow, its sprite gray and
 * faded. Armed is a thicker ring in the accent, and the panel heading says in
 * words what the next click does. Every tile's full state is in its tooltip.
 *
 * Holds no state: the store has what is held, the placement channel what is
 * armed.
 */

import {
  ITEMS,
  ITEMS_BY_ID,
  ROOM_ITEMS_BY_ID,
  SCREEN_ITEMS,
  SCREEN_ITEMS_BY_ID,
  labelFor,
  spriteFor,
  type ItemDef,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { cn } from '#lib/utils';
import { Sprite } from '../shared/Sprite.js';
import { CellTip } from '../room-grid/CellTip.js';

/**
 * One tile: a placeable item by its pool or room id, or — for the two tiers
 * that are bought, never found — an inventory item at a stage.
 */
type TileSpec = string | { readonly inventory: string; readonly stage: number };

/** An item's tiers, lowest first, drawn as one joined strip. */
interface Family {
  readonly name: string;
  readonly tiles: readonly TileSpec[];
}

const FAMILIES: Record<string, Family> = {
  sword: { name: 'Sword', tiles: ['woodSword', 'whiteSword', 'magicalSword'] },
  boomerang: { name: 'Boomerang', tiles: ['boomerang', 'magicalBoomerang'] },
  arrow: { name: 'Arrow', tiles: [{ inventory: 'arrow', stage: 1 }, 'silverArrow'] },
  candle: { name: 'Candle', tiles: ['blueCandle', 'redCandle'] },
  ring: { name: 'Ring', tiles: [{ inventory: 'ring', stage: 1 }, 'redRing'] },
  potion: { name: 'Potion', tiles: ['bluePotion', 'redPotion'] },
};

/** The palette, group by group. An entry is a family's key or a single placeable item's id. */
const PALETTE_GROUPS: readonly { name: string; caption: string; entries: readonly string[] }[] = [
  {
    name: 'pool',
    caption: 'Pool',
    entries: [
      'sword',
      'boomerang',
      'bow',
      'arrow',
      'candle',
      'ring',
      'recorder',
      'wand',
      'magicalKey',
      'bombs',
      'potion',
    ],
  },
  {
    name: 'held',
    caption: 'Held',
    entries: ['book', 'magicalShield', 'ladder', 'raft', 'bracelet', 'meat', 'letter'],
  },
  // The Heart Container leads the dungeon pickups: a level's own drop far more
  // often than anything else.
  { name: 'dungeon', caption: 'Dungeon', entries: ['heart', 'map', 'compass', 'triforce'] },
];

// Every inventory item can be placed now, so this group is normally absent; it
// stays for any item added to the inventory before it has a placement.
const UNPLACED: readonly ItemDef[] = ITEMS.filter(
  (item) =>
    !SCREEN_ITEMS.some((e) => e.itemId === item.id) &&
    !Object.values(FAMILIES).some((family) =>
      family.tiles.some((tile) => typeof tile !== 'string' && tile.inventory === item.id),
    ),
);

/** An inventory item nothing places: held stage only, never armable. Built once, so memoized tiles see the same spec. */
const UNPLACED_SPECS: readonly TileSpec[] = UNPLACED.map((def) => ({ inventory: def.id, stage: 1 }));

export interface ItemPaletteProps {
  state: TrackerState;
  /** The armed item's id, or '' for none. */
  armed: string;
  placedAt: Map<string, string[]>;
  resolver: SpriteResolver;
  itemSize: number;
  /** Which panels of this mount a placement can land on. */
  placeInto: { rooms: boolean; map: boolean };
  arm: (id: string) => void;
  /** Sets an inventory item's held stage outright. */
  setHeld: (itemId: string, value: number) => void;
  step: (itemId: string, direction: 1 | -1) => void;
  /** A drag has picked `id` up: it is armed for as long as it is in the air. */
  dragStart: (id: string) => void;
  /** The drag is over; `dropped` is false when it landed nowhere. */
  dragEnd: (dropped: boolean) => void;
}

/** Where an item can be dropped in this mount, in words, or '' for nowhere. */
export function targetFor(id: string, placeInto: ItemPaletteProps['placeInto']): string {
  // Rooms hold the pool and the dungeon pickups; the overworld holds the pool
  // and the overworld-only items.
  const rooms = placeInto.rooms && ROOM_ITEMS_BY_ID.has(id);
  const map = placeInto.map && SCREEN_ITEMS_BY_ID.has(id);
  if (rooms && map) return 'a room or an overworld screen';
  if (rooms) return 'a room';
  if (map) return 'an overworld screen';
  return '';
}

type Held = 'held' | 'unheld' | 'none';

/**
 * The tile's drawing, shared by every kind of tile.
 *
 * `held: 'none'` is for the dungeon pickups, which have no held state: drawn
 * at full strength on a quiet tile, neither raised nor hollow. `bought` is the
 * dashed edge of a tier you buy rather than find. Inside a family strip a tile
 * is a cell of the strip, so it takes the cell corner rather than the control's.
 */
function tileClass({
  held,
  armed,
  placeable,
  bought,
  inFamily,
}: {
  held: Held;
  armed: boolean;
  placeable: boolean;
  bought: boolean;
  inFamily: boolean;
}): string {
  return cn(
    'relative grid size-(--z1r-item-min) place-items-center p-0.5 outline-none transition-colors',
    inFamily ? 'rounded-sm' : 'rounded-lg',
    'focus-visible:ring-2 focus-visible:ring-ring',
    held === 'held' && 'bg-secondary shadow-[inset_0_0_0_1.5px_var(--foreground)]',
    held === 'unheld' &&
      'shadow-[inset_0_0_0_1px_var(--border)] [&_.z1r-sprite]:opacity-35 [&_.z1r-sprite]:grayscale',
    held === 'none' && 'bg-secondary/50 shadow-[inset_0_0_0_1px_var(--border)]',
    // Bought, not found: a dashed edge in place of the ring, held or not.
    bought && 'shadow-none border border-dashed border-muted-foreground',
    // Armed is the one the next map click spends: a thicker ring in the
    // accent, and the sprite back at full strength whatever is held.
    armed &&
      'shadow-[inset_0_0_0_2.5px_var(--primary)] [&_.z1r-sprite]:opacity-100 [&_.z1r-sprite]:grayscale-0',
    placeable ? 'cursor-grab hover:bg-accent' : 'cursor-pointer hover:bg-accent',
  );
}

/** A corner tick: this item is already recorded somewhere. The tooltip says where. */
function PlacedTick() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0.5 right-0.5 size-0 border-t-[7px] border-l-[7px] border-t-primary border-l-transparent"
    />
  );
}

interface PaletteTileProps {
  spec: TileSpec;
  inFamily: boolean;
  /** The inventory, by reference: unchanged items keep the same object. */
  items: TrackerState['items'];
  isArmed: boolean;
  /** Where the item has been placed, phrased for the label, or ''. */
  where: string;
  resolver: SpriteResolver;
  itemSize: number;
  placeInto: ItemPaletteProps['placeInto'];
  arm: ItemPaletteProps['arm'];
  setHeld: ItemPaletteProps['setHeld'];
  step: ItemPaletteProps['step'];
  dragStart: ItemPaletteProps['dragStart'];
  dragEnd: ItemPaletteProps['dragEnd'];
}

/**
 * One tile, whatever it stands for.
 *
 * Memoized: every store edit and every arm redraws the palette, and a tile's
 * props only change when its own item, armed state or placements do. The
 * callbacks are made once per mount, so they never break the comparison.
 */
const PaletteTile = memo(function PaletteTile(props: PaletteTileProps) {
  const {
    spec,
    inFamily,
    items,
    isArmed,
    where,
    resolver,
    itemSize,
    placeInto,
    arm,
    setHeld,
    step,
    dragStart,
    dragEnd,
  } = props;
  const bought = typeof spec !== 'string';
  const pool = bought ? undefined : SCREEN_ITEMS_BY_ID.get(spec);
  const def = bought ? undefined : (ROOM_ITEMS_BY_ID.get(spec) ?? pool);
  if (!bought && !def) return null;

  // The inventory item this tile reports, and the stage it stands for. The
  // Heart Container's inventory id is empty, and the Map, the Compass and a
  // Triforce piece have no pool entry: those four have no held state.
  const inventory = bought
    ? ITEMS_BY_ID.get(spec.inventory)
    : pool?.itemId
      ? ITEMS_BY_ID.get(pool.itemId)
      : undefined;
  const stage = bought ? spec.stage : (pool?.value ?? 0);
  const value = inventory ? (items[inventory.id] ?? 0) : 0;
  const name = bought ? (inventory ? labelFor(inventory, stage) : '') : def!.name;
  const sprite = bought ? (inventory ? spriteFor(inventory, stage) : '') : def!.sprite;
  const id = bought ? `${spec.inventory}.${spec.stage}` : spec;

  const target = bought ? '' : targetFor(spec, placeInto);
  const held: Held = inventory && stage > 0 ? (value >= stage ? 'held' : 'unheld') : 'none';

  /*
   * A left click says whether you hold this tier. Not held: the item goes up
   * to it. Held: the item drops to the tier below, so a click on the tier you
   * have is how you take it back. A one-stage item is the same rule — on, off.
   */
  const toggleHeld = () => {
    if (inventory && stage > 0) setHeld(inventory.id, value >= stage ? stage - 1 : stage);
  };
  const toggleArmed = () => {
    if (target) arm(isArmed ? '' : (spec as string));
  };

  // What the tile is, a fact per line. How to use the palette is behind the
  // ? in the heading; the accessible name keeps it, since a screen reader
  // reaches the tile without passing the ?.
  const facts: string[] = [];
  if (held !== 'none') facts.push(held === 'held' ? 'held' : 'not held');
  if (where) facts.push(`placed at ${where}`);
  if (isArmed) facts.push('armed');
  if (bought) facts.push('bought in a shop, never placed');
  else if (!target) facts.push('nowhere in this window to place it');
  const hints: string[] = [];
  if (target)
    hints.push(isArmed ? 'right-click to put it down' : `right-click to arm, or drag onto ${target}`);
  if (held !== 'none') hints.push(held === 'held' ? 'click to mark it not held' : 'click to mark it held');
  const text = [name, ...facts, ...hints].join(' — ');

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={text}
        // Pressed reports what Enter or Space does: arming a tile that can be
        // placed, otherwise holding it. The mouse's held click is told by the
        // label instead.
        aria-pressed={target ? isArmed : held === 'none' ? undefined : held === 'held'}
        data-item={id}
        data-armed={isArmed}
        data-held={held === 'held'}
        data-placed={!!where}
        className={tileClass({ held, armed: isArmed, placeable: !!target, bought, inFamily })}
        // A click from the keyboard (Enter, Space) arms a tile that can be
        // placed; one from the mouse says whether it is held. A tile with
        // nothing to arm toggles held from the keyboard too, rather than
        // doing nothing. `detail` is the mouse's click count, and 0 for a
        // click the keyboard made.
        onClick={(event) => (event.detail === 0 && target ? toggleArmed() : toggleHeld())}
        onContextMenu={(event) => {
          event.preventDefault();
          toggleArmed();
        }}
        onKeyDown={(event) => {
          if (!inventory) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            step(inventory.id, 1);
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            step(inventory.id, -1);
          }
        }}
        draggable={!!target}
        onDragStart={
          target
            ? (event) => {
                event.dataTransfer.effectAllowed = 'copy';
                // Required for the drag to start in Firefox; the drop reads the
                // armed item, not this.
                event.dataTransfer.setData('text/plain', name);
                dragStart(spec as string);
              }
            : undefined
        }
        onDragEnd={target ? (event) => dragEnd(event.dataTransfer.dropEffect !== 'none') : undefined}
      >
        {sprite ? <Sprite resolver={resolver} spriteKey={sprite} size={itemSize} /> : null}
        {where ? <PlacedTick /> : null}
      </TooltipTrigger>
      <TooltipContent className="z1r-ui max-w-64">
        <CellTip heading={name} lines={facts} />
      </TooltipContent>
    </Tooltip>
  );
});

export function ItemPalette(props: ItemPaletteProps) {
  const { state, armed, placedAt, resolver, itemSize, placeInto, arm, setHeld, step, dragStart, dragEnd } =
    props;

  /** One tile, keyed by what it stands for. */
  const tile = (spec: TileSpec, inFamily: boolean) => {
    const bought = typeof spec !== 'string';
    return (
      <PaletteTile
        key={bought ? `${spec.inventory}.${spec.stage}` : spec}
        spec={spec}
        inFamily={inFamily}
        items={state.items}
        isArmed={!bought && armed === spec}
        where={bought ? '' : (placedAt.get(spec) ?? []).join(', ')}
        resolver={resolver}
        itemSize={itemSize}
        placeInto={placeInto}
        arm={arm}
        setHeld={setHeld}
        step={step}
        dragStart={dragStart}
        dragEnd={dragEnd}
      />
    );
  };

  /** A palette entry: a family's joined strip, or a single tile. */
  const entry = (key: string) => {
    const family = FAMILIES[key];
    if (!family) return tile(key, false);
    return (
      <div key={key} role="group" aria-label={family.name} className="z1r-palette-family">
        {family.tiles.map((spec) => tile(spec, true))}
      </div>
    );
  };

  const groups = [
    ...PALETTE_GROUPS.map(({ name, caption, entries }) => ({ name, caption, tiles: entries.map(entry) })),
    ...(UNPLACED.length
      ? [{ name: 'inventory', caption: 'Mark held', tiles: UNPLACED_SPECS.map((spec) => tile(spec, false)) }]
      : []),
  ];

  return (
    <TooltipProvider delay={400}>
      {groups.map(({ name, caption, tiles }) => (
        <div key={name} className="z1r-ui z1r-palette-group" data-group={name}>
          <span className="z1r-item-group-label">{caption}</span>
          <div className="z1r-palette-cells">{tiles}</div>
        </div>
      ))}
    </TooltipProvider>
  );
}
