/**
 * The overworld map's controls, in React with shadcn/ui: the marker brushes
 * above the map, the screen card beside it, and the heading's Regions and
 * Clear.
 *
 * The map's view state — the selected screen and the armed marker, with the
 * level, warp or size it will stamp — stays in `buildMap`, because the grid's
 * own click handling reads it. These components draw it and report every
 * change back through `MapActions`. The one thing they hold is a shop price
 * mid-typing (`PriceInput`), which commits to the screen it was typed for.
 *
 * Two states are kept apart throughout: *armed* is "the next screen you click
 * becomes this", *current* is "the selected screen already is this". Armed is a
 * thicker ring in the accent, current a solid ring, so a glance says whether a
 * click is about to change anything.
 */

import {
  coastScreen,
  COAST_SPOT_ID,
  DUNGEON_BLOCKS,
  MARKS,
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
import { useDraft } from '../shared/use-draft.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
import { cn } from '#lib/utils';
import { ClearButton } from '../panel/PanelHeading.js';
import { SearchPicker } from '../shared/SearchPicker.js';
import { CheckToggle, Row as CardRow, Segmented } from '../shared/CardControls.js';
import { spriteDim, tileVariants } from '../shared/tile-variants.js';
import { previewHandlers, type MapPreview } from '../map-preview.js';
import { Sprite } from '../shared/Sprite.js';
import { cardSubject, cardTitle, showingName, statusLine, type Showing } from './map-status.js';

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
  /** Explicit about the screen: a pending price must not follow the selection. */
  setPrice: (screen: string, stock: string, price: number) => void;
  patchNote: (patch: Partial<ScreenNote>) => void;
  toggleCollected: () => void;
}

/** A brush or stock tile: armed is a thick accent ring, current a solid ring. */
function iconTile({ armed, current }: { armed?: boolean; current?: boolean }): string {
  return cn(
    tileVariants({ ring: armed ? undefined : current ? 'on' : 'off', armed }),
    'size-7 cursor-pointer rounded-md hover:bg-accent',
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
            mark.kind === 'none'
              ? 'Clear screens. Click again to stop.'
              : `Place ${mark.name}. Click again to stop.`;
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
          className={cn(
            'ml-2 truncate text-xs',
            status.waiting ? 'font-medium text-primary' : 'text-muted-foreground',
          )}
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

/** The screen card's rows take a wider key column than the room card's. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <CardRow label={label} keys="wide">
      {children}
    </CardRow>
  );
}

/**
 * One choice of a few, the chosen one underlined as well as ringed. Separate
 * tiles that wrap, not one joined strip: nine of them are wider than the card
 * beside the map.
 */
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
    <Segmented
      label={label}
      value={value}
      options={options}
      tiles
      optionProps={preview ? (option) => previewHandlers(preview(option)) : undefined}
      onChange={onChange}
    />
  );
}

/** A ToggleGroup value for a 1-n number; 0 is none chosen. */
const numberValue = (value: number) => (value ? String(value) : '');

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({
  value: String(level),
  text: String(level),
  title: `Level ${level}`,
}));
const WARPS = [1, 2, 3, 4].map((warp) => ({
  value: String(warp),
  text: String(warp),
  title: `Warp ${warp}`,
}));
const SIZES = SECRET_SIZES.map((size) => ({
  value: size.id,
  text: size.code,
  title: `${size.name} — ${size.range} rupees when shop items are shuffled`,
}));
const ITEM_GROUPS = [
  {
    options: [
      { value: '', label: 'Item unknown' },
      ...SCREEN_ITEMS.map((entry) => ({ value: entry.id, label: entry.name })),
    ],
  },
];
// The coast is not offered: it is always `coastScreen()`, never a tag.
const SPOTS = [
  { value: '', label: 'Unnamed spot' },
  ...OVERWORLD_LOCATIONS.filter((location) => location.id !== COAST_SPOT_ID).map((location) => ({
    value: location.id,
    label: location.label,
  })),
];

/** A shop price, committed once typing pauses rather than per keystroke. */
function PriceInput({
  name,
  disabled,
  price,
  onCommit,
}: {
  name: string;
  disabled: boolean;
  price: number;
  onCommit: (price: number) => void;
}) {
  const draft = useDraft(price ? String(price) : '', (value) => onCommit(Number(value)));
  return (
    <Input
      type="number"
      min={0}
      step={1}
      placeholder="–"
      aria-label={`Price of ${name}`}
      disabled={disabled}
      value={draft.value}
      onChange={(event) => draft.onChange(event.target.value)}
      onBlur={draft.onBlur}
      className="h-6 w-10 [appearance:textfield] px-1 text-center text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

/** What a mark's rows on the screen card read. */
interface MarkRowsProps {
  readonly state: TrackerState;
  readonly view: MapView;
  readonly mark: MarkKind;
  readonly note: ScreenNote | undefined;
  readonly resolver: SpriteResolver;
  readonly actions: MapActions;
}

export function ScreenCard({ state, view, resolver, actions }: ScreenCardProps) {
  const { mark, note, showing } = cardSubject(state, view);
  const Rows = MARK_ROWS[showing];

  return (
    <TooltipProvider delay={300}>
      <div className="z1r-ui grid gap-2.5 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
        <CardHeading view={view} mark={mark} />
        {Rows ? (
          <Rows state={state} view={view} mark={mark} note={note} resolver={resolver} actions={actions} />
        ) : (
          <NothingMore showing={showing} />
        )}
      </div>
    </TooltipProvider>
  );
}

/** The screen being edited, and what to do with no screen and no marker. */
function CardHeading({ view, mark }: { view: MapView; mark: MarkKind }) {
  const { title, subtitle } = cardTitle(view, mark);
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">{title}</span>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>

      {!view.selected && !view.armed ? (
        <p className="text-xs text-muted-foreground">
          Click a screen to edit it, or pick a marker above to place it on several.
        </p>
      ) : null}
    </>
  );
}

/** A mark with no rows of its own says so, rather than leaving the card blank. */
function NothingMore({ showing }: { showing: Showing }) {
  const markName = showingName(showing);
  return markName ? (
    <p className="text-xs text-muted-foreground">Nothing more to record for {markName.toLowerCase()}.</p>
  ) : null;
}

/** A blocker or stock tile: ringed when on, greyed when off. */
function IconToggle({
  name,
  sprite,
  on,
  resolver,
  onToggle,
}: {
  name: string;
  sprite: string;
  on: boolean;
  resolver: SpriteResolver;
  onToggle: () => void;
}) {
  return (
    <Tip text={name}>
      <TooltipTrigger
        aria-label={name}
        aria-pressed={on}
        className={iconTile({ current: on })}
        onClick={onToggle}
      >
        <span className={cn('grid place-items-center', !on && spriteDim('dim'))}>
          <Sprite resolver={resolver} spriteKey={sprite} size={18} />
        </span>
      </TooltipTrigger>
    </Tip>
  );
}

function DungeonRows({ view, mark, note, resolver, actions }: MarkRowsProps) {
  const { selected, armed } = view;
  return (
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
          {DUNGEON_BLOCKS.map((block) => (
            <IconToggle
              key={block.id}
              name={block.name}
              sprite={block.sprite}
              on={!!note?.blocks.includes(block.id)}
              resolver={resolver}
              onToggle={() => actions.toggleBlock(block.id)}
            />
          ))}
        </Row>
      ) : null}
    </>
  );
}

function WarpRows({ view, note, actions }: MarkRowsProps) {
  return (
    <Row label="Warp">
      <Numbers
        label="Which warp"
        value={numberValue(view.armed === 'stairway' ? view.armedStairway : (note?.stairway ?? 0))}
        options={WARPS}
        onChange={(value) => actions.pickStairway(Number(value) || 0)}
      />
    </Row>
  );
}

function SecretRows({ view, note, actions }: MarkRowsProps) {
  return (
    <Row label="Size">
      <Numbers
        label="Secret size"
        value={view.armed === 'rupeeSecret' ? view.armedSecret : (note?.secret ?? '')}
        options={SIZES}
        onChange={(value) => actions.pickSecret(value as SecretSize)}
      />
    </Row>
  );
}

function ShopRows({ view, note, resolver, actions }: MarkRowsProps) {
  const { selected } = view;
  if (!selected) return null;
  return (
    <Row label="Sells">
      {SHOP_STOCK.map((stock) => {
        const stocked = !!note?.shop.includes(stock.id);
        const price = note?.shopPrices[stock.id] ?? 0;
        return (
          <div key={stock.id} className="flex flex-col items-center gap-1">
            <IconToggle
              name={stock.name}
              sprite={stock.sprite}
              on={stocked}
              resolver={resolver}
              onToggle={() => actions.toggleStock(stock.id)}
            />
            {/* Greyed rather than hidden until ticked, so the row never
                reflows; an empty box is no price recorded. */}
            {/* Keyed by screen as well as stock: picking another
                screen mounts a fresh field, and a price still pending
                commits to the screen it was typed for. */}
            <PriceInput
              key={`${selected}:${stock.id}`}
              name={stock.name}
              disabled={!stocked}
              price={price}
              onCommit={(value) => actions.setPrice(selected, stock.id, value)}
            />
          </div>
        );
      })}
    </Row>
  );
}

function ItemRows({ state, view, note, actions }: MarkRowsProps) {
  const { selected } = view;
  if (!selected) return null;
  return (
    <>
      <Row label="Spot">
        {selected === coastScreen(state.seed.mirroredOverworld) ? (
          // The coast is this screen and no other, so there is nothing to
          // pick: its item fills the Coast spot.
          <span
            className="pt-1.5 text-sm"
            title="The coast ledge is always this screen; only its item is shuffled"
          >
            Coast
          </span>
        ) : (
          <Select
            items={SPOTS}
            value={note?.spot ?? ''}
            onValueChange={(value) => actions.patchNote({ spot: (value as string | null) ?? '' })}
          >
            <SelectTrigger
              size="sm"
              className="w-full"
              aria-label="Which named overworld spot this screen is"
            >
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
      <PickedUpRow note={note} actions={actions} />
    </>
  );
}

function PickedUpRow({ note, actions }: { note: ScreenNote | undefined; actions: MapActions }) {
  const placed = note?.item ? SCREEN_ITEMS_BY_ID.get(note.item) : undefined;
  const got = !!placed && !!note?.collected;
  return (
    <Row label="Picked up">
      <CheckToggle
        label="Collected"
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
      />
    </Row>
  );
}

/**
 * The rows each mark brings to the card. A mark not listed here has nothing
 * more to record, and the card says so.
 */
const MARK_ROWS: Partial<Record<Showing, (props: MarkRowsProps) => React.ReactNode>> = {
  dungeon: DungeonRows,
  stairway: WarpRows,
  rupeeSecret: SecretRows,
  shop: ShopRows,
  item: ItemRows,
};

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
      <CheckToggle
        label="Regions"
        pressed={regions}
        title="Label every screen with its hint region code"
        onPressedChange={onRegions}
      />
      <span
        className="text-muted-foreground tabular-nums"
        title="Warp staircases marked, out of the four a seed has"
      >
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
