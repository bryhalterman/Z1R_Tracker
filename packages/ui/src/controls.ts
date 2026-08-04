/**
 * Toolbar: game selector, reset, and save file import/export.
 *
 * Kept out of `tracker.ts` because the OBS browser source renders the tracker
 * without any of it — viewers should never see a Reset button.
 */

import { exportState, importState, type Game, type Store } from '@z1r/core';

export interface ControlsOptions {
  readonly store: Store;
  /** Shown next to the toolbar; used for the OBS browser-source URL hint. */
  readonly footnote?: string;
}

export function mountControls(root: HTMLElement, options: ControlsOptions): () => void {
  const { store, footnote } = options;
  root.classList.add('z1r-controls');
  root.replaceChildren();

  const games: { value: Game; label: string }[] = [
    { value: 'z1r', label: 'Randomizer' },
    { value: 'z1', label: 'Vanilla' },
  ];

  const group = document.createElement('div');
  group.className = 'z1r-segmented';
  const buttons = games.map(({ value, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.game = value;
    button.addEventListener('click', () => store.dispatch({ type: 'setGame', game: value }));
    group.append(button);
    return button;
  });

  const action = (label: string, onClick: () => void, className = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `z1r-action ${className}`.trim();
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  };

  const status = document.createElement('span');
  status.className = 'z1r-controls-status';
  const say = (message: string) => {
    status.textContent = message;
    // Clear after a beat so a stale error doesn't sit on screen all run.
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 4000);
  };

  const exportButton = action('Export', () => {
    const blob = new Blob([exportState(store.getState())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `z1r-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'application/json,.json';
  filePicker.hidden = true;
  filePicker.addEventListener('change', async () => {
    const file = filePicker.files?.[0];
    if (!file) return;
    try {
      store.dispatch({ type: 'import', state: importState(await file.text()) });
      say('Save loaded.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not read that file.');
    } finally {
      filePicker.value = '';
    }
  });

  const importButton = action('Import', () => filePicker.click());

  const resetButton = action(
    'Reset',
    () => {
      // A misclick here wipes a whole run, so make it deliberate.
      if (!window.confirm('Reset the tracker? This clears the current run.')) return;
      store.dispatch({ type: 'reset' });
      say('Tracker reset.');
    },
    'z1r-action-danger',
  );

  root.append(group, exportButton, importButton, resetButton, filePicker, status);

  if (footnote) {
    const note = document.createElement('span');
    note.className = 'z1r-controls-note';
    note.textContent = footnote;
    root.append(note);
  }

  const apply = () => {
    const current = store.getState().game;
    for (const button of buttons) {
      button.dataset.active = String(button.dataset.game === current);
    }
  };
  apply();
  const unsubscribe = store.subscribe(apply);

  return () => {
    unsubscribe();
    root.replaceChildren();
  };
}
