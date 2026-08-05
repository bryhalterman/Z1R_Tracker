/**
 * The Triforce panel.
 *
 * Replaces nine stacked dungeon rows with the shape the game itself uses: one
 * triangle subdivided into eight numbered sub-triangles, one per level. The
 * rows cost 318px of height to carry eight booleans and never showed the
 * spatial relationship between them; this costs about 130px and does.
 *
 * Geometry is taken from the randomizer wiki's Triforce map. Two things about
 * it are worth knowing:
 *
 *  - The triangle is right-isoceles (height = half the base), not equilateral,
 *    so the viewBox is 100x50. An equilateral 100x88 would distort it.
 *  - **Which level sits in which sub-triangle depends on the quest.** The wiki
 *    publishes four diagrams, one per quest combination. Levels 1-6 always
 *    occupy the same six positions and 7-8 the same two, so a Mixed split is
 *    always well defined — but 2nd Quest permutes the numbering within each
 *    group. Getting this from `questForLevel` is what makes the Quest split
 *    control visibly do something.
 */

import {
  canEnterLevel9,
  questForLevel,
  questIsAmbiguous,
  triforceCount,
  TRIFORCE_REQUIRED_FOR_L9,
  type ConcreteQuest,
  type Store,
  type TrackerState,
} from '@z1r/core';
import { memoise, runPatches, type Patch } from './patch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Sub-triangle positions. Vertices are all multiples of 25 on a 100x50 grid. */
const SHAPES = {
  UL: { points: '50,0 25,25 50,25', label: [41.67, 16.67] },
  UR: { points: '50,0 75,25 50,25', label: [58.33, 16.67] },
  ML: { points: '25,25 50,25 50,50', label: [41.67, 33.33] },
  MR: { points: '75,25 50,25 50,50', label: [58.33, 33.33] },
  LLi: { points: '25,25 50,50 25,50', label: [33.33, 41.67] },
  LRi: { points: '75,25 50,50 75,50', label: [66.67, 41.67] },
  LLo: { points: '0,50 25,25 25,50', label: [16.67, 41.67] },
  LRo: { points: '100,50 75,25 75,50', label: [83.33, 41.67] },
} as const;

type PositionKey = keyof typeof SHAPES;

/** Level -> position, per quest. From the wiki's four Triforce map diagrams. */
const POSITIONS: Record<ConcreteQuest, Record<number, PositionKey>> = {
  '1st': { 1: 'UL', 2: 'UR', 3: 'LLo', 4: 'LRo', 5: 'ML', 6: 'LLi', 7: 'MR', 8: 'LRi' },
  '2nd': { 1: 'UL', 2: 'LLo', 3: 'UR', 4: 'ML', 5: 'LRo', 6: 'LLi', 7: 'LRi', 8: 'MR' },
};

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/**
 * Diagonal hatching for unheld pieces.
 *
 * The fill difference is the *second* channel, not the only one — held pieces
 * are also heavier-stroked with a bolder numeral. See the accessibility rule
 * in ARCHITECTURE.md.
 */
function hatchPattern(): SVGDefsElement {
  const defs = svg('defs');
  const pattern = svg('pattern', {
    id: 'z1r-triforce-hatch',
    width: '4',
    height: '4',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  pattern.append(svg('line', { x1: '0', y1: '0', x2: '0', y2: '4', 'stroke-width': '1.4' }));
  defs.append(pattern);
  return defs;
}

export function buildTriforce(store: Store, patches: Patch[], interactive: boolean): HTMLElement {
  const root = document.createElement('section');
  root.className = 'z1r-panel z1r-triforce-panel';

  const title = document.createElement('h2');
  title.className = 'z1r-panel-title';
  title.textContent = 'Triforce';
  root.append(title);

  const count = document.createElement('span');
  count.className = 'z1r-locations-summary';
  title.append(count);

  const figure = svg('svg', {
    // The 2-unit pad keeps a centred stroke from clipping on the hypotenuses.
    viewBox: '-2 -2 104 54',
    class: 'z1r-triforce',
    role: 'group',
    'aria-label': 'Triforce pieces by level',
  });
  figure.append(hatchPattern());
  root.append(figure);

  const toggle = (level: number) =>
    store.dispatch({
      type: 'setDungeon',
      level,
      patch: { triforce: !(store.getState().dungeons[String(level)]?.triforce ?? false) },
    });

  for (const level of LEVELS) {
    const group = svg('g', {
      class: 'z1r-tri-piece',
      'data-level': String(level),
      role: interactive ? 'button' : 'img',
    });
    if (interactive) {
      group.setAttribute('tabindex', '0');
      group.addEventListener('click', () => toggle(level));
      group.addEventListener('keydown', (event) => {
        // SVG elements are not natively activatable, so Enter/Space are wired
        // by hand or the piece is keyboard-dead.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle(level);
        }
      });
    }

    const polygon = svg('polygon');
    const numeral = svg('text', {
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    numeral.textContent = String(level);
    group.append(polygon, numeral);
    figure.append(group);

    let renderedPosition: PositionKey | null = null;

    patches.push((state) => {
      const quest = questForLevel(state.seed, level);
      const position = POSITIONS[quest]?.[level] ?? 'UL';
      renderedPosition = memoise(renderedPosition, position, () => {
        const shape = SHAPES[position];
        polygon.setAttribute('points', shape.points);
        numeral.setAttribute('x', String(shape.label[0]));
        numeral.setAttribute('y', String(shape.label[1]));
      });

      const held = state.dungeons[String(level)]?.triforce ?? false;
      group.dataset.on = String(held);
      if (interactive) group.setAttribute('aria-pressed', String(held));
      group.setAttribute(
        'aria-label',
        `Level ${level} Triforce piece — ${held ? 'collected' : 'not collected'}`,
      );
    });
  }

  // Levels 1-8 hold the pieces; Level 9 holds Ganon. Its state is a sentence
  // rather than a ninth wedge, which would break the tiling.
  const status = document.createElement('p');
  status.className = 'z1r-triforce-status';
  root.append(status);

  patches.push((state) => {
    const pieces = triforceCount(state);
    count.textContent = `${pieces}/${TRIFORCE_REQUIRED_FOR_L9}`;
    const open = canEnterLevel9(state);
    status.textContent = open
      ? 'Level 9 is open'
      : `Level 9 sealed — ${TRIFORCE_REQUIRED_FOR_L9 - pieces} to go`;
    status.dataset.ready = String(open);

    // Under Mixed or Random the split isn't known until the player records it,
    // so the numbering on screen may not be the seed's. Say so rather than
    // quietly showing 1st Quest numbering as if it were fact.
    const unsure = questIsAmbiguous(state.seed.dungeonQuest);
    figure.dataset.unsure = String(unsure);
    figure.setAttribute(
      'aria-description',
      unsure
        ? 'Level numbering assumes the recorded quest split, which may not be confirmed yet.'
        : '',
    );
  });

  return root;
}
