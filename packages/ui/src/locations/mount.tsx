/** Where the plain-DOM locations panel hands its columns to React. */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { CompactLocations, type CompactLocationsProps } from './CompactLocations.js';
import '../shadcn.css';

export type CompactLocationsHost = PanelHost<CompactLocationsProps>;

export const mountCompactLocations = panelHost(CompactLocations);
