/**
 * The hint log, in React with shadcn/ui.
 *
 * A Z1R hint pairs a subject with an overworld region — "Digdogger gazes… By a
 * Lake" — so a row is exactly that pair, plus optional bookkeeping. Picking a
 * region focuses it on the overworld grid, which is the whole point: a hint
 * should turn 128 screens into the eight or so worth walking to.
 *
 * Renders in the toolbar's bottom sheet and, for the windows that ask for the
 * `hintlog` section by name, inline in a panel. The only state it holds is
 * what is mid-typing in a row's screen and note fields (`useDraft`), which
 * commits once typing pauses.
 */

import { CircleIcon, CircleDotIcon, PlusIcon, XIcon } from 'lucide-react';
import {
  DUNGEONS,
  REGIONS,
  REGIONS_BY_ID,
  SHUFFLE_POOL,
  screensInRegion,
  type Action,
  type HintEntry,
  type TrackerState,
} from '@z1r/core';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { useDraft } from '../shared/use-draft.js';
import { Toggle } from '#components/ui/toggle';
import { SearchPicker, type PickerGroup } from '../shared/SearchPicker.js';

export interface HintListProps {
  state: TrackerState;
  interactive: boolean;
  dispatch: (action: Action) => void;
  /** Called after Show turns a region on, so a sheet can get out of the map's way. */
  onShown?: () => void;
}

/* The in-game phrasing is what you actually hear, so it leads the subject. */
const SUBJECTS: readonly PickerGroup[] = [
  {
    heading: 'Dungeons',
    options: DUNGEONS.map((dungeon) => ({
      value: `d${dungeon.level}`,
      label: `${dungeon.hint} (L${dungeon.level})`,
      keywords: [`level ${dungeon.level}`, `L${dungeon.level}`],
    })),
  },
  { heading: 'Items', options: SHUFFLE_POOL.map((entry) => ({ value: entry.id, label: entry.name })) },
];

const REGION_OPTIONS: readonly PickerGroup[] = [
  { options: REGIONS.map((def) => ({ value: def.id, label: `${def.code} · ${def.name}`, keywords: [def.code] })) },
];

function HintRow({
  hint,
  state,
  interactive,
  dispatch,
  onShown,
}: {
  hint: HintEntry;
} & HintListProps) {
  const update = (patch: Partial<Omit<HintEntry, 'id'>>) => dispatch({ type: 'updateHint', id: hint.id, patch });
  const screenDraft = useDraft(hint.screen, (screen) => update({ screen }));
  const noteDraft = useDraft(hint.note, (note) => update({ note }));
  const region = hint.region ? REGIONS_BY_ID.get(hint.region) : undefined;
  const focused = !!hint.region && state.focusRegion === hint.region;
  const screens = region ? screensInRegion(region.id, state.seed.mirroredOverworld).length : 0;

  return (
    // Wraps to two lines in a narrow window — the map dock — rather than
    // squeezing six controls into ellipsis.
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-transparent px-1 py-0.5 data-[focused=true]:border-primary"
      data-focused={focused}
    >
      <SearchPicker
        label="Subject"
        value={hint.subject}
        placeholder="subject"
        groups={SUBJECTS}
        disabled={!interactive}
        className="flex-[2_1_12rem]"
        onPick={(subject) => update({ subject })}
      />
      <SearchPicker
        label="Region"
        value={hint.region}
        placeholder="region"
        groups={REGION_OPTIONS}
        disabled={!interactive}
        className="flex-[1_1_8rem]"
        onPick={(value) => {
          update({ region: value });
          // Choosing a region is almost always followed by wanting to see it.
          if (value && state.focusRegion !== value) dispatch({ type: 'focusRegion', region: value });
        }}
      />
      {/* Words and a filled or hollow ring, not just a highlight colour. */}
      <Toggle
        variant="outline"
        size="sm"
        pressed={focused}
        disabled={!interactive || !region}
        title={region ? `${focused ? 'Hide' : 'Show'} ${region.name} on the map (${screens} screens)` : 'Pick a region first'}
        onPressedChange={(pressed) => {
          if (!hint.region) return;
          dispatch({ type: 'focusRegion', region: hint.region });
          if (pressed) onShown?.();
        }}
        className="data-[pressed]:border-primary"
      >
        {focused ? <CircleDotIcon data-icon="inline-start" /> : <CircleIcon data-icon="inline-start" />}
        {focused ? 'On map' : 'Show'}
      </Toggle>
      <Input
        aria-label="Screen the hint was heard at"
        placeholder="heard at"
        maxLength={4}
        spellCheck={false}
        readOnly={!interactive}
        value={screenDraft.value}
        onChange={(event) => screenDraft.onChange(event.target.value.trim().toUpperCase())}
        onBlur={screenDraft.onBlur}
        className="h-7 w-16 shrink-0 px-2 text-center text-xs uppercase"
      />
      <Input
        aria-label="Note"
        placeholder="note"
        spellCheck={false}
        readOnly={!interactive}
        value={noteDraft.value}
        onChange={(event) => noteDraft.onChange(event.target.value)}
        onBlur={noteDraft.onBlur}
        className="h-7 min-w-0 flex-[2_1_8rem] px-2 text-xs"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!interactive}
        title="Remove this hint"
        aria-label="Remove this hint"
        onClick={() => dispatch({ type: 'removeHint', id: hint.id })}
      >
        <XIcon />
      </Button>
    </div>
  );
}

export function HintList(props: HintListProps) {
  const { state, interactive, dispatch } = props;
  return (
    <div className="z1r-ui flex flex-col gap-1 text-sm text-foreground">
      {interactive ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'addHint' })}>
            <PlusIcon data-icon="inline-start" />
            Add hint
          </Button>
        </div>
      ) : null}
      {state.hints.length === 0 ? (
        <p className="py-1 text-muted-foreground">
          {interactive
            ? 'No hints yet. Add one as you hear it, then pick a region to light up the map.'
            : 'No hints yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {state.hints.map((hint) => (
            <HintRow key={hint.id} hint={hint} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}
