/**
 * What one palette tile stands for, worked out without React: the inventory
 * item it reports, the stage, whether it is held, where it can be placed, and
 * the words its tooltip and accessible name carry.
 */

import {
  ITEMS_BY_ID,
  ROOM_ITEMS_BY_ID,
  SCREEN_ITEMS_BY_ID,
  labelFor,
  spriteFor,
  type ItemDef,
  type TrackerState,
} from '@z1r/core';

/**
 * One tile: a placeable item by its pool or room id, or — for the two tiers
 * that are bought, never found — an inventory item at a stage.
 */
export type TileSpec = string | { readonly inventory: string; readonly stage: number };

export type Held = 'held' | 'unheld' | 'none';

/** Which panels of a mount a placement can land on. */
export interface PlaceInto {
  readonly rooms: boolean;
  readonly map: boolean;
}

/** Where an item can be dropped in this mount, in words, or '' for nowhere. */
export function targetFor(id: string, placeInto: PlaceInto): string {
  // Rooms hold the pool and the dungeon pickups; the overworld holds the pool
  // and the overworld-only items.
  const rooms = placeInto.rooms && ROOM_ITEMS_BY_ID.has(id);
  const map = placeInto.map && SCREEN_ITEMS_BY_ID.has(id);
  if (rooms && map) return 'a room or an overworld screen';
  if (rooms) return 'a room';
  if (map) return 'an overworld screen';
  return '';
}

export interface TileModel {
  /** The inventory item this tile reports, if it has a held state. */
  readonly inventory: ItemDef | undefined;
  /** The stage of `inventory` this tile stands for. */
  readonly stage: number;
  /** The inventory's current value. */
  readonly value: number;
  readonly name: string;
  readonly sprite: string;
  /** The `data-item` id. */
  readonly id: string;
  /** Where it can be dropped in this mount, in words, or '' for nowhere. */
  readonly target: string;
  readonly bought: boolean;
  readonly held: Held;
  /** What the tile is, a fact per line. */
  readonly facts: readonly string[];
  /** How to use it, for the accessible name. */
  readonly hints: readonly string[];
  /** The accessible name: name, facts and hints on one line. */
  readonly text: string;
}

type TileBase = Pick<
  TileModel,
  'inventory' | 'stage' | 'value' | 'name' | 'sprite' | 'id' | 'target' | 'bought'
>;

/** A bought tier: an inventory item at a stage, never placed. */
function boughtBase(spec: { inventory: string; stage: number }, items: TrackerState['items']): TileBase {
  const inventory = ITEMS_BY_ID.get(spec.inventory);
  const stage = spec.stage;
  return {
    inventory,
    stage,
    value: inventory ? (items[inventory.id] ?? 0) : 0,
    name: inventory ? labelFor(inventory, stage) : '',
    sprite: inventory ? spriteFor(inventory, stage) : '',
    id: `${spec.inventory}.${spec.stage}`,
    target: '',
    bought: true,
  };
}

/** A placeable item by its pool or room id, or null when it is neither. */
function placeableBase(spec: string, items: TrackerState['items'], placeInto: PlaceInto): TileBase | null {
  const pool = SCREEN_ITEMS_BY_ID.get(spec);
  const def = ROOM_ITEMS_BY_ID.get(spec) ?? pool;
  if (!def) return null;
  // The Heart Container's inventory id is empty, and the Map, the Compass and
  // a Triforce piece have no pool entry: those four have no held state.
  const inventory = pool?.itemId ? ITEMS_BY_ID.get(pool.itemId) : undefined;
  return {
    inventory,
    stage: pool?.value ?? 0,
    value: inventory ? (items[inventory.id] ?? 0) : 0,
    name: def.name,
    sprite: def.sprite,
    id: spec,
    target: targetFor(spec, placeInto),
    bought: false,
  };
}

function heldState({ inventory, stage, value }: TileBase): Held {
  if (!inventory || stage <= 0) return 'none';
  return value >= stage ? 'held' : 'unheld';
}

/*
 * What the tile is, a fact per line. How to use the palette is behind the ?
 * in the heading; the accessible name keeps it, since a screen reader reaches
 * the tile without passing the ?.
 */
function tileFacts(base: TileBase, held: Held, isArmed: boolean, where: string): string[] {
  const facts: string[] = [];
  if (held !== 'none') facts.push(held === 'held' ? 'held' : 'not held');
  if (where) facts.push(`placed at ${where}`);
  if (isArmed) facts.push('armed');
  if (base.bought) facts.push('bought in a shop, never placed');
  else if (!base.target) facts.push('nowhere in this window to place it');
  return facts;
}

function tileHints(target: string, held: Held, isArmed: boolean): string[] {
  const hints: string[] = [];
  if (target)
    hints.push(isArmed ? 'right-click to put it down' : `right-click to arm, or drag onto ${target}`);
  if (held !== 'none') hints.push(held === 'held' ? 'click to mark it not held' : 'click to mark it held');
  return hints;
}

/**
 * Everything a tile draws and says, or null for a placeable id that names no
 * item. Bought and placeable tiles differ only in where the item comes from.
 */
export function tileModel(
  spec: TileSpec,
  items: TrackerState['items'],
  isArmed: boolean,
  where: string,
  placeInto: PlaceInto,
): TileModel | null {
  const base = typeof spec === 'string' ? placeableBase(spec, items, placeInto) : boughtBase(spec, items);
  if (!base) return null;
  const held = heldState(base);
  const facts = tileFacts(base, held, isArmed, where);
  const hints = tileHints(base.target, held, isArmed);
  return { ...base, held, facts, hints, text: [base.name, ...facts, ...hints].join(' — ') };
}
