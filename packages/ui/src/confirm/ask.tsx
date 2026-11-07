/**
 * `askToConfirm`: the alert dialog for plain-DOM code, as a promise.
 *
 * One React root, made on first use and kept, renders the dialog; the promise
 * settles true on the destructive button and false on Cancel, Esc or a click
 * outside. A second question while one is open replaces it, and the first
 * settles false — nothing was confirmed.
 */

import { createRoot, type Root } from 'react-dom/client';
import { ConfirmLoss, type ConfirmLossText } from './ConfirmLoss.js';
import { PanelBoundary } from '../shared/panel-root.js';
import '../shadcn.css';

let root: Root | null = null;
let settlePending: ((ok: boolean) => void) | null = null;

export function askToConfirm(text: ConfirmLossText): Promise<boolean> {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  const shown = root;
  settlePending?.(false);
  return new Promise((resolve) => {
    const settle = (ok: boolean) => {
      if (settlePending !== settle) return;
      settlePending = null;
      // Rendered closed rather than unmounted, so the dialog plays its exit.
      shown.render(
        <PanelBoundary>
          <ConfirmLoss open={false} {...text} onConfirm={() => {}} onCancel={() => {}} />
        </PanelBoundary>,
      );
      resolve(ok);
    };
    settlePending = settle;
    // Behind the panels' error boundary, so a render error shows a notice
    // instead of taking the root down.
    shown.render(
      <PanelBoundary>
        <ConfirmLoss open {...text} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      </PanelBoundary>,
    );
  });
}
