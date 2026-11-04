/**
 * The inventory grid the OBS dock marks held mid-stream, in React.
 *
 * Drawn with the same classes and attributes the plain-DOM grid had —
 * `z1r-item`, `data-item`, `data-owned`, `data-held` and the rest — so it
 * looks exactly as it did and every OBS Custom CSS rule written against those
 * hooks still lands. No Tailwind and nothing portalled, so the root carries no
 * `z1r-ui`: that class would only pull the React base reset over cells that
 * `styles.css` already styles in full.
 *
 * A click raises an item; Shift+click, a right click, ArrowLeft or ArrowDown
 * lower it. The overlay takes no clicks and keeps its plain-DOM grid, which it
 * draws synchronously for its first-paint fit.
 */

import type { MouseEvent, KeyboardEvent } from 'react';
import { ITEMS, labelFor, maxValue, spriteFor, type ItemDef, type SpriteResolver, type TrackerState } from '@z1r/core';
import { Sprite } from '../shared/Sprite.js';
import { placedSuffix } from '../placed.js';
import { roomItemsForInventory } from '../rooms.js';

export interface DockItemsProps {
  state: TrackerState;
  /** Room ids per room item, from `placedIndex`. */
  placedAt: Map<string, string[]>;
  resolver: SpriteResolver;
  itemSize: number;
  /** Keep the inventory screen's always-active / B-slot split. */
  grouped: boolean;
  step: (id: string, direction: 1 | -1) => void;
}

const GROUPS = [
  ['passive', 'Always active'],
  ['bslot', 'B slot'],
] as const;

/** Every room item a cell can stand for — a chain covers more than one. Fixed, so worked out once. */
const COVERS = new Map(ITEMS.map((def) => [def.id, roomItemsForInventory(def)]));

export function DockItems({ state, placedAt, resolver, itemSize, grouped, step }: DockItemsProps) {
  const cells = (group: ItemDef['group']) =>
    ITEMS.filter((def) => def.group === group).map((def) => (
      <ItemCell key={def.id} def={def} value={state.items[def.id] ?? 0} placedAt={placedAt} resolver={resolver} itemSize={itemSize} step={step} />
    ));

  if (!grouped) {
    return (
      <div className="z1r-item-group" data-group="all">
        <div className="z1r-item-grid">
          {cells('passive')}
          {cells('bslot')}
        </div>
      </div>
    );
  }

  return (
    <>
      {GROUPS.map(([group, caption]) => (
        <div key={group} className="z1r-item-group" data-group={group}>
          <span className="z1r-item-group-label">{caption}</span>
          <div className="z1r-item-grid">{cells(group)}</div>
        </div>
      ))}
    </>
  );
}

function ItemCell({
  def,
  value,
  placedAt,
  resolver,
  itemSize,
  step,
}: {
  def: ItemDef;
  value: number;
  placedAt: Map<string, string[]>;
  resolver: SpriteResolver;
  itemSize: number;
  step: DockItemsProps['step'];
}) {
  const covers = COVERS.get(def.id) ?? [];
  const owned = value > 0;
  const placed = covers.some((id) => (placedAt.get(id)?.length ?? 0) > 0);

  const held = labelFor(def, value);
  const base = def.note ? `${held} — ${def.note}` : held;
  const where = placedSuffix(covers, placedAt);
  const badge = def.kind === 'progressive' && owned && maxValue(def) > 1 ? String(value) : null;

  const onClick = (event: MouseEvent) => step(def.id, event.shiftKey ? -1 : 1);
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    step(def.id, -1);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(def.id, -1);
    }
  };

  return (
    <button
      type="button"
      className="z1r-item"
      // `data-item` is the hook the OBS Custom CSS is written against;
      // `data-item-id` stays as well, because rules already exist against it.
      data-item-id={def.id}
      data-item={def.id}
      data-group={def.group}
      data-armed="false"
      data-placed={String(placed)}
      data-placeable={String(covers.length > 0)}
      data-owned={String(owned)}
      // Mirrors `data-owned` under the name the room sheet's stable hooks use.
      data-held={String(owned)}
      title={`${base}${where}`}
      aria-pressed={owned}
      aria-label={`${held} — ${owned ? 'held' : 'not held'}${where}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <span className="z1r-item-sprite">
        <Sprite resolver={resolver} spriteKey={spriteFor(def, value)} size={itemSize} />
      </span>
      <span className="z1r-item-badge" hidden={badge === null}>
        {badge}
      </span>
    </button>
  );
}
