/** Where the dungeon sheet hands its room cells to React. */

import { panelHost } from '../shared/panel-root.js';
import { RoomGrid } from './RoomGrid.js';
import '../shadcn.css';

export const mountRoomGrid = panelHost(RoomGrid);
