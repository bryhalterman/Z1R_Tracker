/** Where the plain-DOM Items panel hands its palette to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import { ItemPalette, type ItemPaletteProps } from './ItemPalette.js';
import '../shadcn.css';

export { targetFor } from './ItemPalette.js';

export interface ItemPaletteHost {
  render(props: ItemPaletteProps): void;
}

export function mountItemPalette(container: HTMLElement): ItemPaletteHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<ItemPalette {...props} />);
    },
  };
}
