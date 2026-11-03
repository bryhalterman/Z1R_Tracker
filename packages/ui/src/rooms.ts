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
  DUNGEON_BOSSES,
  DUNGEON_BOSSES_BY_ID,
  POOL_BY_ID,
  ROOM_COLUMNS,
  ROOM_FROMS,
  ROOM_LAYOUTS,
  ROOM_LAYOUTS_BY_ID,
  ROOM_LAYOUT_COLUMNS,
  ROOM_LAYOUT_GROUPS,
  ROOM_LAYOUT_ROWS,
  ROOM_PUSH_BLOCKS,
  ROOM_ITEMS_BY_ID,
  ROOM_ROWS,
  ROOM_SIDES,
  ROOM_STAIRS,
  ROOM_STAIRS_BY_ID,
  ROOM_TRANSPORT_MAX,
  ROOM_TRANSPORT_PAIR_SIZE,
  SHUFFLE_POOL,
  bossAllowedOnLevel,
  resolveRoomFrom,
  roomId,
  type Action,
  type DoorState,
  type ItemDef,
  type RoomFrom,
  type RoomNote,
  type RoomLayoutDef,
  type RoomPushBlock,
  type RoomSide,
  type RoomSlotKind,
  type RoomStairKind,
  type SpriteResolver,
  type Store,
} from '@z1r/core';
import { memoise, runPatches, type Patch } from './patch.js';
import { createSprite } from './sprite.js';

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

/** The words each slot kind goes by in the From row. */
const FROM_NAME: Record<RoomSlotKind, string> = {
  floor: 'Floor',
  stair: 'Stairs',
};

/** The stairs row's three buttons, in words short enough to sit on one line. */
const STAIR_WORD: Record<RoomStairKind, string> = {
  none: 'None',
  item: 'To item',
  transport: 'Transport',
};

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
 * A layout drawn as a 12x7 grid, one shape per square.
 *
 * Each kind of square is its own shape as well as its own fill — a block is a
 * solid square, a statue a ring, water a filled square with a line through it,
 * sand a dot, stairs two rungs — so the picture still reads with the colour
 * taken away. Stretched to whatever box it is given: a room cell is not the
 * same shape as the game's room, and the grid matters more than square squares.
 */
function layoutArt(def: RoomLayoutDef, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${ROOM_LAYOUT_COLUMNS} ${ROOM_LAYOUT_ROWS}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const shape = (tag: string, kind: string, attrs: Record<string, number>) => {
    const node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('class', `z1r-layout-${kind}`);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  };
  def.rows.forEach((row, y) => {
    [...row].forEach((square, x) => {
      const full = { x, y, width: 1, height: 1 };
      switch (square) {
        case '#':
          shape('rect', 'block', { x: x + 0.06, y: y + 0.06, width: 0.88, height: 0.88 });
          break;
        case 'o':
          shape('ellipse', 'statue', { cx: x + 0.5, cy: y + 0.5, rx: 0.3, ry: 0.3 });
          break;
        case '=':
          shape('rect', 'stairs', { x: x + 0.15, y: y + 0.2, width: 0.7, height: 0.15 });
          shape('rect', 'stairs', { x: x + 0.15, y: y + 0.65, width: 0.7, height: 0.15 });
          break;
        case '~':
          shape('rect', 'water', full);
          shape('rect', 'wave', { x, y: y + 0.45, width: 1, height: 0.1 });
          break;
        case ':':
          shape('ellipse', 'sand', { cx: x + 0.5, cy: y + 0.5, rx: 0.14, ry: 0.14 });
          break;
        case 'x':
          shape('rect', 'black', full);
          break;
      }
    });
  });
  return svg;
}

/**
 * A two-state chip whose state is spelled out, not only tinted.
 *
 * The check mark in front of the label is the non-colour channel: the pressed
 * ring is an accent hue, and a hue alone is not allowed to carry state here.
 */
function setToggle(button: HTMLButtonElement, label: string, on: boolean): void {
  const text = on ? `✓ ${label}` : label;
  if (button.textContent !== text) button.textContent = text;
  button.setAttribute('aria-pressed', String(on));
}

/** A row of joined chips, one of which is the current answer. */
function segmented(label: string): HTMLElement {
  const group = el('span', 'z1r-seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  return group;
}

function segButton(text: string, title: string): HTMLButtonElement {
  const button = el('button', 'z1r-room-pick z1r-room-word z1r-seg-option', text);
  button.type = 'button';
  button.title = title;
  return button;
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

  const levels = el('span', 'z1r-room-levels');
  levels.setAttribute('role', 'group');
  levels.setAttribute('aria-label', 'Level');
  title.append(levels);

  const levelPills = LEVELS.map((value) => {
    const pill = el('button', 'z1r-room-level', String(value));
    pill.type = 'button';
    pill.title = `Level ${value}`;
    pill.disabled = !interactive;
    pill.addEventListener('click', () => {
      level = value;
      // The selection names a room on the level you were looking at, and the
      // same id on another level is a different room.
      selected = '';
      redraw();
    });
    levels.append(pill);
    return { value, pill };
  });

  title.append(el('span', 'z1r-room-spacer'));

  const count = el('span', 'z1r-locations-summary z1r-room-count');
  count.title = 'Rooms recorded on this level';
  title.append(count);

  if (interactive) {
    const clear = el('button', 'z1r-chip-button z1r-chip-danger', 'Clear');
    clear.type = 'button';
    clear.title = 'Wipe this level’s room map. The other levels are untouched.';
    clear.addEventListener('click', () => {
      const total = Object.keys(roomsOf(store.getState())).length;
      if (total === 0) return;
      // A whole level of mapping is a lot to lose to a misclick, and the
      // confirm is scoped to this level for the same reason the action is.
      const ok = globalThis.confirm?.(
        `Clear all ${total} recorded rooms on Level ${level}? The other levels are not affected.`,
      );
      if (ok !== false) {
        selected = '';
        commit('', { type: 'clearRooms', level });
      }
    });
    title.append(clear);
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
  paper.append(grid);
  body.append(paper);

  /** A room click: drop the armed item, or mark the room walked. */
  const touchRoom = (room: string) => {
    const armed = placement.get().item;
    // An overworld-only item armed — the Letter, say — never lands in a room,
    // and the click does nothing rather than mark the room walked: the sheet's
    // cursor already says nothing will happen.
    if (armed && !ROOM_ITEMS_BY_ID.has(armed)) return;
    if (!armed) {
      /*
       * Selecting and marking visited are one click, because mapping a dungeon
       * is mostly "I walked into this room" and that should not cost a mode.
       * Set rather than toggled: unmarking is the strip's own toggle, so a
       * second click here cannot undo the thing you came to record.
       */
      commit(room, { type: 'setRoomNote', level, room, patch: { visited: true } });
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
              createSprite(resolver, 'mark.stairway', {
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
          parts.push(note.visited ? 'visited' : 'not visited');
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

  /* ----------------------------------------------------------- detail strip */

  const detail = el('div', 'z1r-room-detail');
  detail.dataset.empty = 'true';
  body.append(detail);

  /**
   * A labelled row of the strip. Every row but the first dims with nothing
   * selected.
   *
   * The controls go in a value box beside the key rather than straight into
   * the row, so a line that wraps continues under the controls and not back
   * under the key, where it would read as a row of its own.
   */
  const detailRow = (key: string, editable = true) => {
    const row = el('div', editable ? 'z1r-room-detail-row z1r-room-editable' : 'z1r-room-detail-row');
    const value = el('div', 'z1r-room-detail-value');
    row.append(el('span', 'z1r-room-key', key), value);
    detail.append(row);
    return { row, value };
  };

  /*
   * The room, and the two things you do to a room as a whole.
   *
   * Visited and Wipe sit next to the room's id rather than at the far end of
   * the panel. They are about this room, and pushed to the other edge they
   * read as controls for the whole sheet, a long way from the id they act on.
   */
  const { row: idLine, value: idRow } = detailRow('Room', false);
  const roomLabel = el('span', 'z1r-room-id');
  idRow.append(roomLabel);

  const visitedToggle = el('button', 'z1r-room-pick z1r-room-word', 'Visited');
  visitedToggle.type = 'button';
  visitedToggle.title = 'Mark this room walked, or take the mark back off';
  visitedToggle.addEventListener('click', () => {
    if (!selected) return;
    commit(selected, { type: 'toggleRoomVisited', level, room: selected });
  });

  const entranceToggle = el('button', 'z1r-room-pick z1r-room-word', 'Entrance');
  entranceToggle.type = 'button';
  entranceToggle.title = 'Make this the room the level is entered by. One per level.';
  entranceToggle.addEventListener('click', () => {
    if (!selected) return;
    commit(selected, { type: 'setLevelStart', level, room: selected });
  });

  const ladderToggle = el('button', 'z1r-room-pick z1r-room-word', 'Ladder');
  ladderToggle.type = 'button';
  ladderToggle.title = 'Water in the way: this room needs the Ladder';
  ladderToggle.addEventListener('click', () => {
    if (!selected) return;
    const current = roomsOf(store.getState())[selected]?.ladder ?? false;
    commit(selected, { type: 'setRoomNote', level, room: selected, patch: { ladder: !current } });
  });

  const wipe = el('button', 'z1r-room-pick z1r-room-word', 'Wipe');
  wipe.type = 'button';
  wipe.title = 'Forget everything recorded about this room';
  wipe.addEventListener('click', () => {
    if (!selected) return;
    /*
     * Written as one patch of empty values rather than a dedicated action: a
     * room that carries nothing is pruned from the save by the reducer itself,
     * so "wipe" and "never recorded" land on the same state. `from` is in the
     * patch because an overruled slot kind is something the room carries too,
     * and leaving it would keep an otherwise empty room alive in the save.
     */
    commit(selected, {
      type: 'setRoomNote',
      level,
      room: selected,
      patch: {
        visited: false,
        item: '',
        boss: '',
        stairs: 'none',
        transport: 0,
        from: 'auto',
        ladder: false,
        layout: '',
        pushBlock: '',
        cleared: false,
        doors: { north: 'unknown', east: 'unknown', south: 'unknown', west: 'unknown' },
      },
    });
  });
  idRow.append(visitedToggle, entranceToggle, wipe);

  /*
   * What stands on the room's floor: one of the game's 42 layouts.
   *
   * A dropdown rather than a row of chips, because 42 pictures do not fit on a
   * row and the names alone do not say what a room looks like. Each entry is
   * its picture and its name, filed under what fills the room, and the box at
   * the top narrows the list as you type. Picking a layout marks the room
   * walked, the same as naming its boss does: you have seen it.
   */
  const { row: layoutLine, value: layoutRow } = detailRow('Layout');
  layoutRow.classList.add('z1r-layout-row');
  const layoutButton = el('button', 'z1r-room-pick z1r-room-word z1r-layout-current');
  layoutButton.type = 'button';
  layoutButton.setAttribute('aria-haspopup', 'listbox');
  layoutButton.setAttribute('aria-expanded', 'false');
  const layoutThumb = el('span', 'z1r-layout-thumb');
  const layoutName = el('span', 'z1r-layout-current-name', 'not recorded');
  layoutButton.append(layoutThumb, layoutName, el('span', 'z1r-layout-caret', '▾'));

  const layoutMenu = el('div', 'z1r-layout-menu');
  layoutMenu.hidden = true;
  const layoutFilter = el('input', 'z1r-layout-filter');
  layoutFilter.type = 'search';
  layoutFilter.placeholder = 'Filter layouts';
  layoutFilter.setAttribute('aria-label', 'Filter layouts by name');
  const layoutList = el('div', 'z1r-layout-list');
  layoutList.setAttribute('role', 'listbox');
  layoutList.setAttribute('aria-label', 'Room layouts');
  layoutMenu.append(layoutFilter, layoutList);
  layoutRow.append(layoutButton, layoutMenu);

  const setLayout = (id: string) => {
    if (!selected) return;
    commit(selected, {
      type: 'setRoomNote',
      level,
      room: selected,
      patch: id ? { layout: id, visited: true } : { layout: '' },
    });
  };

  const layoutOptions: { id: string; name: string; button: HTMLButtonElement }[] = [];
  const layoutGroups: { heading: HTMLElement; ids: Set<string> }[] = [];
  const addLayoutOption = (id: string, name: string, def?: RoomLayoutDef) => {
    const button = el('button', 'z1r-layout-option');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.dataset.layout = id;
    const thumb = el('span', 'z1r-layout-thumb');
    if (def) thumb.append(layoutArt(def, 'z1r-layout-thumb-art'));
    // The check is the selected entry's non-colour mark; the tint behind it
    // only repeats it.
    button.append(el('span', 'z1r-layout-check', '✓'), thumb, el('span', 'z1r-layout-name', name));
    button.addEventListener('click', () => {
      setLayout(id);
      closeLayoutMenu(true);
    });
    layoutList.append(button);
    layoutOptions.push({ id, name, button });
  };
  addLayoutOption('', 'Not recorded');
  for (const group of ROOM_LAYOUT_GROUPS) {
    const heading = el('div', 'z1r-layout-group', group.name);
    heading.setAttribute('role', 'presentation');
    layoutList.append(heading);
    const ids = new Set<string>();
    for (const def of ROOM_LAYOUTS.filter((layout) => layout.group === group.id)) {
      addLayoutOption(def.id, def.name, def);
      ids.add(def.id);
    }
    layoutGroups.push({ heading, ids });
  }

  const visibleLayoutOptions = () => layoutOptions.filter(({ button }) => !button.hidden);
  const filterLayouts = () => {
    const query = layoutFilter.value.trim().toLowerCase();
    for (const { name, button } of layoutOptions) {
      button.hidden = query !== '' && !name.toLowerCase().includes(query);
    }
    for (const { heading, ids } of layoutGroups) {
      heading.hidden = !layoutOptions.some(({ id, button }) => ids.has(id) && !button.hidden);
    }
  };
  const openLayoutMenu = () => {
    if (!selected) return;
    layoutMenu.hidden = false;
    layoutButton.setAttribute('aria-expanded', 'true');
    layoutFilter.value = '';
    filterLayouts();
    layoutFilter.focus();
  };
  function closeLayoutMenu(returnFocus = false) {
    if (layoutMenu.hidden) return;
    layoutMenu.hidden = true;
    layoutButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) layoutButton.focus();
  }

  layoutButton.addEventListener('click', () => {
    if (layoutMenu.hidden) openLayoutMenu();
    else closeLayoutMenu();
  });
  layoutFilter.addEventListener('input', filterLayouts);
  layoutMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLayoutMenu(true);
      return;
    }
    // Enter in the filter takes the first match, so typing "moat" and Enter
    // is the whole gesture.
    if (event.key === 'Enter' && event.target === layoutFilter) {
      event.preventDefault();
      visibleLayoutOptions()[0]?.button.click();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const visible = visibleLayoutOptions().map(({ button }) => button);
    if (visible.length === 0) return;
    const at = visible.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = at === -1 ? (step === 1 ? 0 : visible.length - 1) : at + step;
    if (next < 0) layoutFilter.focus();
    else visible[Math.min(next, visible.length - 1)]?.focus();
  });
  if (interactive) {
    // A click anywhere outside the row puts the list away, the way a native
    // dropdown does — a room click included, which also changes the room.
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && layoutRow.contains(event.target)) return;
      closeLayoutMenu();
    });
  }

  /*
   * What is in the room, and whether it has been picked up.
   *
   * The item itself comes from the palette, so this row shows it rather than
   * offering a picker. Collected is the one gesture that grants an item, which
   * is why it sits right beside the sprite it is about.
   */
  const { row: itemLine, value: itemRow } = detailRow('Item');
  const itemCell = el('span', 'z1r-room-itemcell');
  const itemName = el('span', 'z1r-room-item-name');
  const collectedToggle = el('button', 'z1r-room-pick z1r-room-word', 'Collected');
  collectedToggle.type = 'button';
  collectedToggle.addEventListener('click', () => {
    if (!selected) return;
    const note = roomsOf(store.getState())[selected];
    if (!note?.item) return;
    commit(selected, {
      type: 'collectRoom',
      level,
      room: selected,
      collected: !note.collected,
    });
  });
  const dropItem = el('button', 'z1r-room-pick z1r-room-word', 'Clear');
  dropItem.type = 'button';
  dropItem.addEventListener('click', () => {
    if (!selected) return;
    commit(selected, { type: 'setRoomItem', level, room: selected, item: '' });
  });
  itemRow.append(itemCell, itemName, collectedToggle, dropItem);

  /*
   * How the item was found, which is which location slot it fills.
   *
   * Auto names what it resolves to, so the default is never a guess about what
   * the tracker decided. Hidden for a room with no item, and for the Map, the
   * Compass and a Triforce piece, which fill no slot at all.
   */
  const { row: fromRow, value: fromValue } = detailRow('From');
  const fromGroup = segmented('Which location slot this item fills');
  fromValue.append(fromGroup);
  const fromButtons = ROOM_FROMS.map((from) => {
    const button = segButton(
      from === 'auto' ? 'Auto' : FROM_NAME[from],
      from === 'auto'
        ? 'Read it off the room: item stairs mean a stair item, anything else a floor item'
        : from === 'floor'
          ? 'A floor item: fills one of the level\'s floor spots, the heart spot included'
          : 'A stair item: fills one of the level\'s stair slots',
    );
    button.dataset.from = from;
    button.addEventListener('click', () => {
      if (!selected) return;
      commit(selected, { type: 'setRoomFrom', level, room: selected, from });
    });
    fromGroup.append(button);
    return { from, button };
  });

  const { row: bossLine, value: bossRow } = detailRow('Boss');
  const bossPicker = el('span', 'z1r-room-picker');
  bossRow.append(bossPicker);

  const setBoss = (boss: string) => {
    if (!selected) return;
    const current = roomsOf(store.getState())[selected]?.boss ?? '';
    // Picking the boss a room already has clears it, so the row needs no second
    // control to undo with.
    if (current === boss || boss === '') {
      commit(selected, { type: 'setRoomBoss', level, room: selected, boss: '' });
      return;
    }
    commit(selected, { type: 'setRoomNote', level, room: selected, patch: { boss, visited: true } });
  };

  const noneBoss = el('button', 'z1r-room-pick z1r-room-word', 'none');
  noneBoss.type = 'button';
  noneBoss.dataset.boss = '';
  noneBoss.title = 'No boss in this room';
  noneBoss.addEventListener('click', () => setBoss(''));
  bossPicker.append(noneBoss);

  const bossButtons = DUNGEON_BOSSES.map((boss) => {
    const button = el('button', 'z1r-room-pick');
    button.type = 'button';
    button.dataset.boss = boss.id;
    button.title = boss.level9Only ? `${boss.name} — Level 9 only` : boss.name;
    button.setAttribute('aria-label', button.title);
    button.append(createSprite(resolver, boss.sprite, { size: 22, label: '' }));
    button.addEventListener('click', () => setBoss(boss.id));
    bossPicker.append(button);
    return { boss, button };
  });

  /*
   * The staircase, and for a transport which pair it is half of.
   *
   * Segmented buttons rather than two dropdowns: three kinds and a handful of
   * pair numbers are few enough to show at once, and a dropdown hid which one
   * was current behind a click. The pair only appears for a transport, since a
   * number means nothing on any other staircase.
   *
   * A level has no fixed number of pairs, so the row grows: four numbers to
   * start, and always one past the highest in use, so a new pair is a click.
   */
  const { row: stairsLine, value: stairsRow } = detailRow('Stairs');
  const stairsGroup = segmented('What the staircase in this room is');
  const pairGroup = segmented('Which transport pair this staircase is half of');
  pairGroup.classList.add('z1r-room-pair');
  stairsRow.append(stairsGroup, pairGroup);

  /** How many pair numbers the row shows when no more are in use. */
  const PAIRS_SHOWN = 4;

  /** The lowest pair with room for another half. */
  const nextPair = (rooms: Record<string, RoomNote>): number => {
    const counts = new Map<number, number>();
    for (const note of Object.values(rooms)) {
      if (note.transport) counts.set(note.transport, (counts.get(note.transport) ?? 0) + 1);
    }
    for (let number = 1; number <= ROOM_TRANSPORT_MAX; number++) {
      if ((counts.get(number) ?? 0) < ROOM_TRANSPORT_PAIR_SIZE) return number;
    }
    return 1;
  };

  const setStairs = (kind: RoomStairKind) => {
    if (!selected) return;
    if (kind !== 'transport') {
      // `none` leaves the visited mark alone — clearing a staircase is not a
      // statement about having been in the room.
      const patch = kind === 'none' ? { stairs: kind } : { stairs: kind, visited: true };
      commit(selected, { type: 'setRoomNote', level, room: selected, patch });
      return;
    }
    const rooms = roomsOf(store.getState());
    // A transport staircase is half of a pair, so it is given a number on the
    // spot rather than left unpaired and silent.
    const transport = rooms[selected]?.transport || nextPair(rooms);
    commit(selected, {
      type: 'setRoomNote',
      level,
      room: selected,
      patch: { stairs: 'transport', transport, visited: true },
    });
  };

  const stairButtons = ROOM_STAIRS.map((stair) => {
    const button = segButton(
      STAIR_WORD[stair.id],
      stair.tag ? `${stair.name} (${stair.tag})` : stair.name,
    );
    button.dataset.stairs = stair.id;
    button.addEventListener('click', () => setStairs(stair.id));
    stairsGroup.append(button);
    return { kind: stair.id, button };
  });

  const pairButtons: { number: number; button: HTMLButtonElement }[] = [];
  /** Adds buttons up to `count`; they are kept, and hidden when not needed. */
  const ensurePairButtons = (count: number) => {
    for (let number = pairButtons.length + 1; number <= count; number++) addPairButton(number);
  };
  const addPairButton = (number: number) => {
    const button = segButton(String(number), '');
    button.dataset.pair = String(number);
    button.addEventListener('click', () => {
      if (!selected) return;
      const current = roomsOf(store.getState())[selected]?.transport ?? 0;
      // The pressed number again unpairs, which is what the old "pair —" entry
      // did; the staircase itself stays recorded.
      commit(
        selected,
        current === number
          ? { type: 'clearRoomTransport', level, room: selected }
          : { type: 'placeRoomTransport', level, room: selected, number },
      );
    });
    pairGroup.append(button);
    pairButtons.push({ number, button });
  };
  ensurePairButtons(PAIRS_SHOWN);

  /*
   * The doors: pick a state, then click walls.
   *
   * The compass this replaces put all six states on every side — twenty-four
   * buttons of 14px, which in a fast game is a lot of small targets to land
   * on. Now there are six state buttons, each with its word, and four walls
   * that are the length of their side. The state stays armed until another
   * is picked, so a room of four open doors is five clicks. Clicking a wall
   * that already shows the armed state takes it back to unknown, and the right
   * button always does. Keys 1-6 arm a state, outside text fields.
   *
   * Each wall draws its own state with the sheet's line for it plus the
   * model's two-letter tag, so the room reads as words as well as shapes.
   */
  const { row: doorsLine, value: doorsRow } = detailRow('Doors');
  doorsLine.classList.add('z1r-room-doors-row');

  /** Most-met first, so the keys under the left hand are the common ones. */
  const BRUSH_ORDER: readonly DoorState[] = ['open', 'locked', 'shutter', 'wall', 'bombed', 'unknown'];
  let doorBrush: DoorState = 'open';

  const brushRow = el('div', 'z1r-door-brushes');
  brushRow.setAttribute('role', 'group');
  brushRow.setAttribute('aria-label', 'Door state to paint');
  const brushButtons: { door: DoorState; button: HTMLButtonElement }[] = [];
  BRUSH_ORDER.forEach((door, index) => {
    const def = DOOR_STATES_BY_ID.get(door);
    const button = el('button', 'z1r-door-brush');
    button.type = 'button';
    button.dataset.door = door;
    button.title = `Paint walls ${def?.name.toLowerCase() ?? door} — key ${index + 1}`;
    button.setAttribute('aria-label', button.title);
    button.append(
      el('span', 'z1r-door-line'),
      el('span', 'z1r-door-word', door === 'unknown' ? 'Clear' : (def?.name.split(',')[0] ?? door)),
      el('kbd', 'z1r-door-key', String(index + 1)),
    );
    button.addEventListener('click', () => {
      doorBrush = door;
      redraw();
    });
    brushRow.append(button);
    brushButtons.push({ door, button });
  });

  if (interactive) {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Not always an element: an event sent to the document has the document
      // as its target, and that has no `closest`.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const door = BRUSH_ORDER[Number(event.key) - 1];
      if (!door || !/^[1-6]$/.test(event.key)) return;
      doorBrush = door;
      redraw();
    });
  }

  const room = el('div', 'z1r-door-room');
  room.setAttribute('role', 'group');
  room.setAttribute('aria-label', 'Doors');
  const hub = el('div', 'z1r-door-hub');
  room.append(hub);

  const walls: { side: RoomSide; button: HTMLButtonElement; tag: HTMLElement }[] = [];
  for (const side of ROOM_SIDES) {
    const button = el('button', 'z1r-door-wall');
    button.type = 'button';
    button.dataset.side = SIDE_CLASS[side];
    const tag = el('span', 'z1r-door-tag');
    button.append(el('span', 'z1r-door-line'), tag);
    const paint = (door: DoorState) => {
      if (!selected) return;
      commit(selected, { type: 'setRoomDoor', level, room: selected, side, state: door });
    };
    button.addEventListener('click', () => {
      if (!selected) return;
      const current = roomsOf(store.getState())[selected]?.doors[side] ?? 'unknown';
      paint(current === doorBrush ? 'unknown' : doorBrush);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      paint('unknown');
    });
    room.append(button);
    walls.push({ side, button, tag });
  }

  doorsRow.append(brushRow);

  /*
   * The room itself, drawn: its layout across the floor and its boss behind
   * that, inside the four walls the door brushes paint. It heads the card, so
   * the first thing under the room's name is what the room looks like.
   */
  const picture = el('div', 'z1r-room-picture');
  const hubBoss = el('span', 'z1r-door-boss');
  const hubLayout = el('span', 'z1r-door-layout');
  hub.append(hubBoss, hubLayout);
  picture.append(room);

  /*
   * Whether a block here might push. Never guaranteed — the randomizer decides
   * — so the row records the suspicion and then the check, not the answer.
   */
  const { row: pushLine, value: pushValue } = detailRow('Push');
  const pushGroup = segmented('Whether a block in this room might push');
  pushValue.append(pushGroup);
  const PUSH_WORD: Record<RoomPushBlock, string> = { '': 'None', maybe: 'Maybe', checked: 'Checked' };
  const PUSH_TITLE: Record<RoomPushBlock, string> = {
    '': 'No push block suspected here',
    maybe: 'A block here might push — not tried yet',
    checked: 'Tried the blocks here',
  };
  const pushButtons = ROOM_PUSH_BLOCKS.map((value) => {
    const button = segButton(PUSH_WORD[value], PUSH_TITLE[value]);
    button.dataset.push = value || 'none';
    button.addEventListener('click', () => {
      if (!selected) return;
      commit(selected, { type: 'setRoomNote', level, room: selected, patch: { pushBlock: value } });
    });
    pushGroup.append(button);
    return { value, button };
  });

  /* Every enemy killed: what a drop room asks before it gives its item up. */
  const { row: dropsLine, value: dropsValue } = detailRow('Drops');
  const clearedToggle = el('button', 'z1r-room-pick z1r-room-word', 'Cleared');
  clearedToggle.type = 'button';
  clearedToggle.title = 'Every enemy in this room killed';
  clearedToggle.addEventListener('click', () => {
    if (!selected) return;
    const current = roomsOf(store.getState())[selected]?.cleared ?? false;
    commit(selected, { type: 'setRoomNote', level, room: selected, patch: { cleared: !current } });
  });
  dropsValue.append(clearedToggle);

  const { row: waterLine, value: waterValue } = detailRow('Water');
  waterValue.append(ladderToggle);

  /*
   * The card's order, set here once every row exists: the room, then what it
   * looks like and how its doors stand, then what is in it, then the checks a
   * runner makes on the way through.
   */
  detail.append(
    idLine,
    picture,
    doorsLine,
    layoutLine,
    itemLine,
    fromRow,
    bossLine,
    stairsLine,
    pushLine,
    dropsLine,
    waterLine,
  );

  /* ------------------------------------------------------------- the passes */

  own.push((state) => {
    for (const { value, pill } of levelPills) {
      pill.setAttribute('aria-pressed', String(value === level));
      // A level with rooms recorded is drawn at full strength with a rule under
      // its own digit; one with nothing is dimmed. Two channels, no hue.
      const touched = Object.keys(roomsOf(state, value)).length > 0;
      pill.dataset.touched = String(touched);
      pill.setAttribute(
        'aria-label',
        `Level ${value} — ${touched ? 'rooms recorded' : 'nothing recorded'}`,
      );
    }

    const total = Object.keys(roomsOf(state)).length;
    count.textContent = `${total} ${total === 1 ? 'room' : 'rooms'}`;
  });

  own.push((state) => runPatches(cellPatches, state));

  let renderedItemCell: string | null = null;
  let renderedLayout: string | null = null;
  let renderedHubBoss: string | null = null;
  let renderedHubLayout: string | null = null;

  own.push((state) => {
    const brush = placement.get();
    // While something is armed, the whole sheet says what a click will do.
    paper.dataset.arming = String(ROOM_ITEMS_BY_ID.has(brush.item));
    paper.dataset.refusing = String(!!brush.item && !ROOM_ITEMS_BY_ID.has(brush.item));

    const note = selected ? roomsOf(state)[selected] : undefined;
    const off = !interactive || !selected;
    detail.dataset.empty = String(!selected);
    roomLabel.textContent = selected || 'click a room';

    visitedToggle.disabled = off;
    setToggle(visitedToggle, 'Visited', !!note?.visited);
    entranceToggle.disabled = off;
    setToggle(entranceToggle, 'Entrance', !!selected && state.levelStarts[String(level)] === selected);
    ladderToggle.disabled = off;
    setToggle(ladderToggle, 'Needs Ladder', !!note?.ladder);
    const push = note?.pushBlock ?? '';
    for (const { value, button } of pushButtons) {
      button.disabled = off;
      button.setAttribute('aria-pressed', String(!!selected && push === value));
    }
    clearedToggle.disabled = off;
    setToggle(clearedToggle, 'Cleared', !!note?.cleared);
    const layoutId = note?.layout ?? '';
    const layoutDef = ROOM_LAYOUTS_BY_ID.get(layoutId);
    layoutButton.disabled = off;
    if (off) closeLayoutMenu();
    renderedLayout = memoise(renderedLayout, layoutId, () => {
      layoutThumb.replaceChildren(...(layoutDef ? [layoutArt(layoutDef, 'z1r-layout-thumb-art')] : []));
      layoutName.textContent = layoutDef ? layoutDef.name : 'not recorded';
      layoutName.dataset.known = String(!!layoutDef);
      layoutButton.title = layoutDef
        ? `${layoutDef.name} — pick a different layout`
        : 'Pick what stands on this room’s floor';
      for (const { id, button } of layoutOptions) {
        button.setAttribute('aria-selected', String(id === layoutId));
      }
    });
    wipe.disabled = !interactive || !note;

    const item = note?.item ?? '';
    const def = item ? ROOM_ITEMS_BY_ID.get(item) : undefined;
    renderedItemCell = memoise(renderedItemCell, item, () => {
      itemCell.replaceChildren();
      if (def) itemCell.append(createSprite(resolver, def.sprite, { size: 18, label: '' }));
    });
    itemCell.dataset.known = String(!!def);
    itemCell.title = def ? def.name : 'Nothing placed — arm an item in the palette and click this room';
    // The name is the text channel for which item this is; the sprite alone
    // would ask you to recognise the art.
    itemName.textContent = def ? def.name : 'none';
    itemName.dataset.known = String(!!def);
    collectedToggle.disabled = off || !def;
    setToggle(collectedToggle, 'Collected', !!def && !!note?.collected);
    collectedToggle.title = def
      ? note?.collected
        ? `Mark ${def.name} not picked up. The inventory keeps what collecting gave it.`
        : `Mark ${def.name} picked up, which marks it held`
      : 'Nothing here to collect';
    dropItem.hidden = !def;
    dropItem.disabled = off || !def;
    dropItem.title = def ? `Forget that ${def.name} is here` : '';

    // Only a pool entry fills a slot, so only a pool entry is asked how it
    // was found.
    const slotted = !!note && POOL_BY_ID.has(item);
    fromRow.hidden = !slotted;
    const auto = note ? resolveRoomFrom({ ...note, from: 'auto' }) : 'floor';
    const from: RoomFrom = note?.from ?? 'auto';
    for (const { from: value, button } of fromButtons) {
      button.disabled = off || !slotted;
      button.setAttribute('aria-pressed', String(slotted && from === value));
      if (value === 'auto') {
        const text = `Auto · ${FROM_NAME[auto]}`;
        if (button.textContent !== text) button.textContent = text;
      }
    }

    noneBoss.disabled = off;
    noneBoss.setAttribute('aria-pressed', String(!!note && note.boss === ''));
    for (const { boss, button } of bossButtons) {
      /*
       * Ganon and Zelda are absent outside Level 9, not greyed out. A disabled
       * chip still asks to be read and wondered about, and these two are never
       * an option on any other level — there is nothing to wonder about.
       *
       * They are the last two entries in `DUNGEON_BOSSES`, so hiding them trims
       * the end of the row and leaves every other chip exactly where it was.
       * Still disabled as well as hidden, so neither can be reached by keyboard
       * while it is off the row.
       */
      const allowed = bossAllowedOnLevel(boss.id, level);
      button.hidden = !allowed;
      button.disabled = off || !allowed;
      button.dataset.allowed = String(allowed);
      button.setAttribute('aria-pressed', String(note?.boss === boss.id));
    }

    const stairs = note?.stairs ?? 'none';
    for (const { kind, button } of stairButtons) {
      button.disabled = off;
      button.setAttribute('aria-pressed', String(!!selected && stairs === kind));
    }
    /*
     * Hidden, not disabled. A pair number means nothing on a staircase that is
     * not a transport, and a disabled control still asks to be read and
     * wondered about; a missing one does not.
     */
    pairGroup.hidden = stairs !== 'transport';
    const transport = note?.transport ?? 0;
    const highest = Math.max(0, ...Object.values(roomsOf(state)).map((room) => room.transport));
    const shown = Math.min(ROOM_TRANSPORT_MAX, Math.max(PAIRS_SHOWN, highest + 1));
    ensurePairButtons(shown);
    for (const { number, button } of pairButtons) {
      button.hidden = number > shown;
      button.disabled = off || number > shown;
      button.setAttribute('aria-pressed', String(transport === number));
      button.title =
        transport === number
          ? `Transport pair ${number} — click again to unpair`
          : `Transport pair ${number}`;
    }

    const bossId = note?.boss ?? '';
    renderedHubBoss = memoise(renderedHubBoss, bossId, () => {
      const def = bossId ? DUNGEON_BOSSES_BY_ID.get(bossId) : undefined;
      hubBoss.replaceChildren(
        ...(def ? [createSprite(resolver, def.sprite, { size: 64, label: '' })] : []),
      );
    });
    renderedHubLayout = memoise(renderedHubLayout, layoutId, () => {
      hubLayout.replaceChildren(...(layoutDef ? [layoutArt(layoutDef, 'z1r-room-layout-art')] : []));
    });
    for (const { door, button } of brushButtons) {
      button.setAttribute('aria-pressed', String(door === doorBrush));
    }
    for (const { side, button, tag } of walls) {
      button.disabled = off;
      const current = note?.doors[side] ?? 'unknown';
      button.dataset.door = current;
      const def = DOOR_STATES_BY_ID.get(current);
      tag.textContent = current === 'unknown' ? '?' : (def?.tag ?? '');
      button.title = selected
        ? `${SIDE_NAME[side]}: ${doorLabel(current)} — click to paint ${doorLabel(doorBrush)}, right-click to clear`
        : 'Pick a room first';
      button.setAttribute('aria-label', button.title);
    }
  });

  patches.push((state) => runPatches(own, state));
  // Arming changes nothing in the store, so the channel drives its own redraw.
  if (interactive) placement.watch(redraw);

  return root;
}
