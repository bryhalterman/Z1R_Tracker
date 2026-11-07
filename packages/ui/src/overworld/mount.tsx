/** Where the plain-DOM overworld panel hands its controls to React. */

import { panelHost } from '../shared/panel-root.js';
import { MapBrushes, MapHeading, ScreenCard } from './MapTools.js';
import { ScreenGrid } from './ScreenGrid.js';
import '../shadcn.css';

export type { Armed, MapActions, MapView } from './MapTools.js';

export const mountMapBrushes = panelHost(MapBrushes);
export const mountScreenCard = panelHost(ScreenCard);
export const mountMapHeading = panelHost(MapHeading);

export const mountScreenGrid = panelHost(ScreenGrid);
