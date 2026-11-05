/** Where the plain-DOM Items panel hands its palette to React. */

import { createRoot } from 'react-dom/client';
import { ItemPalette, type ItemPaletteProps } from './ItemPalette.js';
import '../shadcn.css';

export { targetFor } from './ItemPalette.js';

export interface ItemPaletteHost {
  render(props: ItemPaletteProps): void;
}

export function mountItemPalette(container: HTMLElement): ItemPaletteHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<ItemPalette {...props} />);
    },
  };
}
