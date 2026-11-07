/** Where the plain-DOM Items panel hands the OBS dock's grid to React. */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { DockItems, type DockItemsProps } from './DockItems.js';

export type DockItemsHost = PanelHost<DockItemsProps>;

export const mountDockItems = panelHost(DockItems);
