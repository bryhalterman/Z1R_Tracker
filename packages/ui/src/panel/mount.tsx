/** Where the plain-DOM panel headings hand their shared controls to React. */

import { createRoot } from 'react-dom/client';
import { ClearButton, PanelToggle, type ClearButtonProps, type PanelToggleProps } from './PanelHeading.js';
import { LevelStrip, type LevelStripProps } from './LevelStrip.js';
import '../shadcn.css';

export function mountPanelToggle(container: HTMLElement) {
  const root = createRoot(container);
  return { render: (props: PanelToggleProps) => root.render(<PanelToggle {...props} />) };
}

export function mountLevelStrip(container: HTMLElement) {
  const root = createRoot(container);
  return { render: (props: LevelStripProps) => root.render(<LevelStrip {...props} />) };
}

export function mountClearButton(container: HTMLElement) {
  const root = createRoot(container);
  return { render: (props: ClearButtonProps) => root.render(<ClearButton {...props} />) };
}
