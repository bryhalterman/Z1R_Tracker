/** Where the plain-DOM toolbar root hands its contents to React. */

import { panelHost } from '../shared/panel-root.js';
import { Toolbar, type ToolbarProps } from './Toolbar.js';
import '../shadcn.css';

const toolbarHost = panelHost(Toolbar);

export function mountToolbar(container: HTMLElement, props: ToolbarProps): () => void {
  const host = toolbarHost(container);
  host.render(props);
  return host.unmount;
}
