/** Where the plain-DOM Items panel hands its palette to React. */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { ItemPalette, type ItemPaletteProps } from './ItemPalette.js';
import '../shadcn.css';

export { targetFor } from './ItemPalette.js';

export type ItemPaletteHost = PanelHost<ItemPaletteProps>;

export const mountItemPalette = panelHost(ItemPalette);
