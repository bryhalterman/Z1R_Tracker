/** Where the plain-DOM seed panel hands its body to React. The toolbar's sheet mounts with the toolbar. */

import { createRoot } from 'react-dom/client';
import { SeedForm, type SeedFormProps } from './SeedForm.js';
import '../shadcn.css';

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
