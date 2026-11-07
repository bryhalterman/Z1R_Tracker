/**
 * The overworld's 16x8 screen cells, drawn by React.
 *
 * The markup, class hooks and data attributes are the ones the plain-DOM cells
 * had, so `styles.css` and any OBS custom CSS written against them still
 * apply. What changed is the hover text: a shadcn tooltip with the screen and
 * its region as the heading and one fact per line, which also opens on
 * keyboard focus. The same facts, joined into one line, are the cell's
 * accessible name.
 *
 * The panel (`buildMap` in `tracker.ts`) keeps the view state — the selected
 * screen, the armed marker, a preview from another panel — and what a click
 * does; this only draws.
 */

import { memo, useLayoutEffect, useRef, useState } from 'react';
import {
  COAST_ITEM_REQUIRES,
  MARKS_BY_KIND,
  OVERWORLD_COLUMNS,
  OVERWORLD_ROWS,
  SHOP_STOCK_BY_ID,
  canEnterLevel9,
  coastScreen,
  dungeonItems,
  regionForScreen,
  screenId,
  warpRoutes,
  type MarkDef,
  type MarkKind,
  type WarpRoute,
  type RegionDef,
  type ScreenNote,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { SpriteArt } from '../shared/Sprite.js';
import { CellTip } from '../room-grid/CellTip.js';
import { previewHandlers } from '../map-preview.js';
import { dropTarget } from '../shared/drop-target.js';
import {
  centredSprite,
  insideEntries,
  screenDetail,
  screenFacts,
  screenHeading,
  screenLabel,
  shopView,
  type ShopView,
} from './screen-facts.js';

/**
 * Where one map image sits inside every cell.
 *
 * The map is 1280x468 with a legend strip below y=440, so the map proper is
 * exactly 16x8 screens of 80x55 — which is the NES screen aspect (1.4545) and
 * the grid's 16/11 cell ratio. One image is positioned inside every cell rather
 * than sliced into 128 files.
 */
const MAP_COLUMNS_PERCENT = 16 * 100;
const MAP_ROWS_PERCENT = (468 / 440) * 8 * 100;

const SCREENS: readonly { id: string; col: number; row: number }[] = Array.from(
  { length: OVERWORLD_ROWS * OVERWORLD_COLUMNS },
  (_, index) => {
    const col = (index % OVERWORLD_COLUMNS) + 1;
    const row = Math.floor(index / OVERWORLD_COLUMNS) + 1;
    return { id: screenId(col, row), col, row };
  },
);

export interface ScreenGridProps {
  readonly state: TrackerState;
  readonly selected: string;
  /** Screens another panel is pointing at — see `map-preview`. */
  readonly previewed: ReadonlySet<string>;
  /** A warp being hovered or focused: its routes are drawn over the map. */
  readonly warpFrom: string;
  /** The map image for the seed's quest and orientation, or '' when it did not resolve. */
  readonly mapUrl: string;
  readonly resolver: SpriteResolver;
  readonly onTouch: (screen: string) => void;
  /** Right-click: clear the mark outright. */
  readonly onClear: (screen: string) => void;
  /** Arrow keys: step through the marks. */
  readonly onCycle: (screen: string, direction: 1 | -1) => void;
  /** Whether what is being dragged from the palette can land on a screen. */
  readonly canDrop: () => boolean;
}

export function ScreenGrid(props: ScreenGridProps) {
  const { state, selected, previewed, warpFrom, mapUrl, resolver, onTouch, onClear, onCycle, canDrop } =
    props;
  const routes = warpRoutes(state);
  const mirrored = state.seed.mirroredOverworld;
  const coast = coastScreen(mirrored);
  // The coast ledge is reachable the moment the Ladder is in hand — and that
  // is exactly when you have forgotten it is there.
  const ladderHeld = (state.items[COAST_ITEM_REQUIRES] ?? 0) >= 1;
  const level9Open = canEnterLevel9(state);
  return (
    <TooltipProvider delay={300}>
      {SCREENS.map(({ id, col, row }) => {
        const mark = state.marks[id] ?? 'none';
        const note = state.screenNotes[id];
        const region = regionForScreen(id, mirrored);
        /*
         * Whatever the location slots say is in this level. Learned from a hint
         * before the dungeon is found, or from walking in without one — either
         * way it shows here, because the two are joined by level number rather
         * than by which was recorded first. Passed as a joined string so the
         * cell's memo compares it by value.
         */
        const inside = mark === 'dungeon' && note?.dungeon ? dungeonItems(state, note.dungeon).join(',') : '';
        // Where a warp's three staircases lead, as tooltip lines — joined, so
        // the memo compares it by value.
        const route = mark === 'stairway' ? routes.find((r) => r.screen === id) : undefined;
        const exits = route ? exitLines(route).join('|') : '';
        return (
          <ScreenCell
            key={id}
            id={id}
            col={col}
            row={row}
            mark={mark}
            note={note}
            region={region}
            focused={!!region && region.id === state.focusRegion}
            inside={inside}
            exits={exits}
            isStart={state.startScreen === id}
            isCoast={id === coast}
            coastReady={id === coast && ladderHeld}
            // Level 9 is the one dungeon you cannot enter on sight, so its
            // marker is called out the moment the last piece lands.
            level9Ready={note?.dungeon === 9 && level9Open}
            isSelected={id === selected}
            isPreviewed={previewed.has(id)}
            mapUrl={mapUrl}
            resolver={resolver}
            onTouch={onTouch}
            onClear={onClear}
            onCycle={onCycle}
            canDrop={canDrop}
          />
        );
      })}
      {warpFrom ? <WarpGuides from={warpFrom} routes={routes} /> : null}
    </TooltipProvider>
  );
}

const EXIT_NAME = { left: 'Left', middle: 'Middle', right: 'Right' } as const;

/** The height a guide's letter plate needs above its cell, gap included. */
const TAG_ROOM = 22;

/** The preview ring outside a tile: its 3px outline and 2px offset. */
const RING = 5;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly halfW: number;
  readonly halfH: number;
}

const inside = (p: { x: number; y: number }, b: Box) =>
  Math.abs(p.x - b.x) < b.halfW && Math.abs(p.y - b.y) < b.halfH;

/**
 * Bends tried, as a share of the distance between the two warps: straight
 * first, then a little either way, then more. The first that misses every
 * other warp and stays on the map wins, so a clear path stays straight.
 */
const BENDS = [0, 0.18, -0.18, 0.32, -0.32, 0.48, -0.48, 0.66, -0.66];
const SAMPLES = 48;

/**
 * A guide from one warp to another that does not run across a third.
 *
 * A quadratic curve through a control point pushed off the midpoint; each
 * candidate is sampled and scored by how many samples land inside another
 * warp's ring or off the map. The drawn path then starts where the curve
 * leaves the hovered warp's ring and ends where it reaches the destination's,
 * so it crosses neither tile.
 */
function guidePath(
  from: Box,
  to: Box,
  obstacles: readonly Box[],
  map: { width: number; height: number },
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // A unit normal to the straight line, for pushing the control point off it.
  const nx = -dy / length;
  const ny = dx / length;
  const curve = (bend: number) => {
    const cx = (from.x + to.x) / 2 + nx * bend * length;
    const cy = (from.y + to.y) / 2 + ny * bend * length;
    return Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = i / SAMPLES;
      const u = 1 - t;
      return {
        x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
        y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
      };
    });
  };
  const cost = (points: readonly { x: number; y: number }[]) =>
    points.filter(
      (p) => obstacles.some((b) => inside(p, b)) || p.x < 0 || p.y < 0 || p.x > map.width || p.y > map.height,
    ).length;

  let best = curve(0);
  let bestCost = cost(best);
  for (const bend of BENDS.slice(1)) {
    if (bestCost === 0) break;
    const points = curve(bend);
    const c = cost(points);
    if (c < bestCost) {
      best = points;
      bestCost = c;
    }
  }

  // Trim to the stretch between the two rings.
  const first = best.findIndex((p) => !inside(p, from));
  let last = -1;
  for (let i = best.length - 1; i >= 0; i--) {
    if (!inside(best[i]!, to)) {
      last = i;
      break;
    }
  }
  if (first < 0 || last <= first) return '';
  return best
    .slice(first, last + 1)
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/** "Left → warp 2 (B4)", or "… not marked yet" for a warp not on the map. */
function exitLines(route: WarpRoute): string[] {
  return route.exits.map(
    (exit) =>
      `${EXIT_NAME[exit.position]} → warp ${exit.warp}` +
      (exit.screen ? ` (${exit.screen})` : ', not marked yet'),
  );
}

/**
 * Guides from a hovered warp to the warps its staircases lead to: a dashed line
 * to each, and a plate on each destination with the staircase's letter. The map
 * rings the destinations and dims the rest (`previewed`), so the line, the
 * letter and the ring carry it, none of them a colour. A destination not yet on
 * the map has nothing to draw to; the warp's tooltip lists it.
 *
 * Measured from the cells rather than worked out from the grid, which is
 * centered in its panel at a cell size set from script.
 */
function WarpGuides({ from, routes }: { from: string; routes: readonly WarpRoute[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const route = routes.find((r) => r.screen === from);
  const [geometry, setGeometry] = useState<{
    exits: {
      letter: string;
      x: number;
      top: number;
      bottom: number;
      /** SVG path data, or '' for neighbours whose rings touch. */
      path: string;
    }[];
  } | null>(null);

  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || !route) {
      setGeometry(null);
      return;
    }
    const box = host.getBoundingClientRect();
    const at = (screen: string) => {
      const cell = host.querySelector(`[data-screen="${screen}"]`)?.getBoundingClientRect();
      return cell
        ? {
            x: cell.left - box.left + cell.width / 2,
            y: cell.top - box.top + cell.height / 2,
            // Half the tile plus the ring the preview draws outside it, so a
            // line ends at the ring rather than running across the tile.
            halfW: cell.width / 2 + RING,
            halfH: cell.height / 2 + RING,
            top: cell.top - box.top,
            bottom: cell.bottom - box.top,
          }
        : null;
    };
    const start = at(from);
    if (!start) {
      setGeometry(null);
      return;
    }
    // Every other warp on the map, as the box its ring covers: the guides
    // bend around these rather than run across them.
    const warps = routes.flatMap((r) => (r.screen ? [r.screen] : []));
    const exits = route.exits.flatMap((exit) => {
      const end = exit.screen ? at(exit.screen) : null;
      if (!end || !exit.screen) return [];
      const obstacles = warps
        .filter((screen) => screen !== from && screen !== exit.screen)
        .flatMap((screen) => {
          const ring = at(screen);
          return ring ? [ring] : [];
        });
      return [
        {
          letter: EXIT_NAME[exit.position][0]!,
          x: end.x,
          top: end.top,
          bottom: end.bottom,
          path: guidePath(start, end, obstacles, { width: box.width, height: box.height }),
        },
      ];
    });
    setGeometry({ exits });
    // `warpRoutes` is cached per state, so these change only when the state
    // does, not on every hover re-render.
  }, [from, route, routes]);

  return (
    <div ref={ref} className="z1r-warp-guides" aria-hidden="true">
      {geometry ? (
        <>
          <svg>
            {geometry.exits.map((exit) => (
              <g key={exit.letter}>
                <path className="z1r-warp-guide-under" d={exit.path} />
                <path className="z1r-warp-guide" d={exit.path} />
              </g>
            ))}
          </svg>
          {geometry.exits.map((exit) => {
            /*
             * Above the destination, unless that is off the top of the grid —
             * a top-row warp — where the map's scrolling row would clip it.
             * There it goes under the cell instead.
             */
            const below = exit.top < TAG_ROOM;
            return (
              <span
                key={exit.letter}
                className="z1r-warp-guide-tag"
                data-below={below}
                style={{ left: exit.x, top: below ? exit.bottom : exit.top }}
              >
                {exit.letter}
              </span>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

interface ScreenCellProps {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly mark: MarkKind;
  readonly note: ScreenNote | undefined;
  readonly region: RegionDef | undefined;
  readonly focused: boolean;
  /** Comma-joined `POOL_BY_ID` ids known to be inside this dungeon. */
  readonly inside: string;
  /** A warp's staircase lines for its tooltip, `|`-joined; '' for other screens. */
  readonly exits: string;
  readonly isStart: boolean;
  readonly isCoast: boolean;
  readonly coastReady: boolean;
  readonly level9Ready: boolean;
  readonly isSelected: boolean;
  readonly isPreviewed: boolean;
  readonly mapUrl: string;
  readonly resolver: SpriteResolver;
  readonly onTouch: (screen: string) => void;
  readonly onClear: (screen: string) => void;
  readonly onCycle: (screen: string, direction: 1 | -1) => void;
  readonly canDrop: () => boolean;
}

/**
 * One screen. Memoised on its own mark and note, so a change to one screen
 * redraws one cell: the reducer hands back the same note object for every
 * screen it did not touch.
 */
const ScreenCell = memo(function ScreenCell(props: ScreenCellProps) {
  const {
    id,
    col,
    row,
    mark,
    note,
    region,
    focused,
    exits,
    isStart,
    isCoast,
    coastReady,
    level9Ready,
    isSelected,
    isPreviewed,
    mapUrl,
    resolver,
    onTouch,
    onClear,
    onCycle,
    canDrop,
  } = props;
  const def = MARKS_BY_KIND.get(mark);
  const inside = insideEntries(props.inside);
  const shop = shopView(mark, note);
  const centred = centredSprite(mark, note, def, shop.stocked.length);
  const detail = screenDetail(mark, note);
  const facts = screenFacts({ mark, note, def, inside, exits, isStart, isCoast, coastReady, level9Ready });
  const heading = screenHeading(id, region);
  const label = screenLabel(id, region, facts);

  const first = inside[0];

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="z1r-screen"
        data-screen={id}
        data-mark={mark}
        data-start={String(isStart)}
        data-coast={String(isCoast)}
        data-coast-ready={String(coastReady)}
        data-ready={String(level9Ready)}
        data-shop-prices={String(shop.pricesShown)}
        data-region={region?.id ?? ''}
        data-focused={String(focused)}
        data-selected={String(isSelected)}
        data-previewed={String(isPreviewed)}
        style={
          {
            '--mark-color': def?.color ?? 'transparent',
          } as React.CSSProperties
        }
        aria-label={label}
        // Hovering or focusing a numbered warp draws its routes — see `WarpGuides`.
        {...(exits ? previewHandlers({ kind: 'warp', screen: id }) : {})}
        onClick={() => onTouch(id)}
        // Right-click clears outright — the common correction, and faster than
        // picking "Unmarked".
        onContextMenu={(event) => {
          event.preventDefault();
          onClear(id);
        }}
        // Arrow keys step through the marks without opening anything, which is
        // quicker than the brushes when tagging a run of screens.
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          onCycle(id, event.key === 'ArrowRight' ? 1 : -1);
        }}
        {...dropTarget(canDrop, () => onTouch(id))}
      >
        <ScreenTerrain mapUrl={mapUrl} col={col} row={row} />
        {/* The region code is the non-colour channel: two letters, always
            legible, where a tint alone would not be to a colour-blind viewer. */}
        <span className="z1r-screen-region">{region?.code ?? ''}</span>
        <span className="z1r-screen-mark">
          {/* 18 is the nominal size; the stylesheet sizes the box from the map's zoom. */}
          {centred && <SpriteArt resolver={resolver} spriteKey={centred} size={18} />}
        </span>
        {/* A dungeon draws its level as a large numeral instead of an icon. */}
        <span className="z1r-screen-level">
          {mark === 'dungeon' && note?.dungeon ? String(note.dungeon) : ''}
        </span>
        <WarpArt mark={mark} def={def} note={note} resolver={resolver} />
        {/* Only the first item: two icons in a cell is a smudge, and the rest
            are in the tooltip and the Locations panel. */}
        <span className="z1r-screen-badge">
          {first && <SpriteArt resolver={resolver} spriteKey={first.sprite} size={16} />}
        </span>
        <ShopStock shop={shop} resolver={resolver} />
        <ScreenDetail mark={mark} shop={shop} detail={detail} />
        {/* The start pennant, top-left over whatever the screen is marked as. */}
        <span className="z1r-screen-start">
          {isStart && <SpriteArt resolver={resolver} spriteKey="mark.start" size={14} />}
        </span>
      </TooltipTrigger>
      <TooltipContent className="z1r-ui max-w-64">
        <CellTip heading={heading} lines={facts} />
      </TooltipContent>
    </Tooltip>
  );
});

/** The slice of the shared map image that is this screen. */
function ScreenTerrain({ mapUrl, col, row }: { mapUrl: string; col: number; row: number }) {
  return (
    <span className="z1r-screen-terrain">
      {/*
       * Eager, not lazy: all 128 share one URL, so this is one request
       * however it is scheduled, and lazy loading was seen leaving images
       * pending with the cell in view. No referrer: the wiki serves a
       * 200x73 thumbnail instead of the original to a request carrying one.
       */}
      <img
        alt=""
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        src={mapUrl || undefined}
        style={{
          width: `${MAP_COLUMNS_PERCENT}%`,
          height: `${MAP_ROWS_PERCENT}%`,
          insetInlineStart: `${-(col - 1) * 100}%`,
          insetBlockStart: `${-(row - 1) * 100}%`,
        }}
      />
    </span>
  );
}

/** A warp draws its staircase big, with which of the four it is. */
function WarpArt({
  mark,
  def,
  note,
  resolver,
}: {
  mark: MarkKind;
  def: MarkDef | undefined;
  note: ScreenNote | undefined;
  resolver: SpriteResolver;
}) {
  return (
    <span className="z1r-screen-warp">
      {mark === 'stairway' && def?.sprite && (
        <>
          <SpriteArt resolver={resolver} spriteKey={def.sprite} size={32} />
          <span className="z1r-screen-warp-num">{note?.stairway ? String(note.stairway) : ''}</span>
        </>
      )}
    </span>
  );
}

/**
 * A shop draws what it sells, one fixed-width column per item so the price
 * line below lands under the icon it belongs to.
 */
function ShopStock({ shop, resolver }: { shop: ShopView; resolver: SpriteResolver }) {
  return (
    <>
      <span className="z1r-screen-stock">
        {shop.stocked.map((stockId, index) => {
          const entry = SHOP_STOCK_BY_ID.get(stockId);
          return (
            <span key={index} className="z1r-screen-stock-slot">
              {entry && <SpriteArt resolver={resolver} spriteKey={entry.sprite} size={14} />}
            </span>
          );
        })}
      </span>
      {/* A count, not an ellipsis: "how many more" is what you would
          otherwise open the tooltip to learn. */}
      <span className="z1r-screen-stock-more">{shop.overflow > 0 ? `+${shop.overflow}` : ''}</span>
    </>
  );
}

/** The line under the mark: a shop's prices, or the mark's short detail. */
function ScreenDetail({ mark, shop, detail }: { mark: MarkKind; shop: ShopView; detail: string }) {
  if (mark !== 'shop') {
    return (
      <span className="z1r-screen-detail" data-prices="false" data-digits="2" hidden={detail === ''}>
        {detail}
      </span>
    );
  }
  const { pricesShown, prices, widest } = shop;
  return (
    <span
      className="z1r-screen-detail"
      data-prices={String(pricesShown)}
      data-digits={String(Math.min(Math.max(widest, 2), 4))}
      hidden={!pricesShown}
    >
      {pricesShown &&
        prices.map((price, index) => (
          <span key={index} className="z1r-screen-price">
            {price > 0 ? String(price) : ''}
          </span>
        ))}
    </span>
  );
}
