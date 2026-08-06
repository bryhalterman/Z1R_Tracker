import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = (path) => fileURLToPath(new URL(path, import.meta.url));

const MANIFEST = source('./packages/core/src/sprites/manifest.json');
const MAPS = source('./assets/maps');

/**
 * Publishes the sprite manifest next to each build's `index.html`.
 *
 * Every app fetches `sprites.json` before falling back to the copy compiled
 * into its bundle, which lets art be re-skinned by editing one deployed file.
 * Emitting it here rather than committing a copy per app keeps a single source
 * of truth, and stops the fetch from 404-ing on every page load — a console
 * error that looks like a fault but isn't.
 */
export function spriteManifest() {
  return {
    name: 'z1r-sprite-manifest',
    configureServer(server) {
      server.middlewares.use('/sprites.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        // Read per request so manifest edits show up without a restart.
        res.end(readFileSync(MANIFEST, 'utf8'));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sprites.json',
        source: readFileSync(MANIFEST, 'utf8'),
      });
    },
  };
}

/**
 * Serves the overworld maps from the build rather than from the wiki.
 *
 * Every other sprite is fetched from its host, deliberately. The maps are the
 * exception because the wiki that has them hotlink-protects: a request carrying
 * a Referer is answered with a 200x73 thumbnail instead of the 1280x468
 * original — status 200, right content type, nothing to notice except that the
 * map is a blurry mess. OBS sends a Referer, browsers here did not, and the
 * same URL therefore looked fine in testing and wrong on the streaming machine.
 *
 * `no-referrer` does fix it, and is set as well, but a backdrop the whole
 * tracker is read against should not depend on a third party's hotlink policy
 * staying the way it is today.
 *
 * Emitted from one shared folder rather than copied into each app's `public`,
 * for the same reason the manifest is.
 */
export function localMaps() {
  const emit = (plugin) => {
    for (const name of readdirSync(MAPS)) {
      plugin.emitFile({
        type: 'asset',
        fileName: `maps/${name}`,
        source: readFileSync(join(MAPS, name)),
      });
    }
  };
  return {
    name: 'z1r-local-maps',
    configureServer(server) {
      server.middlewares.use('/maps', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!name || name.includes('..')) return next();
        try {
          res.setHeader('content-type', 'image/webp');
          res.end(readFileSync(join(MAPS, name)));
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      emit(this);
    },
  };
}

/**
 * Workspace packages are consumed as TypeScript source rather than built
 * artifacts, so every app aliases them to `src`. This keeps `npm run dev`
 * hot-reloading across package boundaries and removes a build ordering step.
 *
 * Order matters: Vite treats a string `find` as a prefix match, so the deep
 * `styles.css` entry has to come before the bare package name or it resolves
 * to `.../index.ts/styles.css`.
 */
export const workspaceAliases = [
  { find: '@z1r/ui/styles.css', replacement: source('./packages/ui/src/styles.css') },
  { find: '@z1r/ui', replacement: source('./packages/ui/src/index.ts') },
  { find: '@z1r/core', replacement: source('./packages/core/src/index.ts') },
];
