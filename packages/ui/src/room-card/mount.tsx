/**
 * Where the plain-DOM panel hands off to React: one root per card, rendered
 * again whenever the panel redraws.
 */

import { createPanelRoot } from '../shared/panel-root.js';
import { RoomCard, type RoomCardProps } from './RoomCard.js';
import '../shadcn.css';

export interface RoomCardHost {
  render(props: RoomCardProps): void;
}

export function mountRoomCard(container: HTMLElement): RoomCardHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<RoomCard {...props} />);
    },
  };
}
