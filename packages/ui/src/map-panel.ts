import {
  OVERWORLD_COLUMNS,
  overworldMap,
  OVERWORLD_STAIRWAY_COUNT,
  warpRoutes,
  REGIONS_BY_ID,
  SCREEN_ITEMS_BY_ID,
  type Action,
  type MarkKind,
  type ScreenNote,
  type SpriteResolver,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { askToConfirm } from './confirm/ask.js';
import { MAP_PREVIEW_EVENT, type MapPreview } from './map-preview.js';
import { onDispose } from './shared/disposers.js';
import {
  mountMapBrushes,
  mountMapHeading,
  mountScreenCard,
  mountScreenGrid,
  type Armed,
  type MapActions,
  type MapView,
} from './overworld/mount.js';
import type { Patch } from './patch.js';
import type { PlacementChannel } from './rooms.js';
import { el, section } from './dom.js';

export function buildMap(
  store: Store,
  resolver: SpriteResolver,
  patches: Patch[],
  placement: PlacementChannel,
): HTMLElement {
  const { root, body } = section('Overworld', 'z1r-map');
  // The palette is positioned against this panel.
  root.classList.add('z1r-map-panel');
  body.style.setProperty('--map-columns', String(OVERWORLD_COLUMNS));
  const heading = root.querySelector('.z1r-panel-title');

  /*
   * The heading's controls: Regions, the warp count, which region a hint is
   * showing, and Clear — React, see `overworld/`.
   *
   * Regions labels every screen with its hint region code: a hint names a
   * region, so the map should answer "which screens is that?" directly. It is
   * view state, held here, and Clear asks before wiping a run's worth of marks.
   */
  let regionsOn = false;
  body.dataset.regions = 'false';
  const headingHost = el('span', 'z1r-map-heading');
  heading?.append(headingHost);
  const mapHeading = mountMapHeading(headingHost);
  const clearMap = async () => {
    const marked = Object.keys(store.getState().marks).length;
    if (marked === 0) return;
    const ok = await askToConfirm({
      title: 'Clear the overworld map?',
      description: `All ${marked} marked screens are cleared. Items and the Triforce are not affected.`,
      confirm: 'Clear map',
    });
    if (ok) store.dispatch({ type: 'clearMap' });
  };
  const drawHeading = (state: TrackerState) => {
    const def = state.focusRegion ? REGIONS_BY_ID.get(state.focusRegion) : undefined;
    mapHeading.render({
      regions: regionsOn,
      onRegions: (on) => {
        regionsOn = on;
        body.dataset.regions = String(on);
        drawHeading(store.getState());
      },
      // Counted from the marks, so a stairway without its number still counts,
      // and not capped: a fifth shows as 5/4 rather than being refused.
      warpsFound: Object.values(state.marks).filter((mark) => mark === 'stairway').length,
      warpsTotal: OVERWORLD_STAIRWAY_COUNT,
      focus: def ? `showing ${def.code} · ${def.name}` : '',
      onClear: () => void clearMap(),
    });
  };
  patches.push(drawHeading);

  /*
   * The Overworld Quest picks the map, Mirrored its orientation. All six are
   * the wiki's maps in the same 1280x468 layout, so the cells place any of them
   * the same way.
   */
  const mapKey = () => {
    const { overworldQuest, mirroredOverworld } = store.getState().seed;
    const quest = overworldMap(overworldQuest);
    const base = quest === '1st' ? 'ref.overworld' : `ref.overworld.${quest}`;
    return mirroredOverworld ? `${base}.mirrored` : base;
  };

  /*
   * The marker brushes, fixed above the map, and the screen card beside it.
   *
   * The brushes were once a popover anchored to the clicked cell, which
   * covered the map and scrolled the page when the cell was low on screen.
   * Fixed in the flow they cost one row and never move. The selected screen's
   * settings, and the warp routes, sit in a card beside the grid — the same
   * shape as the room card beside the dungeon sheet.
   */
  const brushHost = el('div', 'z1r-map-brushes');
  root.insertBefore(brushHost, body);
  const brushes = mountMapBrushes(brushHost);

  const mapRow = el('div', 'z1r-map-row');
  root.insertBefore(mapRow, body);
  const cardHost = el('div', 'z1r-screen-cardhost');
  mapRow.append(body, cardHost);
  const screenCard = mountScreenCard(cardHost);

  /*
   * Select a screen, then edit it.
   *
   * This was a brush — you set what you were placing, then clicked screens to
   * place it. That reads well for painting a run of dead ends and badly for
   * everything else, because it asks you to choose a dungeon's number before
   * you have said which screen the dungeon is on. Editing a screen you had
   * already marked meant re-setting every property and stamping over it.
   *
   * So: click a screen to select it, then work left to right along the toolbar
   * — Dungeon, then which level, then what blocked you. Each control writes to
   * the selected screen the moment you touch it, and the toolbar shows what
   * that screen already holds rather than what you are about to stamp.
   *
   * The toolbar stays fixed above the map, which is the half of the old popover
   * that was worth keeping: it never covers the map and never scrolls the page.
   */
  let selected = '';

  /*
   * A marker can also be *armed*, which turns the toolbar into a palette.
   *
   * Two ways of working, because a run needs both. Sweeping a region and
   * writing off a dozen dead ends wants a palette: arm the marker once, then
   * click tiles. Coming back to one screen to say which level it was and what
   * turned you back wants the opposite — pick the screen, then edit it.
   *
   * Arming does not take the editor away. A stamped tile is also selected, so
   * the detail rows are already pointing at the tile you just marked and the
   * level and blockers are right there. That is what makes the two modes one
   * flow rather than a switch: stamp, refine, stamp the next.
   */
  /** A mark, or the start pennant, which is one per map rather than a mark. */
  let armed: Armed = '';

  /** Screens another panel is pointing at — see `applyPreview` below. */
  let previewed: ReadonlySet<string> = new Set();
  /** The warp whose routes the grid is drawing, or ''. */
  let warpFrom = '';

  /*
   * The 128 cells, drawn by React — see `overworld/ScreenGrid.tsx`. What a
   * click does stays here, with the view state it reads.
   */
  const grid = mountScreenGrid(body);
  const drawGrid = (state: TrackerState) => {
    const resolved = resolver.resolve(mapKey());
    grid.render({
      state,
      selected,
      previewed,
      warpFrom,
      // A missing or unreachable map leaves the cells blank; the codes and
      // marks carry the tracker's own information regardless.
      mapUrl: resolved.kind === 'image' ? resolved.url : '',
      resolver,
      onTouch: touchScreen,
      onClear: clearScreen,
      onCycle: cycleScreen,
      canDrop: screenCanTake,
    });
  };
  const highlightSelection = () => drawGrid(store.getState());
  /** Whether the armed item — or the one being dragged — can land on a screen. */
  const screenCanTake = () => SCREEN_ITEMS_BY_ID.has(placement.get().item);
  const clearScreen = (screen: string) => store.dispatch({ type: 'setMark', screen, mark: 'none' });
  const cycleScreen = (screen: string, direction: 1 | -1) =>
    store.dispatch({ type: 'cycleMark', screen, direction });

  const selectScreen = (screen: string) => {
    // Clicking the selected screen again lets go of it, so there is a way out
    // that is not "find somewhere harmless to click".
    selected = selected === screen ? '' : screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /*
   * A palette item dropped on a screen.
   *
   * The screen becomes an item screen holding that item, and is selected, so
   * the toolbar's spot and Collected controls are already pointing at it. It
   * fills an item location only once its spot is named, which is the toolbar's
   * question to ask rather than this click's. The same item on the same screen
   * again lifts it, the way a room does. Either way the item is put down.
   */
  const placeOnScreen = (screen: string, item: string) => {
    // The overworld holds shuffle-pool entries and the overworld-only items;
    // the Map, the Compass and a Triforce piece never leave their level.
    if (!SCREEN_ITEMS_BY_ID.has(item)) return;
    const state = store.getState();
    const isItem = state.marks[screen] === 'item';
    // One find, one placement: the item is put down once it has landed, in the
    // same redraw as the edit.
    placement.settle({ item: '' }, () => {
      if (isItem && state.screenNotes[screen]?.item === item) {
        store.dispatch({ type: 'setScreenNote', screen, patch: { item: '' } });
      } else {
        // One edit, so the half-placed screen is never saved or broadcast.
        store.dispatch({ type: 'markScreen', screen, mark: 'item', patch: { item } });
      }
      return store.getState() !== state;
    });
    selected = screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /**
   * What a click with the armed marker writes. Every mark stamps as it is —
   * a dungeon with no level yet, a warp with no number, a secret with no
   * size — and the stamped screen is selected, so the card's rows to fill
   * those in are right there. The start pennant is one per map: it moves,
   * and leaves the screen's mark alone.
   */
  const stampFor = (screen: string, kind: Exclude<Armed, ''>): Action =>
    kind === 'start'
      ? { type: 'setStartScreen', screen }
      : { type: 'markScreen', screen, mark: kind as MarkKind, patch: {} };

  /** A tile click: drop the armed item or stamp the armed marker, and edit the tile. */
  const touchScreen = (screen: string) => {
    const paletteItem = placement.get().item;
    if (paletteItem) {
      placeOnScreen(screen, paletteItem);
      return;
    }
    if (!armed) {
      selectScreen(screen);
      return;
    }
    store.dispatch(stampFor(screen, armed));
    // Selected, not toggled — clicking an already-selected tile while armed
    // should re-stamp it, not drop the selection out from under the detail rows.
    selected = screen;
    highlightSelection();
    syncToolbar(store.getState());
  };

  /*
   * What a click on the map does, as attributes the stylesheet reads.
   *
   * A palette item counts as armed here too, but only one the overworld can
   * take: a Map armed in the palette leaves the cells saying a click places
   * nothing, which is what it does.
   */
  const syncArming = () => {
    const paletteItem = placement.get().item;
    body.dataset.armed = String(!!armed || SCREEN_ITEMS_BY_ID.has(paletteItem));
    body.dataset.refusing = String(!!paletteItem && !SCREEN_ITEMS_BY_ID.has(paletteItem));
  };

  const setArmed = (kind: Armed) => {
    armed = kind;
    /*
     * The marker brush and the palette are exclusive. Each arms what the next
     * click on this map does, so with both armed one click would mean two
     * things; arming either puts the other down.
     */
    if (kind) placement.set({ item: '' });
    syncArming();
    syncToolbar(store.getState());
  };

  placement.watch(() => {
    if (placement.get().item && armed) setArmed('');
    else syncArming();
  });

  const patchSelected = (patch: Partial<ScreenNote>) => {
    if (!selected) return;
    store.dispatch({ type: 'setScreenNote', screen: selected, patch });
  };

  const actions: MapActions = {
    arm: (kind) => setArmed(kind),
    // Through `placeDungeon` and `placeStairway`, so a number set here still
    // moves off whichever screen held it before.
    pickLevel: (level) => {
      if (selected && level) store.dispatch({ type: 'placeDungeon', screen: selected, level });
    },
    pickStairway: (number) => {
      if (selected && number) store.dispatch({ type: 'placeStairway', screen: selected, number });
    },
    // The same size again takes it back off.
    pickSecret: (size) => patchSelected({ secret: size }),
    toggleBlock: (block) => {
      if (selected) store.dispatch({ type: 'toggleDungeonBlock', screen: selected, block });
    },
    toggleStock: (stock) => {
      if (selected) store.dispatch({ type: 'toggleShopStock', screen: selected, stock });
    },
    setPrice: (screen, stock, price) => {
      // An empty box is 0, which the reducer reads as "no price recorded".
      if (screen) store.dispatch({ type: 'setShopPrice', screen, stock, price });
    },
    patchNote: patchSelected,
    toggleCollected: () => {
      if (!selected) return;
      const note = store.getState().screenNotes[selected];
      if (!note?.item) return;
      store.dispatch({ type: 'collectScreen', screen: selected, collected: !note.collected });
    },
  };

  /** Draws the brushes and the screen card from the map's view state. */
  const syncToolbar = (state: TrackerState) => {
    const view: MapView = { selected, armed };
    brushes.render({ state, view, resolver, actions });
    screenCard.render({ state, view, resolver, actions });
  };

  // Escape lets go of the screen without having to find somewhere safe to click.
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // The armed marker first: it is the state that changes what a click does,
    // so it is the one you most urgently want a way out of.
    if (armed) {
      setArmed('');
      return;
    }
    if (!selected) return;
    const cell = body.querySelector<HTMLElement>(`[data-screen="${selected}"]`);
    selectScreen(selected);
    cell?.focus();
  });

  patches.push(syncToolbar);
  patches.push(drawGrid);
  // The store's pass also carries a brush put down by `placement.settle`.
  patches.push(() => syncArming());

  /*
   * Another panel pointing at a screen: the start brush, or a dungeon number
   * in the screen card, the Levels heading or Locations — see `map-preview`.
   * The matches carry `data-previewed`, and the map dims the rest. Matched
   * from the state when the event arrives, so nothing needs redrawing. Only
   * events from inside this tracker count, so two trackers stay apart.
   */
  const applyPreview = (preview: MapPreview) => {
    const state = store.getState();
    // The guides between a warp and its exits are drawn by the grid.
    warpFrom = preview?.kind === 'warp' ? preview.screen : '';
    const matches = previewMatches(state, preview);
    previewed = matches;
    // Nothing placed yet: leave the map alone rather than dim all of it.
    body.dataset.preview = String(matches.size > 0);
    drawGrid(state);
  };
  const onPreview = (event: Event) => {
    const tracker = body.closest('.z1r-tracker');
    if (!tracker || !(event.target instanceof Node) || !tracker.contains(event.target)) return;
    applyPreview((event as CustomEvent<MapPreview>).detail);
  };
  document.addEventListener(MAP_PREVIEW_EVENT, onPreview);
  // On the document, so it outlives this panel unless the mount takes it off.
  onDispose(() => document.removeEventListener(MAP_PREVIEW_EVENT, onPreview));

  return root;
}

/** The screens a preview points at, from the state as it is now. */
function previewMatches(state: TrackerState, preview: MapPreview): Set<string> {
  switch (preview?.kind) {
    case 'start':
      return new Set(state.startScreen ? [state.startScreen] : []);
    case 'warp':
      return warpMatches(state, preview.screen);
    case 'dungeon':
      return new Set(
        Object.entries(state.marks)
          .filter(
            ([screen, mark]) => mark === 'dungeon' && state.screenNotes[screen]?.dungeon === preview.level,
          )
          .map(([screen]) => screen),
      );
    default:
      return new Set();
  }
}

/** A warp: itself and the warps its three staircases lead to. */
function warpMatches(state: TrackerState, from: string): Set<string> {
  const matches = new Set<string>();
  const route = warpRoutes(state).find((r) => r.screen === from);
  if (!route) return matches;
  matches.add(from);
  for (const exit of route.exits) if (exit.screen) matches.add(exit.screen);
  return matches;
}
