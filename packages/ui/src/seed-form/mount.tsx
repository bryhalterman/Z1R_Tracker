/** Where the plain-DOM seed panel hands its body to React. The toolbar's sheet mounts with the toolbar. */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { SeedForm, type SeedFormProps } from './SeedForm.js';
import '../shadcn.css';

export type SeedFormHost = PanelHost<SeedFormProps>;

export const mountSeedForm = panelHost(SeedForm);
