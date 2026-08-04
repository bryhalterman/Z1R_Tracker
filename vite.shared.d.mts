/** Types for `vite.shared.mjs`, which stays plain JS so Vite configs can import it directly. */
import type { Plugin } from 'vite';

export declare const workspaceAliases: { find: string; replacement: string }[];
export declare function spriteManifest(): Plugin;
