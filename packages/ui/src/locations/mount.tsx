/** Where the plain-DOM locations panel hands its columns to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import { CompactLocations, type CompactLocationsProps } from './CompactLocations.js';
import '../shadcn.css';

export interface CompactLocationsHost {
  render(props: CompactLocationsProps): void;
}

export function mountCompactLocations(container: HTMLElement): CompactLocationsHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<CompactLocations {...props} />);
    },
  };
}
