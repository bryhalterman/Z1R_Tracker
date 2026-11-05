/** Where the dungeon sheet hands its room cells to React. */

import { createRoot } from 'react-dom/client';
import { RoomGrid, type RoomGridProps } from './RoomGrid.js';
import '../shadcn.css';

export function mountRoomGrid(container: HTMLElement) {
  const root = createRoot(container);
  return { render: (props: RoomGridProps) => root.render(<RoomGrid {...props} />) };
}
