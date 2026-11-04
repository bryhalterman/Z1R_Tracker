/**
 * The item palette, in React with shadcn/ui.
 *
 * A click arms an item; the next click on a room or an overworld screen puts
 * it there, and puts it down: one find, one placement. Clicking the armed item
 * again, or Escape, puts it down without placing it. The right button raises
 * an item's held stage and Shift+right click lowers it; the arrow keys do the
 * same from the keyboard, since Enter and Space arm.
 *
 * An item that upgrades — sword, boomerang, candle, potion — is one tile
 * drawing the tier you hold, and clicking it opens a popover of the tiers that
 * can be placed, because which one you just found is the thing to ask.
 *
 * Tiles are "style B": an item you hold is a raised tile with a solid ring and
 * its sprite at full strength; one you do not is hollow, its sprite gray and
 * faded. Armed is a thicker ring in the accent, and the panel heading says in
 * words what the next click does. Every tile's full state is in its tooltip.
 *
 * Holds no state the store holds; the open tier popover is the one piece of
 * view state it keeps itself.
 */

import { useLayoutEffect, useState } from 'react';
import {
  ITEMS,
  ITEMS_BY_ID,
  ROOM_ITEMS_BY_ID,
  SCREEN_ITEMS,
  SCREEN_ITEMS_BY_ID,
  labelFor,
  maxValue,
  spriteFor,
  type ItemDef,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { cn } from '#lib/utils';
import { Sprite } from '../shared/Sprite.js';
import { placedSuffix } from '../placed.js';

/**
 * An item that upgrades: one inventory entry, several things to find.
 *
 * `tiers` are the placeable ones, lowest first. The Wooden Arrow and the Blue
 * Ring are shop stock rather than finds, so their chains hold one tier each.
 */
interface PaletteChain {
  readonly inventory: string;
  readonly name: string;
  readonly tiers: readonly string[];
}

const PALETTE_CHAINS: readonly PaletteChain[] = [
  { inventory: 'sword', name: 'Sword', tiers: ['woodSword', 'whiteSword', 'magicalSword'] },
  { inventory: 'boomerang', name: 'Boomerang', tiers: ['boomerang', 'magicalBoomerang'] },
  { inventory: 'arrow', name: 'Arrow', tiers: ['silverArrow'] },
  { inventory: 'candle', name: 'Candle', tiers: ['blueCandle', 'redCandle'] },
  { inventory: 'ring', name: 'Ring', tiers: ['redRing'] },
  { inventory: 'potion', name: 'Potion', tiers: ['bluePotion', 'redPotion'] },
];

/** The palette, group by group. An entry is a chain's inventory id or a single placeable item's id. */
const PALETTE_GROUPS: readonly { name: string; caption?: string; entries: readonly string[] }[] = [
  {
    name: 'pool',
    entries: [
      'sword', 'boomerang', 'bow', 'arrow', 'candle', 'ring',
      'recorder', 'wand', 'magicalKey', 'bombs', 'potion',
    ],
  },
  {
    name: 'held',
    caption: 'Held',
    entries: ['book', 'magicalShield', 'ladder', 'raft', 'bracelet', 'meat', 'letter'],
  },
  // The Heart Container leads the dungeon pickups: a level's own drop far more
  // often than anything else.
  { name: 'dungeon', entries: ['heart', 'map', 'compass', 'triforce'] },
];

// Every inventory item can be placed now, so this group is normally absent; it
// stays for any item added to the inventory before it has a placement.
const UNPLACED: readonly ItemDef[] = ITEMS.filter((item) => !SCREEN_ITEMS.some((e) => e.itemId === item.id));

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
  step: (itemId: string, direction: 1 | -1) => void;
  /** The element the palette renders into, measured to balance the rows. */
  container: HTMLElement;
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
 * The tile's drawing, shared by every kind of cell.
 *
 * `held: 'none'` is for the dungeon pickups, which have no held state: drawn
 * at full strength on a quiet tile, neither raised nor hollow.
 */
function tileClass({
  held,
  armed,
  open,
  placeable,
}: {
  held: Held;
  armed: boolean;
  open?: boolean;
  placeable: boolean;
}): string {
  return cn(
    'relative grid size-(--z1r-item-min) place-items-center rounded-lg p-0.5 outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-ring',
    held === 'held' && 'bg-secondary shadow-[inset_0_0_0_1.5px_var(--foreground)]',
    held === 'unheld' && 'shadow-[inset_0_0_0_1px_var(--border)] [&_.z1r-sprite]:opacity-35 [&_.z1r-sprite]:grayscale',
    held === 'none' && 'bg-secondary/50 shadow-[inset_0_0_0_1px_var(--border)]',
    // Armed is the one the next map click spends: a thicker ring in the
    // accent, and the sprite back at full strength whatever is held.
    armed && 'shadow-[inset_0_0_0_2.5px_var(--primary)] [&_.z1r-sprite]:opacity-100 [&_.z1r-sprite]:grayscale-0',
    open && 'outline-2 outline-offset-1 outline-dashed outline-primary',
    placeable ? 'cursor-pointer hover:bg-accent' : 'cursor-default',
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

/** A corner mark on a chain: a click opens a choice rather than arming at once. */
function ChainMark() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-1 bottom-1 size-1.5 border-r-2 border-b-2 border-muted-foreground"
    />
  );
}

function TileTip({ text, children }: { text: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      {children}
      <TooltipContent className="z1r-ui max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

export function ItemPalette(props: ItemPaletteProps) {
  const { state, armed, placedAt, resolver, itemSize, placeInto, arm, step, container } = props;
  const [openChain, setOpenChain] = useState('');

  /** Right button and arrow keys: the held stage, for every kind of tile. */
  const stageHandlers = (itemId: string | undefined) => ({
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      if (itemId) step(itemId, event.shiftKey ? -1 : 1);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!itemId) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        step(itemId, 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        step(itemId, -1);
      }
    },
  });

  /** A single placeable item: the Bow, the Ladder, a Map. */
  const placeableTile = (id: string) => {
    const def = ROOM_ITEMS_BY_ID.get(id) ?? SCREEN_ITEMS_BY_ID.get(id);
    if (!def) return null;
    const pool = SCREEN_ITEMS_BY_ID.get(id);
    // The Heart Container's inventory id is empty, and the Map, the Compass
    // and a Triforce piece have no pool entry: those four have no held state.
    const inventory = pool?.itemId ? ITEMS_BY_ID.get(pool.itemId) : undefined;
    const target = targetFor(id, placeInto);
    const isArmed = armed === id;
    const where = placedSuffix([id], placedAt);

    let held: Held = 'none';
    let heldText = '';
    let stageHint = '';
    if (inventory && pool) {
      const value = state.items[inventory.id] ?? 0;
      held = value >= pool.value ? 'held' : 'unheld';
      heldText = held === 'held' ? ' — held' : ' — not held';
      // A chain's lower stages are not pool entries, so say which stage the
      // inventory is at when it is not this one.
      const stage = value > 0 ? labelFor(inventory, value) : '';
      if (stage && stage !== def.name) heldText += ` (${inventory.name}: ${stage})`;
      stageHint = `; right-click raises ${inventory.name}, Shift+right-click lowers it`;
    }
    const action = target
      ? ` — click to ${isArmed ? 'put down' : `arm for ${target}`}`
      : ' — nowhere in this window to place it';
    const text = `${def.name}${heldText}${where}${action}${stageHint}`;

    return (
      <TileTip key={id} text={text}>
        <TooltipTrigger
          aria-label={text}
          aria-pressed={isArmed}
          data-item={id}
          data-armed={isArmed}
          data-held={held === 'held'}
          data-placed={!!where}
          className={tileClass({ held, armed: isArmed, placeable: !!target })}
          onClick={() => target && arm(isArmed ? '' : id)}
          {...stageHandlers(inventory?.id)}
        >
          <Sprite resolver={resolver} spriteKey={def.sprite} size={itemSize} />
          {where ? <PlacedTick /> : null}
        </TooltipTrigger>
      </TileTip>
    );
  };

  /** An item that upgrades: one tile, a popover of the tiers to arm. */
  const chainTile = (chain: PaletteChain) => {
    const inventory = ITEMS_BY_ID.get(chain.inventory);
    const value = inventory ? (state.items[inventory.id] ?? 0) : 0;
    const spriteKey = inventory ? spriteFor(inventory, value) : '';
    const placeable = chain.tiers.some((id) => targetFor(id, placeInto));
    const isArmed = chain.tiers.includes(armed);
    const where = placedSuffix(chain.tiers, placedAt);
    const many = chain.tiers.length > 1;
    const open = openChain === chain.inventory;

    const heldText = inventory ? ` — ${value > 0 ? `holding ${labelFor(inventory, value)}` : 'not held'}` : '';
    const armedName = isArmed ? (SCREEN_ITEMS_BY_ID.get(armed)?.name ?? armed) : '';
    const action = !placeable
      ? ' — nowhere in this window to place it'
      : isArmed
        ? ` — ${armedName} armed`
        : many
          ? ' — click to pick which one you found'
          : ' — click to arm';
    const text = `${chain.name}${heldText}${where}${action}; right-click raises ${chain.name}, Shift+right-click lowers it`;

    const tile = {
      'aria-label': text,
      'data-item': chain.inventory,
      'data-armed': isArmed,
      'data-held': value > 0,
      'data-placed': !!where,
      className: tileClass({ held: value > 0 ? 'held' : 'unheld', armed: isArmed, open, placeable }),
      ...stageHandlers(inventory?.id),
    };
    const face = (
      <>
        <Sprite resolver={resolver} spriteKey={spriteKey} size={itemSize} />
        {where ? <PlacedTick /> : null}
        {many ? <ChainMark /> : null}
      </>
    );

    if (!many) {
      const only = chain.tiers[0] ?? '';
      return (
        <TileTip key={chain.inventory} text={text}>
          <TooltipTrigger
            {...tile}
            aria-pressed={isArmed}
            onClick={() => placeable && arm(armed === only ? '' : only)}
          >
            {face}
          </TooltipTrigger>
        </TileTip>
      );
    }

    return (
      <Popover
        key={chain.inventory}
        open={open && placeable}
        onOpenChange={(next) => setOpenChain(next ? chain.inventory : '')}
      >
        <TileTip text={text}>
          <TooltipTrigger render={<PopoverTrigger disabled={!placeable} />} {...tile}>
            {face}
          </TooltipTrigger>
        </TileTip>
        <PopoverContent align="start" className="z1r-ui w-auto gap-1 p-1">
          <div role="group" aria-label={`Which ${chain.name.toLowerCase()} you found`} className="flex flex-col">
            {chain.tiers.map((id) => {
              const def = SCREEN_ITEMS_BY_ID.get(id) ?? ROOM_ITEMS_BY_ID.get(id);
              if (!def) return null;
              const target = targetFor(id, placeInto);
              // Held when the inventory has reached this tier's stage.
              const pool = SCREEN_ITEMS_BY_ID.get(id);
              const tierHeld = !!pool && value >= pool.value;
              return (
                <button
                  key={id}
                  type="button"
                  data-item={id}
                  disabled={!target}
                  title={target ? `${def.name} — arm for ${target}` : `${def.name} — nowhere in this window to place it`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
                  onClick={() => {
                    setOpenChain('');
                    arm(id);
                  }}
                >
                  <Sprite resolver={resolver} spriteKey={def.sprite} size={itemSize} />
                  <span className="whitespace-nowrap">{def.name}</span>
                  {tierHeld ? <span className="ml-auto pl-3 text-xs text-muted-foreground">✓ held</span> : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  /** An inventory item nothing places: held stage only, never armable. */
  const inventoryTile = (def: ItemDef) => {
    const value = state.items[def.id] ?? 0;
    const text =
      `${labelFor(def, value)} — ${value > 0 ? 'held' : 'not held'} — never placed, so not armable;` +
      ' right-click raises, Shift+right-click lowers';
    return (
      <TileTip key={def.id} text={text}>
        <TooltipTrigger
          aria-label={text}
          aria-pressed={value > 0}
          data-item={def.id}
          data-held={value > 0}
          className={tileClass({ held: value > 0 ? 'held' : 'unheld', armed: false, placeable: false })}
          {...stageHandlers(def.id)}
        >
          <Sprite resolver={resolver} spriteKey={spriteFor(def, value)} size={itemSize} />
          {def.kind === 'progressive' && value > 0 && maxValue(def) > 1 ? (
            <span className="absolute -right-1 -bottom-1 min-w-3.5 rounded-full bg-card px-1 text-center text-[10px] leading-3.5 shadow-[0_0_0_1px_var(--border)]">
              {value}
            </span>
          ) : null}
        </TooltipTrigger>
      </TileTip>
    );
  };

  const tileFor = (entry: string) => {
    const chain = PALETTE_CHAINS.find((c) => c.inventory === entry);
    return chain ? chainTile(chain) : placeableTile(entry);
  };

  const groups = [
    ...PALETTE_GROUPS.map(({ name, caption, entries }) => ({ name, caption, tiles: entries.map(tileFor) })),
    ...(UNPLACED.length ? [{ name: 'inventory', caption: 'Mark held', tiles: UNPLACED.map(inventoryTile) }] : []),
  ];

  const rows = useBalancedRows(container, groups.map((group) => group.tiles.length));

  return (
    <TooltipProvider delay={400}>
      {groups.map(({ name, caption, tiles }) => (
        <div key={name} className="z1r-ui z1r-palette-group" data-group={name}>
          {caption ? <span className="z1r-item-group-label">{caption}</span> : null}
          <div
            className="z1r-palette-cells"
            style={{ '--cols': Math.max(1, Math.ceil(tiles.length / rows)) } as React.CSSProperties}
          >
            {tiles}
          </div>
        </div>
      ))}
    </TooltipProvider>
  );
}

/**
 * Wrap evenly, never lopsided.
 *
 * Every group takes the same number of rows — the fewest that keep all of them
 * on one line at this width — and each row of a group is the same length, so a
 * short last row is centered under the others. The width a row count needs is
 * worked out rather than measured from a trial layout, which proved unreliable
 * before the card had settled: a cell, the gap between cells, the rule between
 * groups and a caption no group may be narrower than are all fixed sizes.
 */
function useBalancedRows(container: HTMLElement, counts: readonly number[]): number {
  const [rows, setRows] = useState(1);
  const key = counts.join(',');

  useLayoutEffect(() => {
    let balancedWidth = -1;
    const widthFor = (n: number): number => {
      const cell = container.querySelector<HTMLElement>('.z1r-palette-cells > *')?.offsetWidth ?? 0;
      let total = 0;
      for (const cells of container.querySelectorAll<HTMLElement>('.z1r-palette-cells')) {
        const group = cells.parentElement;
        if (!group) continue;
        const cols = Math.max(1, Math.ceil(cells.childElementCount / n));
        const gap = parseFloat(getComputedStyle(cells).columnGap) || 0;
        const caption = group.querySelector<HTMLElement>('.z1r-item-group-label')?.scrollWidth ?? 0;
        const style = getComputedStyle(group);
        total +=
          Math.max(cols * cell + (cols - 1) * gap, caption) +
          (parseFloat(style.marginInlineStart) || 0) +
          (parseFloat(style.paddingInlineStart) || 0) +
          (parseFloat(style.borderInlineStartWidth) || 0);
      }
      return total;
    };
    const balance = () => {
      const width = container.clientWidth;
      // Folded away, or not laid out yet; and a height-only change is the
      // balancing itself settling, which needs no second pass.
      if (!width || width === balancedWidth) return;
      balancedWidth = width;
      const most = Math.max(1, ...counts);
      let n = 1;
      while (n < most && widthFor(n) > width) n++;
      setRows(n);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(balance) : null;
    observer?.observe(container);
    balance();
    return () => observer?.disconnect();
    // `counts` is read through `key`: the array is rebuilt on every render,
    // and only a change in the group sizes is worth re-balancing for.
  }, [container, key]);

  return rows;
}
