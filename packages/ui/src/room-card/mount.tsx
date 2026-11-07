/**
 * Where the plain-DOM panel hands off to React: one root per card, rendered
 * again whenever the panel redraws.
 */

import { panelHost, type PanelHost } from '../shared/panel-root.js';
import { RoomCard, type RoomCardProps } from './RoomCard.js';
import '../shadcn.css';

export type RoomCardHost = PanelHost<RoomCardProps>;

export const mountRoomCard = panelHost(RoomCard);
