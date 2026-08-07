/**
 * Fills in the absolute URLs on the setup page.
 *
 * They have to be copied into OBS by hand, so showing the real address beats
 * showing a relative path the reader then has to assemble themselves.
 */
const targets: [id: string, page: string][] = [
  ['overlay-url', 'overlay.html'],
  ['dock-url', 'dock.html'],
  ['map-url', 'map.html'],
];

for (const [id, page] of targets) {
  const node = document.getElementById(id);
  if (node) node.textContent = new URL(page, document.baseURI).href;
}
