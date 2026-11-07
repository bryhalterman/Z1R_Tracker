/** Where the plain-DOM hint panel hands its rows to React. The toolbar's sheet mounts with the toolbar. */

import { createPanelRoot } from '../shared/panel-root.js';
import { HintList, type HintListProps } from './HintList.js';
import '../shadcn.css';

export interface HintListHost {
  render(props: HintListProps): void;
}

export function mountHintList(container: HTMLElement): HintListHost {
  const root = createPanelRoot(container);
  return {
    render(props) {
      root.render(<HintList {...props} />);
    },
  };
}
