import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { spriteManifest, workspaceAliases } from '../../vite.shared.mjs';

// Relative base: the built folder gets pointed at by a local file path or by
// whatever host the streamer parks it on, and neither is known at build time.
export default defineConfig({
  base: './',
  /*
   * A short, changing build id, shown in the dock's footer.
   *
   * Docks cannot be told to drop their cache from OBS's UI, so the only way to
   * know whether one is running current code is for it to say so.
   */
  define: {
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')),
  },
  plugins: [spriteManifest()],
  resolve: { alias: workspaceAliases },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        // `index.html` is a setup page, not a tracker. The overlay has its own
        // name now: serving it at the root URL meant a dock pointed at `/` got
        // a read-only page with no explanation.
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        overlay: fileURLToPath(new URL('./overlay.html', import.meta.url)),
        dock: fileURLToPath(new URL('./dock.html', import.meta.url)),
      },
    },
  },
});
