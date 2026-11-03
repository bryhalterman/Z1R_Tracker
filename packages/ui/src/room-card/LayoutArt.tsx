import type { RoomLayoutDef } from '@z1r/core';
import { layoutShapes } from '../layout-shapes.js';

/** A layout drawn as SVG, the same shapes the sheet's cells draw. */
export function LayoutArt({ def, className }: { def: RoomLayoutDef; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 7" preserveAspectRatio="none" aria-hidden="true">
      {layoutShapes(def).map(({ tag: Tag, kind, attrs }, index) => (
        <Tag key={index} className={`z1r-layout-${kind}`} {...attrs} />
      ))}
    </svg>
  );
}
