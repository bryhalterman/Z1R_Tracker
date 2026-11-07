/** Where the plain-DOM Items panel hands the OBS dock's grid to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import { DockItems, type DockItemsProps } from './DockItems.js';

export interface DockItemsHost {
  render(props: DockItemsProps): void;
}

export function mountDockItems(container: HTMLElement): DockItemsHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<DockItems {...props} />);
    },
  };
}
