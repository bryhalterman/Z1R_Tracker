/**
 * Item locations, compact: one column per level and one for the overworld —
 * or, in the page's left column, one row each — in React with shadcn/ui.
 * Built for the page and the OBS dock; the
 * read-only overlay keeps its plain-DOM columns, which draw synchronously so
 * the overlay can size itself on its first paint.
 *
 * Each column is headed by its level's Triforce piece and holds a chip per
 * item slot. Which item is in a slot is set on the maps, not here; a chip
 * toggles collected on whichever room or screen it was read from, from either
 * mouse button.
 *
 * "Style B", like the palette: a collected chip is raised with a solid ring; an
 * uncollected one is hollow, its sprite gray and faded. A slot past its level's
 * count carries a dotted ring outside, so the two facts read together.
 */

import {
  SCREEN_ITEMS_BY_ID,
  TRIFORCE_REQUIRED_FOR_L9,
  deriveItemLocations,
  type Action,
  type ItemPlacement,
  type LocationDef,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { cn } from '#lib/utils';
import { Sprite } from '../shared/Sprite.js';
import { previewHandlers } from '../map-preview.js';

export interface CompactLocationsProps {
  state: TrackerState;
  resolver: SpriteResolver;
  dispatch: (action: Action) => void;
  /**
   * One row per level instead of one column: the page's left column, which is
   * narrow and tall where the dock is wide and short. Each row is the piece,
   * then the level's slots.
   */
  rows?: boolean;
}

const KIND_TITLE: Record<string, string> = {
  floor: 'Lying on the dungeon floor',
  stair: 'Behind a staircase / item basement',
  heart: 'Heart Container',
  overworld: 'Named overworld location',
};

/** Single letter per slot kind — the whole label will not fit at this size. */
const KIND_INITIAL: Record<string, string> = { floor: 'F', stair: 'S', heart: 'H', overworld: 'O' };

/** The three overworld spots are not interchangeable, so they do not share a letter. */
const SPOT_CODE: Record<string, string> = { 'ow.whiteSword': 'WS', 'ow.armos': 'AR', 'ow.coast': 'CO' };

/**
 * Toggle a filled slot's collected flag on whatever it was read from. A slot is
 * a view of a placement, so collecting one is collecting the room or screen
 * behind it; only a slot an older save holds directly goes through
 * `collectLocation`. An empty slot has nothing to collect.
 */
function toggleCollected(dispatch: CompactLocationsProps['dispatch'], location: LocationDef | null, placement: ItemPlacement | null) {
  if (!placement) return;
  const collected = !placement.collected;
  const source = placement.source;
  if (source.kind === 'room') dispatch({ type: 'collectRoom', level: source.level, room: source.room, collected });
  else if (source.kind === 'screen') dispatch({ type: 'collectScreen', screen: source.screen, collected });
  else if (location) dispatch({ type: 'collectLocation', id: location.id, collected });
}

function Chip({
  kind,
  location,
  placement,
  resolver,
  dispatch,
}: {
  kind: string;
  location: LocationDef | null;
  placement: ItemPlacement | null;
} & Pick<CompactLocationsProps, 'resolver' | 'dispatch'>) {
  const entry = placement?.item ? SCREEN_ITEMS_BY_ID.get(placement.item) : undefined;
  const collected = !!placement?.collected;
  const where = location ? location.label : `Extra ${KIND_TITLE[kind]?.toLowerCase() ?? kind}`;
  const text =
    `${where} — ${entry?.name ?? 'unknown'}${collected ? ' (collected)' : ''}` +
    (placement ? '' : ' — place it on a map to record it');
  const toggle = () => toggleCollected(dispatch, location, placement);

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={text}
        aria-pressed={collected}
        data-kind={kind}
        data-known={!!entry}
        data-collected={collected}
        data-overflow={location ? undefined : 'true'}
        onClick={toggle}
        onContextMenu={(event) => {
          event.preventDefault();
          toggle();
        }}
        className={cn(
          'relative grid size-6 cursor-pointer place-items-center rounded-md text-[10px] font-bold transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent',
          collected
            ? 'bg-secondary text-foreground shadow-[inset_0_0_0_1.5px_var(--foreground)]'
            : 'text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] [&_.z1r-sprite]:opacity-40 [&_.z1r-sprite]:grayscale',
          !location && 'outline-1 outline-offset-1 outline-dotted outline-destructive',
        )}
      >
        {entry ? (
          <Sprite resolver={resolver} spriteKey={entry.sprite} size={16} />
        ) : (
          ((location ? SPOT_CODE[location.id] : undefined) ?? KIND_INITIAL[kind] ?? '?')
        )}
      </TooltipTrigger>
      <TooltipContent className="z1r-ui max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The level's Triforce piece, as its column's heading. Held is the triangle at
 * full strength; not held is the triangle gray and faded. The level number
 * sits on the triangle's base in both states, so the column is named whatever
 * the piece is.
 */
function PieceHead({ level, state, resolver, dispatch }: { level: string } & CompactLocationsProps) {
  const held = state.dungeons[level]?.triforce ?? false;
  const text = `Level ${level} Triforce piece — ${held ? 'collected' : 'not collected'}`;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={text}
        aria-pressed={held}
        data-on={held}
        onClick={() => dispatch({ type: 'setDungeon', level: Number(level), patch: { triforce: !held } })}
        // Hovering a level's piece points at its entrance on the overworld map.
        {...previewHandlers({ kind: 'dungeon', level: Number(level) })}
        // No tile and no ring: the triangle is the control. Held is the piece
        // in full color with a dark numeral, not held the piece gray and faded
        // with a light one — two channels that are not hue.
        className={cn(
          'relative grid size-6 cursor-pointer place-items-center rounded-md outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          !held && '[&_.z1r-sprite]:opacity-40 [&_.z1r-sprite]:grayscale',
        )}
      >
        <Sprite resolver={resolver} spriteKey="ui.triforce" size={20} />
        <span
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-1 text-center text-[9px] leading-none tabular-nums',
            held ? 'font-extrabold text-background' : 'font-semibold text-foreground',
          )}
        >
          {level}
        </span>
      </TooltipTrigger>
      <TooltipContent className="z1r-ui">{text}</TooltipContent>
    </Tooltip>
  );
}

export function CompactLocations(props: CompactLocationsProps) {
  const { state, resolver, dispatch, rows = false } = props;
  const derived = deriveItemLocations(state);

  // The level groups in listed order, keyed `L1`-`L9` and `OW`.
  const groups = new Map<string, LocationDef[]>();
  for (const { location } of derived.slots) {
    const key = location.level === undefined ? 'OW' : `L${location.level}`;
    const list = groups.get(key);
    if (list) list.push(location);
    else groups.set(key, [location]);
  }

  return (
    <TooltipProvider delay={400}>
      <div
        className={cn(
          'z1r-ui',
          rows ? 'flex flex-col gap-1' : 'grid auto-cols-max grid-flow-col items-start justify-start gap-1',
        )}
      >
        {[...groups].map(([label, list]) => {
          const level = /^L([1-9])$/.exec(label)?.[1];
          const groupLevel = list[0]?.level;
          const overflow = groupLevel === undefined ? derived.overworldOverflow : (derived.overflow.get(groupLevel) ?? []);
          return (
            <div key={label} className={cn('flex items-center gap-1', rows ? 'flex-row flex-wrap' : 'flex-col')}>
              {level && Number(level) <= TRIFORCE_REQUIRED_FOR_L9 ? (
                <PieceHead level={level} {...props} />
              ) : (
                // Level 9 holds Ganon and has no piece, and the overworld is not
                // a level: a label in the same box, so the slots still line up.
                <span
                  className="grid size-6 place-items-center text-[10px] font-bold text-muted-foreground"
                  title={level ? `Level ${level} — Ganon, no Triforce piece` : 'Overworld locations'}
                  {...(level ? previewHandlers({ kind: 'dungeon', level: Number(level) }) : {})}
                >
                  {level ?? label}
                </span>
              )}
              {list.map((location) => (
                <Chip
                  key={location.id}
                  kind={location.kind}
                  location={location}
                  placement={derived.byId.get(location.id) ?? null}
                  resolver={resolver}
                  dispatch={dispatch}
                />
              ))}
              {overflow.map((placement, index) => (
                <Chip
                  key={`overflow-${index}`}
                  kind={'kind' in placement && typeof placement.kind === 'string' ? placement.kind : 'overworld'}
                  location={null}
                  placement={placement}
                  resolver={resolver}
                  dispatch={dispatch}
                />
              ))}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
