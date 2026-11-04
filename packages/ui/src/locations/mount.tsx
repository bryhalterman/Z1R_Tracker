/** Where the plain-DOM locations panel hands its columns to React. */

import { createRoot } from 'react-dom/client';
import { CompactLocations, type CompactLocationsProps } from './CompactLocations.js';
import '../shadcn.css';

export interface CompactLocationsHost {
  render(props: CompactLocationsProps): void;
}

export function mountCompactLocations(container: HTMLElement): CompactLocationsHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<CompactLocations {...props} />);
    },
  };
}
