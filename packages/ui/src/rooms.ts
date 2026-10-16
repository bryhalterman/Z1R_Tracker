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
 * Items are not chosen here. They are armed in the Items panel and dropped by
 * clicking a room — see `createPlacement` — so the item row reports what is in
 * the room and offers only a way to take it back off. Recording an item is
 * recording *where it is*; it never grants it.
 */

import {
  DOOR_STATES,
  DOOR_STATES_BY_ID,
  DUNGEONS,
  DUNGEON_BOSSES,
  DUNGEON_BOSSES_BY_ID,
  ITEMS_BY_ID,
  ROOM_COLUMNS,
  ROOM_ITEMS,
  ROOM_ITEMS_BY_ID,
  ROOM_ROWS,
  ROOM_SIDES,
  ROOM_STAIRS,
  ROOM_STAIRS_BY_ID,
  ROOM_TRANSPORT_COUNT,
  ROOM_TRANSPORT_PAIR_SIZE,
  SHUFFLE_POOL,
  bossAllowedOnLevel,
  roomId,
  type Action,
  type DoorState,
  type ItemDef,
  type RoomItemDef,
  type RoomNote,
  type RoomSide,
  type RoomStairKind,
  type SpriteResolver,
  type Store,
} from '@z1r/core';
import { memoise, runPatches, type Patch } from './patch.js';
import { createSprite } from './sprite.js';

/* ---------------------------------------------------------------- placement */

/** What the Items panel has armed for the next room click. */
export interface PlacementBrush {
  /** True while the Items panel places instead of collecting. */
  readonly placing: boolean;
  /** `ROOM_ITEMS` id the next room click drops, or '' for nothing armed. */
  readonly item: string;
}

/**
 * The arming channel shared by the Items panel and the room sheet.
 *
 * View state, not store state, and deliberately so. A half-finished gesture —
 * "I have picked the Raft up and not yet said which room" — is not a fact about
 * the run: it must not be written to a save, must not be broadcast to the other
 * window, and must not survive a reload. It only has to reach the two panels
 * built in the same `mountTracker` call, which is exactly what this object is.
 *
 * `watch` exists because the two panels redraw off store changes and arming is
 * not one. Listeners are never removed: the channel lives and dies with the
 * mount that created it, so there is nothing to unsubscribe from.
 */
export interface PlacementChannel {
  get(): PlacementBrush;
  set(next: Partial<PlacementBrush>): void;
  watch(listener: () => void): void;
}

export function createPlacement(): PlacementChannel {
  let brush: PlacementBrush = { placing: false, item: '' };
  const listeners = new Set<() => void>();

  return {
    get: () => brush,
    set(next) {
      const merged = { ...brush, ...next };
      // Turning Place off disarms. An armed item with no mode to explain it
      // would make the next room click do something nothing on screen said.
      const item = merged.placing ? merged.item : '';
      if (merged.placing === brush.placing && item === brush.item) return;
      brush = { placing: merged.placing, item };
      for (const listener of listeners) listener();
    },
    watch(listener) {
      listeners.add(listener);
    },
  };
}

/**
 * Which `ROOM_ITEMS` entry an inventory cell arms, or '' when it has none.
 *
 * The two lists are not the same list. The Items panel renders the *inventory* —
 * eighteen cells, several of them progressive chains — while a room records a
 * *pool entry*, and the pool is what names "White Sword" and "Magical Sword"
 * separately. `SHUFFLE_POOL` already carries the join: each entry knows the
 * inventory id it grants (`itemId`) and the stage it grants it at (`value`), so
 * the mapping is derived from that rather than retyped here, and an item added
 * to the pool is placeable the same day.
 *
 * A chain maps to the next stage you do not hold yet, which is the one you are
 * recording the location of — Sword at nothing armed White Sword, Sword at
 * White armed Magical. At the top of the chain it stays on the top entry rather
 * than going dead, so re-recording a location you already collected still works.
 *
 * Inventory cells with no pool entry at all — Bombs, the Letter, the Potion,
 * the Magical Shield, the Blue Candle's cell before it upgrades — return ''.
 * The caller must make those unplaceable: an armable-looking cell that cannot
 * be armed is worse than one that is plainly out of the game.
 */
export function roomItemForInventory(def: ItemDef, held: number): string {
  const entries = SHUFFLE_POOL.filter(
    (entry) => entry.itemId === def.id && ROOM_ITEMS_BY_ID.has(entry.id),
  ).sort((a, b) => a.value - b.value);
  if (entries.length === 0) return '';
  const next = entries.find((entry) => entry.value > held);
  return (next ?? entries[entries.length - 1])?.id ?? '';
}

/** Every `ROOM_ITEMS` id an inventory cell can ever stand for. */
export function roomItemsForInventory(def: ItemDef): readonly string[] {
  return SHUFFLE_POOL.filter(
    (entry) => entry.itemId === def.id && ROOM_ITEMS_BY_ID.has(entry.id),
  ).map((entry) => entry.id);
}

/**
 * Room items no inventory cell can stand for.
 *
 * The Map, the Compass and a Triforce piece are generated per level and never
 * travel, so they have no pool entry and no inventory item; the Heart Container
 * has a pool entry whose `itemId` is empty, because the running total is on the
 * game's own HUD. All four are among the things most worth writing on a dungeon
 * map, and none of them is reachable from an inventory cell — so the Items
 * panel offers them as their own group while Place is on.
 */
export const UNHELD_ROOM_ITEMS: readonly RoomItemDef[] = ROOM_ITEMS.filter((item) => {
  const entry = SHUFFLE_POOL.find((pool) => pool.id === item.id);
  return !entry || !entry.itemId || !ITEMS_BY_ID.has(entry.itemId);
});

/* -------------------------------------------------------------------- panel */

const LEVELS: readonly number[] = DUNGEONS.map((dungeon) => dungeon.level);

/**
 * The short cycle a click on a room's edge walks.
 *
 * Unknown, open and wall are what you learn by walking into a wall, so they are
 * the three worth a click on the sheet itself. Bombable, locked and shutter are
 * rare and deliberate, so they live in the detail strip rather than costing
 * four clicks to pass on every other edge.
 */
const QUICK_CYCLE: readonly DoorState[] = ['unknown', 'open', 'wall'];

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

/** Rendered edge length of the boss art filling a cell, in CSS pixels. */
const BOSS_ART_SIZE = 34;
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

export function buildRooms(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  interactive: boolean,
  placement: PlacementChannel,
): HTMLElement {
  const root = el('section', 'z1r-panel z1r-rooms-panel');
  root.dataset.interactive = String(interactive);

  const title = el('h2', 'z1r-panel-title', 'Rooms');
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

  const paper = el('div', 'z1r-room-paper');
  const grid = el('div', 'z1r-room-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Room grid');
  paper.append(grid);
  root.append(paper);

  /** A room click: drop the armed item, or mark the room walked. */
  const touchRoom = (room: string) => {
    const armed = placement.get().item;
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
    // The same item armed and the same room clicked again takes it back off, so
    // one gesture both places and lifts.
    commit(
      room,
      current === armed
        ? { type: 'setRoomItem', level, room, item: '' }
        : { type: 'setRoomNote', level, room, patch: { item: armed, visited: true } },
    );
  };

  const stepDoor = (room: string, side: RoomSide, direction: 1 | -1) => {
    const current = roomsOf(store.getState())[room]?.doors[side] ?? 'unknown';
    const at = QUICK_CYCLE.indexOf(current);
    // A rare state set from the strip is not in the quick cycle, so a click on
    // it starts the cycle over rather than appearing to do nothing.
    const next =
      at === -1
        ? direction > 0
          ? QUICK_CYCLE[1]
          : QUICK_CYCLE[QUICK_CYCLE.length - 1]
        : QUICK_CYCLE[(at + direction + QUICK_CYCLE.length) % QUICK_CYCLE.length];
    if (!next) return;
    commit(room, { type: 'setRoomDoor', level, room, side, state: next });
  };

  const cellPatches: Patch[] = [];

  for (let row = 1; row <= ROOM_ROWS; row++) {
    for (let column = 1; column <= ROOM_COLUMNS; column++) {
      const id = roomId(column, row);
      const cell = el('button', 'z1r-room');
      cell.type = 'button';
      cell.dataset.room = id;
      cell.disabled = !interactive;
      if (interactive) {
        cell.addEventListener('click', (event) => {
          // The edges are spans inside this button and handle themselves.
          if ((event.target as HTMLElement | null)?.closest('.z1r-room-door')) return;
          touchRoom(id);
        });
      }

      const edges = ROOM_SIDES.map((side) => {
        const edge = el('span', `z1r-room-door ${SIDE_CLASS[side]}`);
        edge.dataset.side = SIDE_CLASS[side];
        edge.dataset.door = 'unknown';
        edge.setAttribute('role', 'button');
        // Reachable by pointer only: the cell itself is the keyboard target,
        // and four more tab stops per room is 256 across the sheet.
        edge.tabIndex = -1;
        if (interactive) {
          edge.addEventListener('click', (event) => {
            event.stopPropagation();
            stepDoor(id, side, 1);
          });
          edge.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            stepDoor(id, side, -1);
          });
        }
        cell.append(edge);
        return { side, edge };
      });

      const mark = el('span', 'z1r-room-mark');
      cell.append(mark);
      grid.append(cell);

      let bossArt: HTMLElement | null = null;
      let renderedBoss: string | null = null;
      let renderedMark: string | null = null;
      let renderedTitle: string | null = null;

      cellPatches.push((state) => {
        const note = roomsOf(state)[id];
        cell.dataset.visited = String(!!note?.visited);
        cell.setAttribute('aria-current', String(id === selected));

        for (const { side, edge } of edges) {
          const door = note?.doors[side] ?? 'unknown';
          edge.dataset.door = door;
          edge.title = `${id} ${SIDE_NAME[side]} — ${doorLabel(door)}`;
          edge.setAttribute('aria-label', edge.title);
        }

        const boss = note?.boss ?? '';
        renderedBoss = memoise(renderedBoss, boss, () => {
          bossArt?.remove();
          bossArt = null;
          const def = boss ? DUNGEON_BOSSES_BY_ID.get(boss) : undefined;
          if (!def) return;
          // Labelled empty so the cell's own tooltip wins: the sprite sits
          // inside the button and a title here would shadow it.
          bossArt = createSprite(resolver, def.sprite, {
            size: BOSS_ART_SIZE,
            className: 'z1r-room-boss',
            label: '',
          });
          cell.prepend(bossArt);
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
        if (note) {
          parts.push(note.visited ? 'visited' : 'not visited');
          if (item) parts.push(`holds ${ROOM_ITEMS_BY_ID.get(item)?.name ?? item}`);
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
  root.append(detail);

  const idRow = el('div', 'z1r-room-detail-row');
  idRow.append(el('span', 'z1r-room-key', 'Room'));
  const roomLabel = el('span', 'z1r-room-hint');
  idRow.append(roomLabel, el('span', 'z1r-room-spacer'));
  const idPicker = el('span', 'z1r-room-picker');

  const visitedToggle = el('button', 'z1r-room-pick z1r-room-word', 'visited');
  visitedToggle.type = 'button';
  visitedToggle.title = 'Mark this room walked, or take the mark back off';
  visitedToggle.addEventListener('click', () => {
    if (!selected) return;
    commit(selected, { type: 'toggleRoomVisited', level, room: selected });
  });

  const wipe = el('button', 'z1r-room-pick z1r-room-word', 'wipe');
  wipe.type = 'button';
  wipe.title = 'Forget everything recorded about this room';
  wipe.addEventListener('click', () => {
    if (!selected) return;
    /*
     * Written as one patch of empty values rather than a dedicated action: a
     * room that carries nothing is pruned from the save by the reducer itself,
     * so "wipe" and "never recorded" land on the same state.
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
        doors: { north: 'unknown', east: 'unknown', south: 'unknown', west: 'unknown' },
      },
    });
  });

  idPicker.append(visitedToggle, wipe);
  idRow.append(idPicker);
  detail.append(idRow);

  const itemRow = el('div', 'z1r-room-detail-row z1r-room-editable');
  itemRow.append(el('span', 'z1r-room-key', 'Item'));
  const itemSlot = el('span', 'z1r-room-item');
  itemRow.append(itemSlot);
  detail.append(itemRow);

  const bossRow = el('div', 'z1r-room-detail-row z1r-room-editable');
  bossRow.append(el('span', 'z1r-room-key', 'Boss'));
  const bossPicker = el('span', 'z1r-room-picker');
  bossRow.append(bossPicker);
  detail.append(bossRow);

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

  const stairsRow = el('div', 'z1r-room-detail-row z1r-room-editable');
  stairsRow.append(el('span', 'z1r-room-key', 'Stairs'));
  const stairsSelect = document.createElement('select');
  stairsSelect.className = 'z1r-room-stairs-kind';
  stairsSelect.title = 'What the staircase in this room is';
  for (const stair of ROOM_STAIRS) {
    stairsSelect.append(new Option(stair.tag ? `${stair.name} (${stair.tag})` : stair.name, stair.id));
  }

  /** The lowest pair with room for another half, or 1 when all four are full. */
  const nextPair = (rooms: Record<string, RoomNote>): number => {
    const counts = new Map<number, number>();
    for (const note of Object.values(rooms)) {
      if (note.transport) counts.set(note.transport, (counts.get(note.transport) ?? 0) + 1);
    }
    for (let number = 1; number <= ROOM_TRANSPORT_COUNT; number++) {
      if ((counts.get(number) ?? 0) < ROOM_TRANSPORT_PAIR_SIZE) return number;
    }
    return 1;
  };

  stairsSelect.addEventListener('change', () => {
    if (!selected) return;
    const kind = stairsSelect.value as RoomStairKind;
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
  });

  const transportSelect = document.createElement('select');
  transportSelect.className = 'z1r-room-transport-pair';
  transportSelect.title = 'Which transport pair this staircase is half of';
  transportSelect.append(new Option('pair —', '0'));
  for (let number = 1; number <= ROOM_TRANSPORT_COUNT; number++) {
    transportSelect.append(new Option(`pair ${number}`, String(number)));
  }
  transportSelect.addEventListener('change', () => {
    if (!selected) return;
    const number = Number(transportSelect.value);
    commit(
      selected,
      number === 0
        ? { type: 'clearRoomTransport', level, room: selected }
        : { type: 'placeRoomTransport', level, room: selected, number },
    );
  });

  stairsRow.append(stairsSelect, transportSelect);
  detail.append(stairsRow);

  const doorsRow = el('div', 'z1r-room-detail-row z1r-room-editable');
  doorsRow.append(el('span', 'z1r-room-key', 'Doors'));
  const doors = el('span', 'z1r-room-doors');
  doorsRow.append(doors);
  detail.append(doorsRow);

  const doorSelects = ROOM_SIDES.map((side) => {
    const label = document.createElement('label');
    label.append(el('span', 'z1r-room-door-side', SIDE_NAME[side]));
    const select = document.createElement('select');
    select.dataset.side = SIDE_CLASS[side];
    // The four states a click cannot reach are the reason this row exists, so
    // all six are offered rather than only the rare three.
    for (const door of DOOR_STATES) select.append(new Option(doorLabel(door.id), door.id));
    select.addEventListener('change', () => {
      if (!selected) return;
      const state = select.value as DoorState;
      commit(selected, { type: 'setRoomDoor', level, room: selected, side, state });
    });
    label.append(select);
    doors.append(label);
    return { side, select };
  });

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

  let renderedItemRow: string | null = null;

  own.push((state) => {
    const brush = placement.get();
    // While something is armed, the whole sheet says what a click will do.
    paper.dataset.arming = String(!!brush.item);

    const note = selected ? roomsOf(state)[selected] : undefined;
    detail.dataset.empty = String(!selected);
    roomLabel.textContent = selected || 'click a room on the grid';

    visitedToggle.disabled = !interactive || !selected;
    visitedToggle.textContent = note?.visited ? 'visited' : 'not visited';
    visitedToggle.setAttribute('aria-pressed', String(!!note?.visited));
    wipe.disabled = !interactive || !note;

    const item = note?.item ?? '';
    renderedItemRow = memoise(renderedItemRow, `${item}|${brush.placing}`, () => {
      itemSlot.replaceChildren();
      const def = item ? ROOM_ITEMS_BY_ID.get(item) : undefined;
      if (def) {
        const name = el('span', 'z1r-room-item-name', def.name);
        const drop = el('button', 'z1r-room-pick z1r-room-word', 'clear');
        drop.type = 'button';
        drop.title = `Forget that ${def.name} is here`;
        drop.disabled = !interactive;
        drop.addEventListener('click', () => {
          if (!selected) return;
          commit(selected, { type: 'setRoomItem', level, room: selected, item: '' });
        });
        itemSlot.append(createSprite(resolver, def.sprite, { size: 18, label: '' }), name, drop);
        return;
      }
      // Shown, not chosen: the item comes from the Items panel, so with nothing
      // here the row says where to get one rather than offering a picker.
      const hint = el(
        'span',
        'z1r-room-hint',
        brush.placing
          ? 'arm an item in the Items panel, then click this room'
          : 'turn on Place in the Items panel to put one here',
      );
      itemSlot.append(hint);
    });

    noneBoss.disabled = !interactive || !selected;
    noneBoss.setAttribute('aria-pressed', String(!!note && note.boss === ''));
    for (const { boss, button } of bossButtons) {
      /*
       * Ganon and Zelda are offered on Level 9 and greyed out elsewhere rather
       * than hidden: a control that moves between levels is harder to find than
       * one that dims, and its absence reads as a missing feature.
       */
      const allowed = bossAllowedOnLevel(boss.id, level);
      button.disabled = !interactive || !selected || !allowed;
      button.dataset.allowed = String(allowed);
      button.setAttribute('aria-pressed', String(note?.boss === boss.id));
    }

    stairsSelect.disabled = !interactive || !selected;
    if (document.activeElement !== stairsSelect) stairsSelect.value = note?.stairs ?? 'none';
    transportSelect.disabled = !interactive || !selected;
    if (document.activeElement !== transportSelect) {
      transportSelect.value = String(note?.transport ?? 0);
    }
    /*
     * Hidden, not disabled. A pair number means nothing on a staircase that is
     * not a transport, and a disabled control still asks to be read and
     * wondered about; a missing one does not.
     */
    transportSelect.hidden = note?.stairs !== 'transport';

    for (const { side, select } of doorSelects) {
      select.disabled = !interactive || !selected;
      if (document.activeElement !== select) select.value = note?.doors[side] ?? 'unknown';
    }
  });

  patches.push((state) => runPatches(own, state));
  // Arming changes nothing in the store, so the channel drives its own redraw.
  if (interactive) placement.watch(redraw);

  return root;
}
