import { defineConfig, type Plugin } from 'vite';
import { localMaps, spriteManifest, workspaceAliases } from '../../vite.shared.mjs';

/**
 * Vite tags the entry script `type="module" crossorigin` because that is right
 * for every normal deployment. It is wrong here: over `file://` a module
 * script is a cross-origin request and browsers refuse it, so the page loads
 * to a blank screen. The bundle is already a self-contained IIFE with no
 * import/export, so a classic `defer` script is both valid and loadable.
 */
function classicScriptTag(): Plugin {
  return {
    name: 'z1r-classic-script-tag',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/(<link rel="stylesheet") crossorigin/g, '$1');
    },
  };
}

/**
 * The downloadable build has one hard requirement the other two don't: double
 * -clicking `index.html` has to work. `serve.mjs` ships alongside for anyone
 * who'd rather run it over http and pick up the offline service worker.
 */
export default defineConfig({
  base: './',
  plugins: [spriteManifest(), localMaps(), classicScriptTag()],
  resolve: { alias: workspaceAliases },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        // Content-hashed, like the other two targets. Fixed names meant a
        // browser that had seen assets/index.js once would keep serving the old
        // one after an update — which is exactly what happened during review.
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
