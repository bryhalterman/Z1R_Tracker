/**
 * The dungeon room sheet.
 *
 * One level at a time on the fixed 8x8 grid `core/rooms.ts` models, drawn as
 * ruled graph paper: a room you have walked is a box inked onto the sheet, a
 * room you have not is bare paper. That is the shape a runner's own paper map
 * takes, and it is why this is not a table of buttons — "mapped" versus "not
 * mapped" has to read at a glance, from a drawn shape rather than a shade.
 *
 * Which level is showing and which room is selected are **view state**, held
 * here in closures rather than in the store. Neither belongs in a saved run,
 * and neither should travel over the BroadcastChannel: two windows looking at
 * two different levels of the same map is a feature, not a conflict.
 *
 * Items are not chosen here. They are armed in the palette and dropped by
 * clicking a room — see `createPlacement` — so the item row reports what is in
 * the room, whether it has been picked up, and which location slot it fills.
 * Recording an item is recording *where it is*; only marking it collected
 * grants it.
 */

import {
  DUNGEONS,
  ROOM_COLUMNS,
  ROOM_ITEMS_BY_ID,
  levelProgress,
  SHUFFLE_POOL,
  type Action,
  type ItemDef,
  type RoomNote,
  type RoomNotePatch,
  type SpriteResolver,
  type Store,
} from '@z1r/core';
import { runPatches, type Patch } from './patch.js';
import { askToConfirm } from './confirm/ask.js';
import { mountRoomCard } from './room-card/mount.js';
import { mountRoomGrid } from './room-grid/mount.js';
import { mountClearButton, mountLevelStrip } from './panel/mount.js';

/* ---------------------------------------------------------------- placement */

/** What the palette has armed for the next room or overworld click. */
export interface PlacementBrush {
  /** `ROOM_ITEMS` id the next room or screen click drops, or '' for nothing armed. */
  readonly item: string;
}

/**
 * The arming channel shared by the palette and the panels it drops onto.
 *
 * View state, not store state, and deliberately so. A half-finished gesture —
 * "I have picked the Raft up and not yet said which room" — is not a fact about
 * the run: it must not be written to a save, must not be broadcast to the other
 * window, and must not survive a reload. It only has to reach the panels built
 * in the same `mountTracker` call, which is exactly what this object is.
 *
 * There is no mode flag. The palette is always a placement tool, so an armed
 * item is the whole of the state: something is in the air, or nothing is.
 *
 * `watch` exists because the panels redraw off store changes and arming is not
 * one. Listeners are never removed: the channel lives and dies with the mount
 * that created it, so there is nothing to unsubscribe from.
 */
export interface PlacementChannel {
  get(): PlacementBrush;
  set(next: Partial<PlacementBrush>): void;
  /**
   * Change the brush and run `apply`, the store edit that goes with it, in one
   * redraw. The brush changes without telling the watchers; every panel that
   * reads it also redraws on the store's pass. `apply` returns whether the
   * store changed — when it did not, there is no pass, so the watchers are
   * told after all.
   */
  settle(next: Partial<PlacementBrush>, apply: () => boolean): void;
  watch(listener: () => void): void;
}

export function createPlacement(): PlacementChannel {
  let brush: PlacementBrush = { item: '' };
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => brush,
    set(next) {
      const item = next.item ?? brush.item;
      if (item === brush.item) return;
      brush = { item };
      notify();
    },
    settle(next, apply) {
      const item = next.item ?? brush.item;
      const changed = item !== brush.item;
      brush = { item };
      const redrawn = apply();
      if (changed && !redrawn) notify();
    },
    watch(listener) {
      listeners.add(listener);
    },
  };
}

/**
 * Every `ROOM_ITEMS` id an inventory item can ever stand for.
 *
 * The inventory and the pool are not the same list: the inventory is eighteen
 * cells, several of them progressive chains, while the pool names "White Sword"
 * and "Magical Sword" separately. `SHUFFLE_POOL` carries the join — each entry
 * knows the inventory id it grants — so this is derived rather than retyped.
 * Empty for the inventory items no location ever holds: Bombs, the Potion, the
 * Magical Shield, the Bait and the Letter.
 */
export function roomItemsForInventory(def: ItemDef): readonly string[] {
  return SHUFFLE_POOL.filter((entry) => entry.itemId === def.id && ROOM_ITEMS_BY_ID.has(entry.id)).map(
    (entry) => entry.id,
  );
}

/* -------------------------------------------------------------------- panel */

const LEVELS: readonly number[] = DUNGEONS.map((dungeon) => dungeon.level);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function buildRooms(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  placement: PlacementChannel,
): HTMLElement {
  const root = el('section', 'z1r-panel z1r-rooms-panel');

  /*
   * "Levels", not "Rooms" — the heading sits directly above the nine level
   * numerals that are the first thing anyone touches here, and the room grid is
   * what you get after choosing one.
   *
   * The section id, the `z1r-room*` class hooks and everything in core keep the
   * room name. `wireCollapsing` keys a panel's folded state off this text, so
   * the rename does cost a window its saved preference for this one panel the
   * first time it loads; nothing tracked is affected.
   */
  const title = el('h2', 'z1r-panel-title', 'Levels');
  root.append(title);

  /*
   * Panel-local view state.
   *
   * `level` and `selected` change on a click that dispatches nothing, so they
   * need a redraw of their own — `redraw` below. Everything they are drawn
   * from still comes out of the store on each pass, so the two can never
   * disagree about what a room holds.
   */
  let level = LEVELS[0] ?? 1;
  let selected = '';

  /** This panel's own patches, so view-state changes can replay them alone. */
  const own: Patch[] = [];
  const redraw = () => runPatches(own, store.getState());

  /**
   * Commit an action and a selection together.
   *
   * The store notifies nobody when an action changes nothing, and a refused or
   * no-op action still has to show the room it was aimed at — so the redraw is
   * conditional on the store having stayed put rather than unconditional, which
   * would run all sixty-four cell patches twice on every click.
   */
  const commit = (room: string, action: Action) => {
    selected = room;
    const before = store.getState();
    store.dispatch(action);
    if (store.getState() === before) redraw();
  };

  const roomsOf = (state: { rooms: Record<string, Record<string, RoomNote>> }, which = level) =>
    state.rooms[String(which)] ?? {};

  /* ------------------------------------------------------------ level pills */

  // React — see `panel/LevelStrip.tsx`.
  const levelsHost = el('span', 'z1r-room-levels');
  title.append(levelsHost);
  const levelStrip = mountLevelStrip(levelsHost);
  const pickLevel = (value: number) => {
    level = value;
    // The selection names a room on the level you were looking at, and the
    // same id on another level is a different room.
    selected = '';
    redraw();
  };

  title.append(el('span', 'z1r-room-spacer'));

  const count = el('span', 'z1r-locations-summary z1r-room-count');
  count.title = 'Rooms recorded on this level';
  title.append(count);

  const clearHost = el('span');
  const onClear = async () => {
    const total = Object.keys(roomsOf(store.getState())).length;
    if (total === 0) return;
    // Held from the click: the level showing can change while the dialog is
    // up, and the answer is about the level it asked about.
    const asked = level;
    // A whole level of mapping is a lot to lose to a misclick, and the
    // question is scoped to this level for the same reason the action is.
    const ok = await askToConfirm({
      title: `Clear Level ${asked}?`,
      description: `All ${total} recorded rooms on Level ${asked} are wiped. The other levels are not affected.`,
      confirm: 'Clear level',
    });
    if (!ok) return;
    if (level === asked) selected = '';
    commit(level === asked ? '' : selected, { type: 'clearRooms', level: asked });
  };
  mountClearButton(clearHost).render({
    title: 'Wipe this level’s room map. The other levels are untouched.',
    onClear: () => void onClear(),
  });
  title.append(clearHost);

  /* ------------------------------------------------------------- the sheet */

  /*
   * The sheet and the rows that describe the selected room, side by side when
   * there is width for both and stacked when there is not.
   *
   * Nothing here chooses between the two: the wrapper is a wrapping flex row
   * and the two children carry flex bases, so the rows drop below the sheet
   * exactly when they no longer fit beside it. A breakpoint would have to
   * restate the sheet's own 460px cap to know where that is, and would be
   * wrong in the OBS map dock, whose width is whatever the user dragged the
   * dock to rather than anything a media query can see.
   */
  const body = el('div', 'z1r-room-body');
  root.append(body);

  const paper = el('div', 'z1r-room-paper');
  const grid = el('div', 'z1r-room-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Room grid');

  /*
   * LEVEL-N across the top of the sheet, one character over each column, the
   * way the game letters its own dungeon map. Seven characters over eight
   * columns, so the last column is left bare. Hidden from assistive tech: the
   * heading's level buttons already say which level this is.
   */
  const caption = el('div', 'z1r-room-caption');
  caption.setAttribute('aria-hidden', 'true');
  const captionCells = Array.from({ length: ROOM_COLUMNS }, () => {
    const cell = el('span', 'z1r-room-caption-cell');
    caption.append(cell);
    return cell;
  });
  const drawCaption = () => {
    const text = `LEVEL-${level}`;
    captionCells.forEach((cell, index) => {
      cell.textContent = text[index] ?? '';
    });
  };

  paper.append(caption, grid);
  body.append(paper);

  /**
   * A room click: drop the armed item, or select the room — and, on the room
   * already selected, step it through clear → visited → known → clear.
   */
  const touchRoom = (room: string) => {
    const armed = placement.get().item;
    // An overworld-only item armed — the Letter, say — never lands in a room,
    // and the click does nothing: the sheet's cursor already says nothing will
    // happen.
    if (armed && !ROOM_ITEMS_BY_ID.has(armed)) return;
    if (!armed) {
      /*
       * Select first, cycle second. The first click on a room only selects it,
       * so picking a walked room to fill in its doors or boss never changes
       * what the sheet says about it. Clicking the room that is already
       * selected steps it on: visited first, since mapping is mostly "I walked
       * in here", then known — seen on the level's Map or in a guide — then
       * back to clear. Core keeps known and visited exclusive.
       */
      if (room !== selected) {
        selected = room;
        redraw();
        return;
      }
      const note = roomsOf(store.getState())[room];
      const patch: RoomNotePatch = note?.visited
        ? { known: true }
        : note?.known
          ? { known: false, visited: false }
          : { visited: true };
      commit(room, { type: 'setRoomNote', level, room, patch });
      return;
    }
    const current = roomsOf(store.getState())[room]?.item ?? '';
    // The same item clicked onto the same room takes it back off. Either way
    // the item is put down once it has landed: one find, one placement, one
    // redraw for both.
    placement.settle({ item: '' }, () => {
      const before = store.getState();
      commit(
        room,
        current === armed
          ? { type: 'setRoomItem', level, room, item: '' }
          : { type: 'setRoomNote', level, room, patch: { item: armed, visited: true } },
      );
      return store.getState() !== before;
    });
  };

  /** Whether the armed item — or the one being dragged — can land in a room. */
  const roomCanTake = () => ROOM_ITEMS_BY_ID.has(placement.get().item);

  // The 64 cells, drawn by React — see `room-grid/`. `touchRoom` above is
  // still what a click does; the grid only draws.
  const cells = mountRoomGrid(grid);

  /* -------------------------------------------------------------- room card */

  /*
   * Everything about the selected room, drawn by React with shadcn/ui — see
   * `room-card/`. The panel keeps the view state, which room and level are
   * showing, and hands the card the whole state
   * on every redraw; the card reports changes back through `commit`.
   */
  const cardHost = el('div', 'z1r-room-cardhost');
  body.append(cardHost);
  const card = mountRoomCard(cardHost);

  /* ------------------------------------------------------------- the passes */

  own.push((state) => {
    drawCaption();
    levelStrip.render({
      levels: LEVELS.map((value) => ({ value, progress: levelProgress(state, value) })),
      level,
      onPick: pickLevel,
    });

    const total = Object.keys(roomsOf(state)).length;
    count.textContent = `${total} ${total === 1 ? 'room' : 'rooms'}`;
  });

  own.push((state) =>
    cells.render({ state, level, selected, resolver, onTouch: touchRoom, canDrop: roomCanTake }),
  );

  own.push((state) => {
    const brush = placement.get();
    // While something is armed, the whole sheet says what a click will do.
    paper.dataset.arming = String(ROOM_ITEMS_BY_ID.has(brush.item));
    paper.dataset.refusing = String(!!brush.item && !ROOM_ITEMS_BY_ID.has(brush.item));

    card.render({
      state,
      level,
      selected,
      resolver,
      commit: (action) => {
        if (selected) commit(selected, action);
      },
      canDrop: roomCanTake,
      // The drag armed the item, so this is a click on the selected room.
      onDropItem: () => {
        if (selected) touchRoom(selected);
      },
    });
  });

  patches.push((state) => runPatches(own, state));
  // Arming changes nothing in the store, so the channel drives its own redraw.
  placement.watch(redraw);

  return root;
}
