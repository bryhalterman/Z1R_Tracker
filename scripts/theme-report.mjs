#!/usr/bin/env node
/*
 * Contrast report for the tracker's semantic color aliases.
 *
 * `packages/ui/src/theme.css` binds each `--z1r-*` alias to a literal value.
 * This script reads those bindings straight from that file and checks every
 * foreground/background pair the tracker renders against WCAG AA.
 *
 * It exists because the one accessibility bug that shipped came from choosing
 * colors by eye. Run it after touching the theme:
 *
 *   npm run theme:check
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const THEME = fileURLToPath(new URL('../packages/ui/src/theme.css', import.meta.url));

/**
 * Expand every `var()` in a value until a literal falls out. An alias may
 * point at another alias — `--z1r-focus` is the accent.
 */
function resolve(name, vars, depth = 0) {
  let value = vars.get(name);
  if (value === undefined) return null;
  while (value.includes('var(') && depth < 20) {
    const before = value;
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, ref, fallback) => {
      const inner = vars.get(ref);
      return inner !== undefined ? inner : (fallback ?? whole);
    });
    if (value === before) break; // unresolvable reference; stop rather than spin
    depth++;
  }
  return value.trim();
}

function toRgb(value) {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return parts.slice(0, 3);
  }
  return null;
}

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// Comments stripped first, so a value quoted in a comment is never read.
const themeCss = (await readFile(THEME, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const bindings = new Map();
for (const [, name, value] of themeCss.matchAll(/(--z1r-[\w-]+)\s*:\s*([^;]+);/g)) {
  if (name && value) bindings.set(name, value.trim());
}

/** Foreground / background pairs the tracker actually renders. */
const PAIRS = [
  ['--z1r-text', '--z1r-panel', 'body text on a panel'],
  ['--z1r-text', '--z1r-bg', 'body text on the page'],
  ['--z1r-muted', '--z1r-panel', 'labels and secondary text'],
  ['--z1r-muted', '--z1r-bg', 'secondary text on the page'],
  ['--z1r-accent', '--z1r-panel', 'accent text and counts'],
  ['--z1r-good', '--z1r-panel', 'met capability chips'],
  ['--z1r-bad', '--z1r-panel', 'destructive actions'],
  ['--z1r-text', '--z1r-field', 'input and option text'],
  ['--z1r-muted', '--z1r-field', 'placeholder text'],
  ['--z1r-stair', '--z1r-panel', 'room drawing stairway'],
  // Every keyboard focus outline, against the panel it is drawn over.
  ['--z1r-focus', '--z1r-panel', 'focus outline'],
  // Reversed: page-colored text on a filled tag.
  ['--z1r-bg', '--z1r-accent', 'pressed Level and Maps strips, checked boxes, focused region tag'],
  ['--z1r-bg', '--z1r-text', 'warp guide tags'],
  ['--z1r-bg', '--z1r-stair', 'transport pair numbers'],
];

let failures = 0;
console.log('Tracker palette — WCAG AA needs 4.5:1 for body text\n');
for (const [fg, bg, label] of PAIRS) {
  const fgRgb = toRgb(resolve(fg, bindings));
  const bgRgb = toRgb(resolve(bg, bindings));
  if (!fgRgb || !bgRgb) {
    console.log(`  ?      ${label} — could not resolve ${!fgRgb ? fg : bg}`);
    failures++;
    continue;
  }
  const ratio = contrast(fgRgb, bgRgb);
  const ok = ratio >= 4.5;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  ${label}` + `  (${fg} on ${bg})`,
  );
}

console.log(
  `\n${PAIRS.length - failures}/${PAIRS.length} pairs meet AA.` +
    (failures ? ' Adjust the values in packages/ui/src/theme.css.' : ''),
);
process.exit(failures ? 1 : 0);
