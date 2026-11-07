/** Where the plain-DOM hint panel hands its rows to React. The toolbar's sheet mounts with the toolbar. */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { HintList, type HintListProps } from './HintList.js';
import '../shadcn.css';

export type HintListHost = PanelHost<HintListProps>;

export const mountHintList = panelHost(HintList);
