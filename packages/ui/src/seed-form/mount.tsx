/** Where the plain-DOM seed panel hands its body to React. The toolbar's sheet mounts with the toolbar. */

import { createPanelRoot } from '../shared/panel-root.js';
import { SeedForm, type SeedFormProps } from './SeedForm.js';
import '../shadcn.css';

export interface SeedFormHost {
  render(props: SeedFormProps): void;
}

export function mountSeedForm(container: HTMLElement): SeedFormHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<SeedForm {...props} />);
    },
  };
}
