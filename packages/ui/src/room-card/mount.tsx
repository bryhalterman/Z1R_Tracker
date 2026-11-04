/**
 * Where the plain-DOM panel hands off to React: one root per card, rendered
 * again whenever the panel redraws.
 */

import { createRoot } from 'react-dom/client';
import { RoomCard, type RoomCardProps } from './RoomCard.js';
import '../shadcn.css';

export interface RoomCardHost {
  render(props: RoomCardProps): void;
}

export function mountRoomCard(container: HTMLElement): RoomCardHost {
  const root = createRoot(container);
  return {
    render(props) {
      root.render(<RoomCard {...props} />);
    },
  };
}
