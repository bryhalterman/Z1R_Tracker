/** Where the plain-DOM overworld panel hands its controls to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import {
  MapBrushes,
  MapHeading,
  ScreenCard,
  type MapBrushesProps,
  type MapHeadingProps,
  type ScreenCardProps,
} from './MapTools.js';
import { ScreenGrid, type ScreenGridProps } from './ScreenGrid.js';
import '../shadcn.css';

export type { Armed, MapActions, MapView } from './MapTools.js';

function host<P extends object>(Component: (props: P) => React.ReactNode) {
  return (container: HTMLElement) => {
    const root = createPanelRoot(container);
    return { render: (props: P) => root.render(<Component {...props} />) };
  };
}

export const mountMapBrushes = host<MapBrushesProps>(MapBrushes);
export const mountScreenCard = host<ScreenCardProps>(ScreenCard);
export const mountMapHeading = host<MapHeadingProps>(MapHeading);

export const mountScreenGrid = host<ScreenGridProps>(ScreenGrid);
