/**
 * Seed and settings form.
 *
 * Only settings that reshape the tracker get a control here; everything else
 * about a seed lives in the flag string, which is stored verbatim. See the
 * note at the top of `packages/core/src/seed.ts`.
 */

import {
  DUNGEON_QUESTS,
  ITEM_SHUFFLES,
  questIsAmbiguous,
  questsMustDiffer,
  type ConcreteQuest,
  type SeedSettings,
  type Store,
  type TrackerState,
} from '@z1r/core';

type Patch = (state: TrackerState) => void;

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'z1r-field';
  const text = document.createElement('span');
  text.className = 'z1r-field-label';
  text.textContent = label;
  wrap.append(text, control);
  if (hint) {
    const note = document.createElement('span');
    note.className = 'z1r-field-hint';
    note.textContent = hint;
    wrap.append(note);
  }
  return wrap;
}

export function buildSeedPanel(store: Store, patches: Patch[], interactive: boolean): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-seed';
  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Seed';
  root.append(title);

  const body = document.createElement('div');
  body.className = 'z1r-seed-body';
  root.append(body);

  const set = (patch: Partial<SeedSettings>) => store.dispatch({ type: 'setSeed', patch });

  /** Text inputs are never overwritten mid-edit, or typing fights the patch loop. */
  const text = (key: 'seed' | 'flags' | 'notes', placeholder: string) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'z1r-input';
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.readOnly = !interactive;
    input.addEventListener('input', () => set({ [key]: input.value }));
    patches.push((state) => {
      if (document.activeElement !== input) input.value = state.seed[key];
    });
    return input;
  };

  const select = <T extends string>(
    options: readonly { value: T; label: string }[],
    key: 'dungeonQuest' | 'itemShuffle',
  ) => {
    const el = document.createElement('select');
    el.className = 'z1r-input';
    el.disabled = !interactive;
    for (const option of options) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      el.append(node);
    }
    el.addEventListener('change', () => set({ [key]: el.value }));
    patches.push((state) => {
      el.value = state.seed[key];
    });
    return el;
  };

  const check = (
    key: 'shuffleDungeonDrops' | 'shuffleMinorDrops' | 'importantItemsIn9',
    label: string,
    hint: string,
  ) => {
    const wrap = document.createElement('label');
    wrap.className = 'z1r-check';
    wrap.title = hint;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.disabled = !interactive;
    box.addEventListener('change', () => set({ [key]: box.checked }));
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(box, span);
    patches.push((state) => {
      box.checked = state.seed[key];
    });
    return wrap;
  };

  body.append(
    field('Seed', text('seed', 'e.g. 1234567890')),
    field('Flags', text('flags', 'paste the flag string')),
    field('Dungeon Quest', select(DUNGEON_QUESTS, 'dungeonQuest'), 'Sets each level’s item slots'),
    field('Item Shuffle', select(ITEM_SHUFFLES, 'itemShuffle')),
  );

  // Mixed and the Random options don't reveal the quest split until you're in
  // the seed, so the player records it as they find out.
  const split = document.createElement('div');
  split.className = 'z1r-quest-split';
  const splitLabel = document.createElement('span');
  splitLabel.className = 'z1r-field-label';
  splitLabel.textContent = 'Quest split';
  split.append(splitLabel);

  const questToggle = (which: 'questLow' | 'questHigh', label: string) => {
    const group = document.createElement('div');
    group.className = 'z1r-segmented z1r-segmented-sm';
    const caption = document.createElement('span');
    caption.className = 'z1r-split-caption';
    caption.textContent = label;
    const buttons: HTMLButtonElement[] = [];
    for (const quest of ['1st', '2nd'] as ConcreteQuest[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = quest === '1st' ? '1Q' : '2Q';
      button.dataset.quest = quest;
      button.disabled = !interactive;
      button.addEventListener('click', () => set({ [which]: quest }));
      group.append(button);
      buttons.push(button);
    }
    patches.push((state) => {
      for (const button of buttons) {
        button.dataset.active = String(button.dataset.quest === state.seed[which]);
      }
    });
    const wrap = document.createElement('div');
    wrap.className = 'z1r-split-item';
    wrap.append(caption, group);
    return wrap;
  };

  split.append(questToggle('questLow', 'L1-6'), questToggle('questHigh', 'L7-9'));
  body.append(split);

  const checks = document.createElement('div');
  checks.className = 'z1r-checks';
  checks.append(
    check(
      'shuffleDungeonDrops',
      'Shuffle dungeon drops',
      'Triforce, hearts, keys, compass and map join the shuffle.',
    ),
    check(
      'shuffleMinorDrops',
      'Shuffle minor drops',
      'Bomb/rupee/key drops join the shuffle — lets a dungeon hold extra floor items.',
    ),
    check(
      'importantItemsIn9',
      'Important items in 9',
      'Ladder, raft, bracelet, recorder and bow may appear in Level 9.',
    ),
  );
  body.append(checks);
  body.append(field('Notes', text('notes', 'hints, routing, anything')));

  patches.push((state) => {
    const quest = state.seed.dungeonQuest;
    // Fixed quests imply the split, so hide a control that can't do anything.
    split.hidden = !questIsAmbiguous(quest);
    split.dataset.locked = String(questsMustDiffer(quest));
    splitLabel.textContent = questsMustDiffer(quest)
      ? 'Quest split (1-6 and 7-9 always differ)'
      : 'Quest split';
  });

  return root;
}
