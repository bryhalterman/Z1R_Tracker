/** Where the dungeon sheet hands its room cells to React. */

import { createPanelRoot } from '../shared/panel-root.js';
import { RoomGrid, type RoomGridProps } from './RoomGrid.js';
import '../shadcn.css';

export function mountRoomGrid(container: HTMLElement) {
  const root = createPanelRoot(container);
  return { render: (props: RoomGridProps) => root.render(<RoomGrid {...props} />) };
}
