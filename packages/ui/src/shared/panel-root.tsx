/**
 * The React root every panel renders into.
 *
 * Two jobs, so every mount helper gets them by calling one function:
 *
 * - An error boundary. A render error otherwise removes the root's whole
 *   tree — all 128 map cells for one bad screen — and `runPatches` cannot
 *   catch it, because `root.render` only schedules the work. The boundary
 *   replaces just that panel with a notice, and the store, which has already
 *   saved the edit, is untouched.
 * - Teardown. Each root registers its own unmount with the mount being built
 *   (see `disposers.ts`), so the tracker's teardown unmounts every root
 *   without each builder having to hand one back.
 */

import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { onDispose } from './disposers.js';

interface BoundaryState {
  failed: boolean;
}

class PanelBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Tracker panel failed to render', error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <p role="alert" className="z1r-ui p-2 text-xs text-muted-foreground">
        This panel stopped drawing after an error. Your tracking is saved; reload the page to bring the panel
        back.
      </p>
    );
  }
}

export interface PanelRoot {
  render(node: ReactNode): void;
  unmount(): void;
}

export function createPanelRoot(container: HTMLElement): PanelRoot {
  const root = createRoot(container);
  let unmounted = false;
  const unmount = () => {
    if (unmounted) return;
    unmounted = true;
    root.unmount();
  };
  onDispose(unmount);
  return {
    render(node) {
      // A pass that arrives after teardown has nothing to draw into.
      if (!unmounted) root.render(<PanelBoundary>{node}</PanelBoundary>);
    },
    unmount,
  };
}
