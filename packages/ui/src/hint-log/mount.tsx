/** Where plain DOM hands the hint log to React: a panel body, or the toolbar's sheet. */

import type { Store } from '@z1r/core';
import { createRoot } from 'react-dom/client';
import { HintList, type HintListProps } from './HintList.js';
import { HintSheet } from './HintSheet.js';
import '../shadcn.css';

export interface HintListHost {
  render(props: HintListProps): void;
}

export function mountHintList(container: HTMLElement): HintListHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<HintList {...props} />);
    },
  };
}

/** The toolbar's Hints button and the sheet it opens. */
export function mountHintSheet(container: HTMLElement, store: Store): () => void {
  const root = createRoot(container);
  root.render(<HintSheet store={store} />);
  return () => root.unmount();
}
