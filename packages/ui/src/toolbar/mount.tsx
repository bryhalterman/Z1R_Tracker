/** Where the plain-DOM toolbar root hands its contents to React. */

import { createRoot } from 'react-dom/client';
import { Toolbar, type ToolbarProps } from './Toolbar.js';
import '../shadcn.css';

export function mountToolbar(container: HTMLElement, props: ToolbarProps): () => void {
  const root = createRoot(container);
  root.render(<Toolbar {...props} />);
  return () => root.unmount();
}
