/**
 * The map controls' words, worked out without React: the brushes' status line
 * and what the screen card is describing.
 */

import { MARKS_BY_KIND, type MarkKind, type ScreenNote, type TrackerState } from '@z1r/core';
import type { Armed, MapView } from './MapTools.js';

export interface Status {
  readonly text: string;
}

const placing = (text: string): Status => ({ text: `Placing ${text}` });

/** What the next click on the map does, in the order the controls read. */
export function statusLine({ state, view }: { state: TrackerState; view: MapView }): Status {
  const { selected, armed } = view;
  if (armed === 'start') return placing('the start');
  if (armed) return placing(MARKS_BY_KIND.get(armed)?.name ?? armed);
  if (selected) {
    const mark = state.marks[selected];
    return { text: `${selected} selected${mark ? ` · ${MARKS_BY_KIND.get(mark)?.name ?? mark}` : ''}` };
  }
  return { text: 'Pick a screen, or a marker to place' };
}

/** Which mark the screen card's rows are for; '' for none. */
export type Showing = Armed;

export interface CardSubject {
  /** The selected screen's mark; 'none' with nothing selected. */
  readonly mark: MarkKind;
  readonly note: ScreenNote | undefined;
  /**
   * The selected screen's mark, whose rows the card shows. Every row edits the
   * selected screen, so with nothing selected there are none: an armed marker
   * stamps its mark, and its rows follow on the screen it stamped.
   */
  readonly showing: Showing;
}

export function cardSubject(state: TrackerState, view: MapView): CardSubject {
  const { selected } = view;
  const mark = selected ? (state.marks[selected] ?? 'none') : 'none';
  const note = selected ? state.screenNotes[selected] : undefined;
  return { mark, note, showing: selected ? mark : '' };
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
