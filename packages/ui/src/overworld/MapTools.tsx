/**
 * The overworld map's controls, in React with shadcn/ui: the marker brushes
 * above the map, the screen card beside it, and the heading's Regions and
 * Clear.
 *
 * The map's view state — the selected screen and the armed marker, with the
 * level, warp or size it will stamp — stays in `buildMap`, because the grid's
 * own click handling reads it. These components draw it and report every
 * change back through `MapActions`; they hold no state of their own.
 *
 * Two states are kept apart throughout: *armed* is "the next screen you click
 * becomes this", *current* is "the selected screen already is this". Armed is a
 * thicker ring in the accent, current a solid ring, so a glance says whether a
 * click is about to change anything.
 */

import { CheckIcon } from 'lucide-react';
import {
  coastScreen,
  COAST_SPOT_ID,
  DUNGEON_BLOCKS,
  MARKS,
  MARKS_BY_KIND,
  OVERWORLD_LOCATIONS,
  SCREEN_ITEMS,
  SCREEN_ITEMS_BY_ID,
  SECRET_SIZES,
  SHOP_STOCK,
  type MarkKind,
  type ScreenNote,
  type SecretSize,
  type SpriteResolver,
  type TrackerState,
} from '@z1r/core';
import { Input } from '#components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
import { Toggle } from '#components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { cn } from '#lib/utils';
import { ClearButton } from '../panel/PanelHeading.js';
import { SearchPicker } from '../shared/SearchPicker.js';
import { previewHandlers, type MapPreview } from '../map-preview.js';
import { Sprite } from '../shared/Sprite.js';

export type Armed = MarkKind | 'start' | '';

/** The map's view state, as `buildMap` holds it. */
export interface MapView {
  selected: string;
  armed: Armed;
  armedLevel: number;
  armedStairway: number;
  armedSecret: SecretSize;
}

export interface MapActions {
  arm: (kind: Armed) => void;
  /** 0 takes an armed level back off. */
  pickLevel: (level: number) => void;
  pickStairway: (number: number) => void;
  pickSecret: (size: SecretSize) => void;
  toggleBlock: (block: string) => void;
  toggleStock: (stock: string) => void;
  setPrice: (stock: string, price: number) => void;
  patchNote: (patch: Partial<ScreenNote>) => void;
  toggleCollected: () => void;
}

const LABEL = 'text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase';

/** A brush or stock tile: armed is a thick accent ring, current a solid ring. */
function iconTile({ armed, current }: { armed?: boolean; current?: boolean }): string {
  return cn(
    'relative grid size-7 cursor-pointer place-items-center rounded-md transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent',
    armed
      ? 'shadow-[inset_0_0_0_2.5px_var(--primary)]'
      : current
        ? 'bg-secondary shadow-[inset_0_0_0_1.5px_var(--foreground)]'
        : 'shadow-[inset_0_0_0_1px_var(--border)]',
  );
}

/** A tile tinted from `--tint`: muted at rest, a step stronger on hover. */
const TINTED =
  'bg-[color-mix(in_srgb,var(--tint)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--tint)_45%,transparent)]';

/** A small labelled tooltip around any trigger. */
function Tip({ text, children }: { text: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      {children}
      <TooltipContent className="z1r-ui max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

/* ----------------------------------------------------------------- brushes */

export interface MapBrushesProps {
  state: TrackerState;
  view: MapView;
  resolver: SpriteResolver;
  actions: MapActions;
}

/** What the next click on the map does, in the order the controls read. */
function statusLine({ state, view }: Pick<MapBrushesProps, 'state' | 'view'>): { text: string; waiting: boolean } {
  const { selected, armed, armedLevel, armedStairway, armedSecret } = view;
  if (armed === 'dungeon' && !armedLevel) return { text: 'Pick a level', waiting: true };
  if (armed === 'stairway' && !armedStairway) return { text: 'Pick a warp', waiting: true };
  if (armed === 'dungeon') return { text: `Placing Level ${armedLevel}`, waiting: false };
  if (armed === 'stairway') return { text: `Placing Warp ${armedStairway}`, waiting: false };
  if (armed === 'rupeeSecret' && armedSecret) {
    const size = SECRET_SIZES.find((entry) => entry.id === armedSecret)?.name ?? '';
    return { text: `Placing ${size} rupee secret`, waiting: false };
  }
  if (armed === 'start') return { text: 'Placing the start', waiting: false };
  if (armed) return { text: `Placing ${MARKS_BY_KIND.get(armed)?.name ?? armed}`, waiting: false };
  if (selected) {
    const mark = state.marks[selected];
    return { text: `${selected} selected${mark ? ` · ${MARKS_BY_KIND.get(mark)?.name ?? mark}` : ''}`, waiting: false };
  }
  return { text: 'Pick a screen, or a marker to place', waiting: false };
}

export function MapBrushes(props: MapBrushesProps) {
  const { state, view, resolver, actions } = props;
  const current = view.selected ? (state.marks[view.selected] ?? 'none') : '';
  const isStart = !!view.selected && state.startScreen === view.selected;
  const status = statusLine(props);

  return (
    <TooltipProvider delay={300}>
      <div className="z1r-ui flex flex-wrap items-center gap-1.5 text-sm text-foreground">
        {MARKS.map((mark) => {
          const armed = view.armed === mark.kind;
          const text =
            mark.kind === 'none' ? 'Clear screens. Click again to stop.' : `Place ${mark.name}. Click again to stop.`;
          return (
            <Tip key={mark.kind} text={text}>
              <TooltipTrigger
                aria-label={text}
                aria-pressed={armed}
                data-mark={mark.kind}
                data-armed={armed}
                data-active={current === mark.kind}
                // Each mark's own colour as a muted tint behind its icon — a
                // second cue only; the icon's shape is what names it.
                style={{ '--tint': mark.color } as React.CSSProperties}
                className={cn(iconTile({ armed, current: current === mark.kind }), TINTED)}
                onClick={() => actions.arm(armed ? '' : mark.kind)}
              >
                <Sprite resolver={resolver} spriteKey={mark.sprite ?? 'mark.clear'} size={18} />
              </TooltipTrigger>
            </Tip>
          );
        })}
        {/* The start pennant: one per map, so it is set apart from the marks. */}
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
        <Tip text="Place the start screen. One per map. Click again to stop.">
          <TooltipTrigger
            aria-label="Place the start screen. One per map. Click again to stop."
            aria-pressed={view.armed === 'start'}
            data-mark="start"
            style={{ '--tint': 'var(--primary)' } as React.CSSProperties}
            className={cn(iconTile({ armed: view.armed === 'start', current: isStart }), TINTED)}
            // Hovering the start brush points at the start screen, once placed.
            {...previewHandlers({ kind: 'start' })}
            onClick={() => actions.arm(view.armed === 'start' ? '' : 'start')}
          >
            <Sprite resolver={resolver} spriteKey="mark.start" size={18} />
          </TooltipTrigger>
        </Tip>
        <span
          className={cn('ml-2 truncate text-xs', status.waiting ? 'font-medium text-primary' : 'text-muted-foreground')}
          aria-live="polite"
        >
          {status.text}
        </span>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------- screen card */

export interface ScreenCardProps {
  state: TrackerState;
  view: MapView;
  resolver: SpriteResolver;
  actions: MapActions;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
      <span className={cn(LABEL, 'pt-1.5')}>{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** One choice of a few, the chosen one underlined as well as ringed. */
function Numbers({
  label,
  value,
  options,
  onChange,
  preview,
}: {
  label: string;
  value: string;
  options: readonly { value: string; text: string; title?: string }[];
  onChange: (value: string) => void;
  /** What hovering an option points the map at, if anything. */
  preview?: (value: string) => Exclude<MapPreview, null>;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      // Separate tiles that wrap, not one joined strip: nine of them are wider
      // than the card beside the map, and a joined strip cannot break a line.
      spacing={1}
      className="flex-wrap"
      value={value ? [value] : []}
      onValueChange={(next) => onChange(next[0] ?? '')}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          className="min-w-7 data-[pressed]:border-primary data-[pressed]:underline data-[pressed]:underline-offset-4"
          {...(preview ? previewHandlers(preview(option.value)) : {})}
        >
          {option.text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A ToggleGroup value for a 1-n number; 0 is none chosen. */
const numberValue = (value: number) => (value ? String(value) : '');

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({ value: String(level), text: String(level), title: `Level ${level}` }));
const WARPS = [1, 2, 3, 4].map((warp) => ({ value: String(warp), text: String(warp), title: `Warp ${warp}` }));
const SIZES = SECRET_SIZES.map((size) => ({
  value: size.id,
  text: size.code,
  title: `${size.name} — ${size.range} rupees when shop items are shuffled`,
}));
const ITEM_GROUPS = [{ options: [{ value: '', label: 'Item unknown' }, ...SCREEN_ITEMS.map((entry) => ({ value: entry.id, label: entry.name }))] }];
// The coast is not offered: it is always `coastScreen()`, never a tag.
const SPOTS = [
  { value: '', label: 'Unnamed spot' },
  ...OVERWORLD_LOCATIONS.filter((location) => location.id !== COAST_SPOT_ID).map((location) => ({
    value: location.id,
    label: location.label,
  })),
];

export function ScreenCard({ state, view, resolver, actions }: ScreenCardProps) {
  const { selected, armed } = view;
  const mark = selected ? (state.marks[selected] ?? 'none') : 'none';
  const note = selected ? state.screenNotes[selected] : undefined;
  // The rows shown are for whichever the card is describing: the marker being
  // armed, or the screen being edited.
  const showing: MarkKind | 'start' | '' = armed || (selected ? mark : '');
  const markName = showing && showing !== 'start' && showing !== 'none' ? MARKS_BY_KIND.get(showing)?.name : '';
  const placed = note?.item ? SCREEN_ITEMS_BY_ID.get(note.item) : undefined;
  const got = !!placed && !!note?.collected;

  /*
   * The card names the screen it edits. Arming does not take the editor away:
   * a stamped screen is also selected, so its rows are right here to refine
   * — stamp, refine, stamp the next.
   */
  const title = selected || (armed ? 'Pick a screen' : 'No screen selected');
  const subtitle = selected ? (MARKS_BY_KIND.get(mark)?.name ?? 'Unmarked') : '';

  return (
    <TooltipProvider delay={300}>
      <div className="z1r-ui grid gap-2.5 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">{title}</span>
          {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
        </div>

        {!selected && !armed ? (
          <p className="text-xs text-muted-foreground">
            Click a screen to edit it, or pick a marker above to place it on several.
          </p>
        ) : null}

        {showing === 'dungeon' ? (
          <>
            <Row label="Level">
              <Numbers
                label="Level"
                value={numberValue(armed === 'dungeon' ? view.armedLevel : (note?.dungeon ?? 0))}
                options={LEVELS}
                onChange={(value) => actions.pickLevel(Number(value) || 0)}
                // Hovering a number points at where that level already is.
                preview={(value) => ({ kind: 'dungeon', level: Number(value) })}
              />
            </Row>
            {/* Blockers belong to a dungeon, and the reducer refuses them on
                anything else, so the row is only offered on a dungeon screen —
                not on a shop selected while the dungeon brush is armed. */}
            {selected && mark === 'dungeon' ? (
              <Row label="Blocked by">
                {DUNGEON_BLOCKS.map((block) => {
                  const on = !!note?.blocks.includes(block.id);
                  return (
                    <Tip key={block.id} text={block.name}>
                      <TooltipTrigger
                        aria-label={block.name}
                        aria-pressed={on}
                        className={iconTile({ current: on })}
                        onClick={() => actions.toggleBlock(block.id)}
                      >
                        <span className={cn('grid place-items-center', !on && '[&_.z1r-sprite]:opacity-40 [&_.z1r-sprite]:grayscale')}>
                          <Sprite resolver={resolver} spriteKey={block.sprite} size={18} />
                        </span>
                      </TooltipTrigger>
                    </Tip>
                  );
                })}
              </Row>
            ) : null}
          </>
        ) : null}

        {showing === 'stairway' ? (
          <Row label="Warp">
            <Numbers
              label="Which warp"
              value={numberValue(armed === 'stairway' ? view.armedStairway : (note?.stairway ?? 0))}
              options={WARPS}
              onChange={(value) => actions.pickStairway(Number(value) || 0)}
            />
          </Row>
        ) : null}

        {showing === 'rupeeSecret' ? (
          <Row label="Size">
            <Numbers
              label="Secret size"
              value={armed === 'rupeeSecret' ? view.armedSecret : (note?.secret ?? '')}
              options={SIZES}
              onChange={(value) => actions.pickSecret(value as SecretSize)}
            />
          </Row>
        ) : null}

        {showing === 'shop' && selected ? (
          <Row label="Sells">
            {SHOP_STOCK.map((stock) => {
              const stocked = !!note?.shop.includes(stock.id);
              const price = note?.shopPrices[stock.id] ?? 0;
              return (
                <div key={stock.id} className="flex flex-col items-center gap-1">
                  <Tip text={stock.name}>
                    <TooltipTrigger
                      aria-label={stock.name}
                      aria-pressed={stocked}
                      className={iconTile({ current: stocked })}
                      onClick={() => actions.toggleStock(stock.id)}
                    >
                      <span className={cn('grid place-items-center', !stocked && '[&_.z1r-sprite]:opacity-40 [&_.z1r-sprite]:grayscale')}>
                        <Sprite resolver={resolver} spriteKey={stock.sprite} size={18} />
                      </span>
                    </TooltipTrigger>
                  </Tip>
                  {/* Greyed rather than hidden until ticked, so the row never
                      reflows; an empty box is no price recorded. */}
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="–"
                    aria-label={`Price of ${stock.name}`}
                    disabled={!stocked}
                    value={price ? String(price) : ''}
                    onChange={(event) => actions.setPrice(stock.id, Number(event.target.value))}
                    className="h-6 w-10 [appearance:textfield] px-1 text-center text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
              );
            })}
          </Row>
        ) : null}

        {showing === 'item' && selected ? (
          <>
            <Row label="Spot">
              {selected === coastScreen(state.seed.mirroredOverworld) ? (
                // The coast is this screen and no other, so there is nothing to
                // pick: its item fills the Coast spot.
                <span className="pt-1.5 text-sm" title="The coast ledge is always this screen; only its item is shuffled">
                  Coast
                </span>
              ) : (
                <Select
                  items={SPOTS}
                  value={note?.spot ?? ''}
                  onValueChange={(value) => actions.patchNote({ spot: (value as string | null) ?? '' })}
                >
                  <SelectTrigger size="sm" className="w-full" aria-label="Which named overworld spot this screen is">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z1r-ui">
                    {SPOTS.map((spot) => (
                      <SelectItem key={spot.value || 'none'} value={spot.value}>
                        {spot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Row>
            <Row label="Item">
              <SearchPicker
                label="Item"
                value={note?.item ?? ''}
                placeholder="Item unknown"
                groups={ITEM_GROUPS}
                className="w-full"
                onPick={(item) => actions.patchNote({ item })}
              />
            </Row>
            <Row label="Picked up">
              <Toggle
                variant="outline"
                size="sm"
                pressed={got}
                disabled={!placed}
                title={
                  placed
                    ? got
                      ? `Mark ${placed.name} not picked up. The inventory keeps what collecting gave it.`
                      : `Mark ${placed.name} picked up, which marks it held`
                    : 'Nothing on this screen to collect'
                }
                onPressedChange={actions.toggleCollected}
                className="data-[pressed]:border-primary"
              >
                {got ? <CheckIcon data-icon="inline-start" /> : null}
                Collected
              </Toggle>
            </Row>
          </>
        ) : null}

        {markName && !['dungeon', 'stairway', 'rupeeSecret', 'shop', 'item'].includes(showing) ? (
          <p className="text-xs text-muted-foreground">Nothing more to record for {markName.toLowerCase()}.</p>
        ) : null}

      </div>
    </TooltipProvider>
  );
}

/* ----------------------------------------------------------------- heading */

export interface MapHeadingProps {
  regions: boolean;
  onRegions: (on: boolean) => void;
  warpsFound: number;
  warpsTotal: number;
  /** "showing LK · By a Lake", or ''. */
  focus: string;
  /** Absent where the map cannot be edited. */
  onClear?: () => void;
}

export function MapHeading({ regions, onRegions, warpsFound, warpsTotal, focus, onClear }: MapHeadingProps) {
  return (
    <span className="z1r-ui ml-2 inline-flex min-w-0 flex-1 items-center gap-2 text-xs font-normal tracking-normal normal-case">
      <Toggle
        variant="outline"
        size="sm"
        pressed={regions}
        onPressedChange={onRegions}
        title="Label every screen with its hint region code"
        className="data-[pressed]:border-primary"
      >
        {regions ? <CheckIcon data-icon="inline-start" /> : null}
        Regions
      </Toggle>
      <span className="text-muted-foreground tabular-nums" title="Warp staircases marked, out of the four a seed has">
        Warps {warpsFound}/{warpsTotal}
      </span>
      {focus ? <span className="truncate text-primary">{focus}</span> : null}
      {onClear ? (
        <ClearButton
          className="ml-auto"
          title="Remove every mark from the map. Items and Triforce are untouched."
          onClear={onClear}
        />
      ) : null}
    </span>
  );
}
