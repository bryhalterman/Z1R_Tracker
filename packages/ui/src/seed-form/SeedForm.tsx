/**
 * The seed form, in React with shadcn/ui.
 *
 * Only settings that reshape the tracker get a control here; everything else
 * about a seed lives in the flag string, which is stored verbatim. See the
 * note at the top of `packages/core/src/seed.ts`.
 *
 * It renders `seed` as given and reports every change through `set`. The text
 * fields hold what is mid-typing (`useDraft`) and report it once typing
 * pauses, so a seed or flag string is not sent a character at a time. Read-only in the OBS overlay, where
 * `interactive` is false — the fields still show their values there.
 */

import { useId } from 'react';
import { useDraft } from '../shared/use-draft.js';
import { Segmented, type SegmentedOption } from '../shared/CardControls.js';
import {
  DUNGEON_QUESTS,
  ITEM_SHUFFLES,
  OVERWORLD_QUESTS,
  questIsAmbiguous,
  questsMustDiffer,
  type ConcreteQuest,
  type SeedSettings,
} from '@z1r/core';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';

export interface SeedFormProps {
  seed: SeedSettings;
  interactive: boolean;
  set: (patch: Partial<SeedSettings>) => void;
}

type TextKey = 'seed' | 'flags' | 'notes';
type SelectKey = 'dungeonQuest' | 'overworldQuest' | 'itemShuffle';
type CheckKey = 'shuffleDungeonDrops' | 'shuffleMinorDrops' | 'importantItemsIn9' | 'mirroredOverworld';

const LABEL = 'text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase';

const CHECKS: readonly { key: CheckKey; label: string; hint: string }[] = [
  {
    key: 'shuffleDungeonDrops',
    label: 'Shuffle dungeon drops',
    hint: 'Triforce, hearts, keys, compass and map join the shuffle.',
  },
  {
    key: 'shuffleMinorDrops',
    label: 'Shuffle minor drops',
    hint: 'Bomb/rupee/key drops join the shuffle — lets a dungeon hold extra floor items.',
  },
  {
    key: 'importantItemsIn9',
    label: 'Important items in 9',
    hint: 'Ladder, raft, bracelet, recorder and bow may appear in Level 9.',
  },
  {
    key: 'mirroredOverworld',
    label: 'Mirrored overworld',
    hint: 'Flips the map left to right — the hint regions on the grid flip with it.',
  },
];

function TextField({
  label,
  name,
  placeholder,
  props,
}: {
  label: string;
  name: TextKey;
  placeholder: string;
  props: SeedFormProps;
}) {
  const id = useId();
  const draft = useDraft(props.seed[name], (value) => props.set({ [name]: value }));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className={LABEL}>
        {label}
      </Label>
      <Input
        id={id}
        value={draft.value}
        placeholder={placeholder}
        spellCheck={false}
        readOnly={!props.interactive}
        onChange={(event) => draft.onChange(event.target.value)}
        onBlur={draft.onBlur}
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  name,
  options,
  hint,
  props,
}: {
  label: string;
  name: SelectKey;
  options: readonly { value: T; label: string }[];
  hint?: string;
  props: SeedFormProps;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className={LABEL}>
        {label}
      </Label>
      <Select
        items={options}
        value={props.seed[name]}
        disabled={!props.interactive}
        onValueChange={(value) => value && props.set({ [name]: value })}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z1r-ui">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

const QUEST_OPTIONS: readonly SegmentedOption<ConcreteQuest>[] = [
  { value: '1st', text: '1Q' },
  { value: '2nd', text: '2Q' },
];

/** L1-6 or L7-9: which quest that half of the game turned out to be. */
function QuestHalf({
  caption,
  name,
  props,
}: {
  caption: string;
  name: 'questLow' | 'questHigh';
  props: SeedFormProps;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${LABEL} w-10`}>{caption}</span>
      <Segmented<ConcreteQuest>
        label={`Quest for ${caption}`}
        value={props.seed[name]}
        options={QUEST_OPTIONS}
        disabled={!props.interactive}
        onChange={(quest) => {
          // Pressing the answer already chosen empties the group; a quest is
          // always one of the two, so that click changes nothing.
          if (quest) props.set({ [name]: quest });
        }}
      />
    </div>
  );
}

export function SeedForm(props: SeedFormProps) {
  const quest = props.seed.dungeonQuest;
  return (
    <div className="z1r-ui grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] items-start gap-x-3 gap-y-2 text-sm text-foreground">
      <TextField label="Seed" name="seed" placeholder="e.g. 1234567890" props={props} />
      <TextField label="Flags" name="flags" placeholder="paste the flag string" props={props} />
      <SelectField
        label="Dungeon Quest"
        name="dungeonQuest"
        options={DUNGEON_QUESTS}
        hint="Sets each level’s item slots"
        props={props}
      />
      <SelectField
        label="Overworld Quest"
        name="overworldQuest"
        options={OVERWORLD_QUESTS}
        hint="Sets the overworld map"
        props={props}
      />
      <SelectField label="Item Shuffle" name="itemShuffle" options={ITEM_SHUFFLES} props={props} />

      {/*
       * Mixed and the Random options don't reveal the quest split until you're
       * in the seed, so the player records it as they find out. Fixed quests
       * imply it, so the control is left out for them.
       */}
      {questIsAmbiguous(quest) ? (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>
            {questsMustDiffer(quest) ? 'Quest split (1-6 and 7-9 always differ)' : 'Quest split'}
          </span>
          <QuestHalf caption="L1-6" name="questLow" props={props} />
          <QuestHalf caption="L7-9" name="questHigh" props={props} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {CHECKS.map(({ key, label, hint }) => (
          <Label key={key} title={hint} className="cursor-pointer font-normal">
            <Checkbox
              checked={props.seed[key]}
              disabled={!props.interactive}
              onCheckedChange={(checked) => props.set({ [key]: checked })}
            />
            {label}
          </Label>
        ))}
      </div>

      <TextField label="Notes" name="notes" placeholder="hints, routing, anything" props={props} />
    </div>
  );
}
