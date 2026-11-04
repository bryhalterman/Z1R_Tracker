/** Where plain DOM hands the seed settings to React: the panel body, or the toolbar's sheet. */

import type { Store } from '@z1r/core';
import { createRoot } from 'react-dom/client';
import { SeedForm, type SeedFormProps } from './SeedForm.js';
import { SeedSheet } from './SeedSheet.js';
import '../shadcn.css';

/** The toolbar's Seed button, its sheet and the one-line summary beside it. */
export function mountSeedSheet(container: HTMLElement, store: Store): () => void {
  const root = createRoot(container);
  root.render(<SeedSheet store={store} />);
  return () => root.unmount();
}

export interface SeedFormHost {
  render(props: SeedFormProps): void;
}

export function mountSeedForm(container: HTMLElement): SeedFormHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<SeedForm {...props} />);
    },
  };
}
