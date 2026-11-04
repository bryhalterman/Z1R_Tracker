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
  DOOR_STATES_BY_ID,
  DUNGEONS,
  DUNGEON_BOSSES_BY_ID,
  ROOM_COLUMNS,
  ROOM_LAYOUTS_BY_ID,
  ROOM_LAYOUT_COLUMNS,
  ROOM_LAYOUT_ROWS,
  ROOM_ITEMS_BY_ID,
  ROOM_ROWS,
  ROOM_SIDES,
  ROOM_STAIRS_BY_ID,
  SHUFFLE_POOL,
  roomId,
  type Action,
  type DoorState,
  type ItemDef,
  type RoomNote,
  type RoomNotePatch,
  type RoomLayoutDef,
  type RoomSide,
  type SpriteResolver,
  type Store,
} from '@z1r/core';
import { memoise, runPatches, type Patch } from './patch.js';
import { createSprite } from './sprite.js';
import { askToConfirm } from './confirm/ask.js';
import { layoutShapes } from './layout-shapes.js';
import { mountRoomCard } from './room-card/mount.js';
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
  watch(listener: () => void): void;
}

export function createPlacement(): PlacementChannel {
  let brush: PlacementBrush = { item: '' };
  const listeners = new Set<() => void>();

  return {
    get: () => brush,
    set(next) {
      const item = next.item ?? brush.item;
      if (item === brush.item) return;
      brush = { item };
      for (const listener of listeners) listener();
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
  return SHUFFLE_POOL.filter(
    (entry) => entry.itemId === def.id && ROOM_ITEMS_BY_ID.has(entry.id),
  ).map((entry) => entry.id);
}

/* -------------------------------------------------------------------- panel */

const LEVELS: readonly number[] = DUNGEONS.map((dungeon) => dungeon.level);

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

/** A door's name with its tag, so the state reads as words and not as a hue. */
function doorLabel(state: DoorState): string {
  const def = DOOR_STATES_BY_ID.get(state);
  return def ? `${def.name} (${def.tag})` : state;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function flagIcon(kind: FlagIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `z1r-room-flag z1r-room-flag-${kind}`);
  svg.setAttribute('viewBox', '0 0 16 16');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', FLAG_PATHS[kind]);
  svg.append(path);
  return svg;
}

/**
 * A layout drawn as a 12x7 grid, one shape per square — see `layout-shapes.ts`.
 * Stretched to whatever box it is given: a room cell is not the same shape as
 * the game's room, and the grid matters more than square squares.
 */
function layoutArt(def: RoomLayoutDef, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${ROOM_LAYOUT_COLUMNS} ${ROOM_LAYOUT_ROWS}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const { tag, kind, attrs } of layoutShapes(def)) {
    const node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('class', `z1r-layout-${kind}`);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  }
  return svg;
}

export function buildRooms(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
  placement: PlacementChannel,
): HTMLElement {
  const root = el('section', 'z1r-panel z1r-rooms-panel');
  root.dataset.interactive = String(interactive);

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

  if (interactive) {
    const clearHost = el('span', 'z1r-heading-clearhost');
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
  }

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
    // the item is put down once it has landed: one find, one placement.
    commit(
      room,
      current === armed
        ? { type: 'setRoomItem', level, room, item: '' }
        : { type: 'setRoomNote', level, room, patch: { item: armed, visited: true } },
    );
    placement.set({ item: '' });
  };

  const cellPatches: Patch[] = [];

  for (let row = 1; row <= ROOM_ROWS; row++) {
    for (let column = 1; column <= ROOM_COLUMNS; column++) {
      const id = roomId(column, row);
      const cell = el('button', 'z1r-room');
      cell.type = 'button';
      cell.dataset.room = id;
      cell.disabled = !interactive;
      if (interactive) cell.addEventListener('click', () => touchRoom(id));

      /*
       * The doorways, drawn and nothing more.
       *
       * They used to take clicks and cycle, which put a 10px target inside a
       * 40px one and made a click near a wall mean something different from a
       * click in the middle of the same room. The compass in the detail strip
       * is the one way to set a door now, so these are hidden from assistive
       * tech as well: the cell's own label already names every known side.
       */
      const edges = ROOM_SIDES.map((side) => {
        const edge = el('span', `z1r-room-door ${SIDE_CLASS[side]}`);
        edge.dataset.side = SIDE_CLASS[side];
        edge.dataset.door = 'unknown';
        edge.setAttribute('aria-hidden', 'true');
        cell.append(edge);
        return { side, edge };
      });

      const mark = el('span', 'z1r-room-mark');
      cell.append(mark);
      /*
       * A collected item carries a corner check on the sheet as well as in the
       * strip, because collecting is the fact that makes it held — and a check
       * is a shape, so it does not rest on the colour it is drawn in.
       */
      const got = el('span', 'z1r-room-got', '✓');
      got.setAttribute('aria-hidden', 'true');
      got.hidden = true;
      cell.append(got);
      /*
       * The level's entrance: the same start pennant the overworld uses for
       * the start screen, in the room's top-left corner. One per level.
       */
      const entrance = el('span', 'z1r-room-start');
      cell.append(entrance);
      /*
       * Water in the way: the Ladder's sprite in the top-right corner. Once the
       * Ladder is held it stays, dimmed and checked, so the room still reads as
       * one that needed it — and now does not.
       */
      const ladder = el('span', 'z1r-room-ladder');
      cell.append(ladder);
      /*
       * The room's layout, drawn faintly across the floor under everything
       * else, so a mapped level shows the shapes you walked through.
       */
      const layout = el('span', 'z1r-room-layout');
      cell.append(layout);
      /*
       * Small marks in the free bottom-left corner: a skull for a boss, a block
       * for a push block. The boss's own art lives on the room card now, where
       * it has the space; here it would cover the room's layout and item.
       */
      const flags = el('span', 'z1r-room-flags');
      flags.setAttribute('aria-hidden', 'true');
      cell.append(flags);
      grid.append(cell);

      let renderedFlags: string | null = null;
      let renderedMark: string | null = null;
      let renderedTitle: string | null = null;
      let renderedEntrance: boolean | null = null;
      let renderedLadder: string | null = null;
      let renderedLayout: string | null = null;

      cellPatches.push((state) => {
        const note = roomsOf(state)[id];
        cell.dataset.visited = String(!!note?.visited);
        cell.dataset.known = String(!!note?.known);

        const isEntrance = state.levelStarts[String(level)] === id;
        renderedEntrance = memoise(renderedEntrance, isEntrance, () => {
          cell.dataset.start = String(isEntrance);
          if (isEntrance) {
            entrance.replaceChildren(createSprite(resolver, 'mark.start', { size: 14, label: '' }));
          } else entrance.replaceChildren();
        });
        cell.setAttribute('aria-current', String(id === selected));

        const ladderHeld = (state.items['ladder'] ?? 0) >= 1;
        const ladderState = note?.ladder ? (ladderHeld ? 'clear' : 'blocked') : '';
        renderedLadder = memoise(renderedLadder, ladderState, () => {
          cell.dataset.ladder = ladderState;
          if (!ladderState) {
            ladder.replaceChildren();
            return;
          }
          ladder.replaceChildren(createSprite(resolver, 'item.ladder', { size: 14, label: '' }));
          if (ladderState === 'clear') ladder.append(el('span', 'z1r-room-ladder-ok', '✓'));
        });

        const layoutId = note?.layout ?? '';
        renderedLayout = memoise(renderedLayout, layoutId, () => {
          const def = ROOM_LAYOUTS_BY_ID.get(layoutId);
          layout.replaceChildren(...(def ? [layoutArt(def, 'z1r-room-layout-art')] : []));
        });

        for (const { side, edge } of edges) {
          edge.dataset.door = note?.doors[side] ?? 'unknown';
        }

        const collected = !!note?.item && note.collected;
        cell.dataset.collected = String(collected);
        got.hidden = !collected;

        const boss = note?.boss ?? '';
        const push = note?.pushBlock ?? '';
        renderedFlags = memoise(renderedFlags, `${boss ? 'boss' : ''}|${push}`, () => {
          flags.replaceChildren();
          if (boss) flags.append(flagIcon('boss'));
          if (push) flags.append(flagIcon(push === 'maybe' ? 'push-maybe' : 'push-checked'));
        });

        const stairs = note?.stairs ?? 'none';
        const transport = note?.transport ?? 0;
        const item = note?.item ?? '';
        renderedMark = memoise(renderedMark, `${stairs}|${transport}|${item}`, () => {
          mark.replaceChildren();
          // The staircase and the pair plate are drawn shapes, not tints, so
          // the two kinds of staircase read apart without colour.
          //
          // The tracker's own staircase art rather than a triangle: a triangle
          // says nothing about stairs, and this is the same shape the warp
          // markers draw on the overworld, so a staircase reads the same way
          // wherever it appears.
          if (stairs === 'item') {
            mark.append(
              createSprite(resolver, 'ui.stairs', {
                size: MARK_ART_SIZE,
                className: 'z1r-room-stairs',
                label: '',
              }),
            );
          }
          if (transport) {
            mark.append(el('span', 'z1r-room-transport', String(transport)));
          }
          const def = item ? ROOM_ITEMS_BY_ID.get(item) : undefined;
          if (def) {
            mark.append(createSprite(resolver, def.sprite, { size: MARK_ART_SIZE, label: '' }));
          }
        });

        const parts = [id];
        if (isEntrance) parts.push('entrance');
        if (ladderState === 'blocked') parts.push('needs the Ladder');
        if (ladderState === 'clear') parts.push('needed the Ladder — held, passable now');
        const layoutDef = ROOM_LAYOUTS_BY_ID.get(layoutId);
        if (layoutDef) parts.push(`${layoutDef.name} layout`);
        if (note) {
          parts.push(note.visited ? 'visited' : note.known ? 'known from the map, not visited' : 'not visited');
          if (item) {
            const name = ROOM_ITEMS_BY_ID.get(item)?.name ?? item;
            parts.push(`holds ${name}${note.collected ? ', collected' : ''}`);
          }
          const bossDef = boss ? DUNGEON_BOSSES_BY_ID.get(boss) : undefined;
          if (bossDef) parts.push(bossDef.name);
          const stairDef = stairs === 'none' ? undefined : ROOM_STAIRS_BY_ID.get(stairs);
          if (stairDef) parts.push(`${stairDef.name} (${stairDef.tag})`);
          if (transport) parts.push(`transport pair ${transport}`);
          const walls = ROOM_SIDES.filter((side) => note.doors[side] !== 'unknown').map(
            (side) => `${SIDE_NAME[side]} ${doorLabel(note.doors[side])}`,
          );
          if (walls.length) parts.push(walls.join(', '));
        }
        const text = parts.join(' — ');
        renderedTitle = memoise(renderedTitle, text, () => {
          cell.title = text;
          cell.setAttribute('aria-label', text);
        });
      });
    }
  }

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
      levels: LEVELS.map((value) => ({ value, touched: Object.keys(roomsOf(state, value)).length > 0 })),
      level,
      disabled: !interactive,
      onPick: pickLevel,
    });

    const total = Object.keys(roomsOf(state)).length;
    count.textContent = `${total} ${total === 1 ? 'room' : 'rooms'}`;
  });

  own.push((state) => runPatches(cellPatches, state));

  own.push((state) => {
    const brush = placement.get();
    // While something is armed, the whole sheet says what a click will do.
    paper.dataset.arming = String(ROOM_ITEMS_BY_ID.has(brush.item));
    paper.dataset.refusing = String(!!brush.item && !ROOM_ITEMS_BY_ID.has(brush.item));

    card.render({
      state,
      level,
      selected,
      interactive,
      resolver,
      commit: (action) => {
        if (selected) commit(selected, action);
      },
    });
  });

  patches.push((state) => runPatches(own, state));
  // Arming changes nothing in the store, so the channel drives its own redraw.
  if (interactive) placement.watch(redraw);

  return root;
}
