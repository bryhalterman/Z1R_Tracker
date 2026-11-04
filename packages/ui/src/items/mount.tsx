/** Where the plain-DOM Items panel hands the OBS dock's grid to React. */

import { createRoot } from 'react-dom/client';
import { DockItems, type DockItemsProps } from './DockItems.js';

export interface DockItemsHost {
  render(props: DockItemsProps): void;
}

export function mountDockItems(container: HTMLElement): DockItemsHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<DockItems {...props} />);
    },
  };
}
