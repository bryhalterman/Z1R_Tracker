import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const source = (path) => fileURLToPath(new URL(path, import.meta.url));

const MANIFEST = source('./packages/core/src/sprites/manifest.json');
const MAPS = source('./assets/maps');
const LAUNCHER = source('./scripts/launcher/serve.mjs');

/**
 * Publishes the sprite manifest next to each build's `index.html`.
 *
 * Every app fetches `sprites.json` before falling back to the copy compiled
 * into its bundle, which lets art be re-skinned by editing one deployed file.
 * Emitting it here rather than committing a copy per app keeps a single source
 * of truth, and stops the fetch from 404-ing on every page load — a console
 * error that looks like a fault but isn't.
 */
/** @returns {import('vite').Plugin} */
export function spriteManifest() {
  return {
    name: 'z1r-sprite-manifest',
    configureServer(server) {
      // Under the app's base, for the reason `localMaps` gives below.
      server.middlewares.use(`${server.config.base}sprites.json`, (_req, res) => {
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
/** @returns {import('vite').Plugin} */
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
      // Mounted under the app's base. Plugin middleware runs before Vite
      // strips the base from the URL, so the web app's requests arrive as
      // `/Z1R_Tracker/maps/...` and a bare `/maps` mount never saw them: they
      // fell through to `index.html`. A relative base resolves to `/` here.
      server.middlewares.use(`${server.config.base}maps`, (req, res, next) => {
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
 * stylesheet entries have to come before the bare package name or they resolve
 * to `.../index.ts/styles.css`.
 */
export const workspaceAliases = [
  { find: '@z1r/ui/styles.css', replacement: source('./packages/ui/src/styles.css') },
  // The OBS setup page takes the palette alone, not the tracker's styles.
  { find: '@z1r/ui/theme.css', replacement: source('./packages/ui/src/theme.css') },
  { find: '@z1r/ui', replacement: source('./packages/ui/src/index.ts') },
  { find: '@z1r/core', replacement: source('./packages/core/src/index.ts') },
];

/**
 * Ships `serve.mjs` beside a build's `index.html`.
 *
 * The desktop and OBS builds both carry the same launcher. It used to be two
 * byte-identical copies in each app's `public`, which had already drifted from
 * what one of them was for; emitting one source keeps them the same file.
 */
/** @returns {import('vite').Plugin} */
export function launcher() {
  return {
    name: 'z1r-launcher',
    buildStart() {
      this.addWatchFile(LAUNCHER);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'serve.mjs',
        source: readFileSync(LAUNCHER, 'utf8'),
      });
    },
  };
}

/**
 * The config every app builds from: React, Tailwind, the shared sprite
 * manifest and maps, the workspace aliases, and the build settings all three
 * targets share.
 *
 * `plugins` are appended after the shared ones, and `build` is spread over the
 * shared build settings, so an app adds what is particular to it and nothing
 * else. Anything else in `options` is passed through as it is.
 *
 * @param {{ base: string; plugins?: import('vite').PluginOption[]; build?: import('vite').BuildOptions } & Omit<import('vite').UserConfig, 'base' | 'plugins' | 'build' | 'resolve'>} options
 * @returns {import('vite').UserConfig}
 */
export function baseConfig({ base, plugins = [], build = {}, ...rest }) {
  return {
    base,
    ...rest,
    plugins: [react(), tailwindcss(), spriteManifest(), localMaps(), ...plugins],
    resolve: { alias: workspaceAliases },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2022',
      ...build,
    },
  };
}
