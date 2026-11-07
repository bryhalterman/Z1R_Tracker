// Lint rules for the whole workspace: `npm run lint`.
//
// TypeScript's own checks run in `npm run typecheck`; this adds the rules a
// compiler does not have — React's rules of hooks above all, which the panels
// depend on now that every one of them is a component.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.test-build/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser code: the packages and the apps' own sources.
    files: ['packages/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Node: build tooling (the launcher shipped next to the desktop and OBS
    // builds is in scripts/launcher), and the tests, which run under Node's
    // own test runner.
    files: ['*.{js,mjs}', 'scripts/**/*.mjs', 'apps/*/*.config.ts', '**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The desktop build's offline sprite cache runs as a service worker.
    files: ['apps/desktop/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Ambient globals are declared with `var`: only that puts them on
    // `globalThis`, which core reads storage and its listeners through.
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
  },
  {
    rules: {
      // A leading underscore marks a parameter kept for its position.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
