/**
 * The map controls' words, worked out without React: the brushes' status line
 * and what the screen card is describing.
 */

import { MARKS_BY_KIND, SECRET_SIZES, type MarkKind, type ScreenNote, type TrackerState } from '@z1r/core';
import type { Armed, MapView } from './MapTools.js';

export interface Status {
  readonly text: string;
  /** The armed brush needs a choice before a click can place anything. */
  readonly waiting: boolean;
}

const placing = (text: string): Status => ({ text: `Placing ${text}`, waiting: false });

/**
 * The brushes that carry a choice of their own. One that returns nothing
 * reads like any other brush, by its mark's name.
 */
const ARMED_STATUS: Partial<Record<MarkKind, (view: MapView) => Status | undefined>> = {
  dungeon: (view) =>
    view.armedLevel ? placing(`Level ${view.armedLevel}`) : { text: 'Pick a level', waiting: true },
  stairway: (view) =>
    view.armedStairway ? placing(`Warp ${view.armedStairway}`) : { text: 'Pick a warp', waiting: true },
  rupeeSecret: (view) => {
    if (!view.armedSecret) return undefined;
    const size = SECRET_SIZES.find((entry) => entry.id === view.armedSecret)?.name ?? '';
    return placing(`${size} rupee secret`);
  },
};

/** What the next click on the map does, in the order the controls read. */
export function statusLine({ state, view }: { state: TrackerState; view: MapView }): Status {
  const { selected, armed } = view;
  if (armed === 'start') return placing('the start');
  if (armed) return ARMED_STATUS[armed]?.(view) ?? placing(MARKS_BY_KIND.get(armed)?.name ?? armed);
  if (selected) {
    const mark = state.marks[selected];
    return {
      text: `${selected} selected${mark ? ` · ${MARKS_BY_KIND.get(mark)?.name ?? mark}` : ''}`,
      waiting: false,
    };
  }
  return { text: 'Pick a screen, or a marker to place', waiting: false };
}

/** Which mark the screen card's rows are for; '' for none. */
export type Showing = Armed;

export interface CardSubject {
  /** The selected screen's mark; 'none' with nothing selected. */
  readonly mark: MarkKind;
  readonly note: ScreenNote | undefined;
  /**
   * The rows shown are for whichever the card is describing: the marker being
   * armed, or the screen being edited.
   */
  readonly showing: Showing;
}

export function cardSubject(state: TrackerState, view: MapView): CardSubject {
  const { selected, armed } = view;
  const mark = selected ? (state.marks[selected] ?? 'none') : 'none';
  const note = selected ? state.screenNotes[selected] : undefined;
  return { mark, note, showing: armed || (selected ? mark : '') };
}

/**
 * The name of the mark being shown: '' for the start, Unmarked or nothing,
 * and undefined for a mark kind with no definition.
 */
export function showingName(showing: Showing): string | undefined {
  return showing && showing !== 'start' && showing !== 'none' ? MARKS_BY_KIND.get(showing)?.name : '';
}

/**
 * The card names the screen it edits. Arming does not take the editor away:
 * a stamped screen is also selected, so its rows are right here to refine
 * — stamp, refine, stamp the next.
 */
export function cardTitle(view: MapView, mark: MarkKind): { title: string; subtitle: string } {
  const { selected, armed } = view;
  return {
    title: selected || (armed ? 'Pick a screen' : 'No screen selected'),
    subtitle: selected ? (MARKS_BY_KIND.get(mark)?.name ?? 'Unmarked') : '',
  };
}
