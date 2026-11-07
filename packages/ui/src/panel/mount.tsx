/** Where the plain-DOM panel headings hand their shared controls to React. */

import { panelHost } from '../shared/panel-root.js';
import { ClearButton, HelpTip, PanelToggle } from './PanelHeading.js';
import { LevelStrip } from './LevelStrip.js';
import '../shadcn.css';

export const mountPanelToggle = panelHost(PanelToggle);
export const mountLevelStrip = panelHost(LevelStrip);
export const mountClearButton = panelHost(ClearButton);
export const mountHelpTip = panelHost(HelpTip);
