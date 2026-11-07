/** Where the plain-DOM toolbar root hands its contents to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import { Toolbar, type ToolbarProps } from './Toolbar.js';
import '../shadcn.css';

export function mountToolbar(container: HTMLElement, props: ToolbarProps): () => void {
  const root = createPanelRoot(container);
  root.render(<Toolbar {...props} />);
  return () => root.unmount();
}
