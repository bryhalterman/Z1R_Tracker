/** Types for `vite.shared.mjs`, which stays plain JS so Vite configs can import it directly. */
import type { BuildOptions, Plugin, PluginOption, UserConfig } from 'vite';

export declare const workspaceAliases: { find: string; replacement: string }[];
export declare function spriteManifest(): Plugin;
export declare function localMaps(): Plugin;
export declare function launcher(): Plugin;

export interface BaseConfigOptions extends Omit<UserConfig, 'base' | 'plugins' | 'build' | 'resolve'> {
  base: string;
  plugins?: PluginOption[];
  build?: BuildOptions;
}
export declare function baseConfig(options: BaseConfigOptions): UserConfig;
