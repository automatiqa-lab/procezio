// Flat ESLint config for the whole workspace. Type-aware TypeScript linting, React Hooks
// rules for the app, and Prettier last so formatting never fights a lint rule. Kept lean:
// this catches real mistakes (floating promises, unsafe any, stale hook deps), it is not a
// style bikeshed. Run with `pnpm lint` (or `pnpm lint:fix`); CI runs `pnpm ci:lint`.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    // Not source: build output, deps, generated types, the reference prototype, and the
    // local-only tooling (never ships to the public repo).
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.generated.ts',
      '**/validators.cjs', // ajv-standalone codegen output; drift-gated, never hand-edited
      'prototypes/**',
      '.harness/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The methodology engine leans on discriminated unions and exhaustive switches; an
      // unused var is a real smell, but allow the leading-underscore escape hatch.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // A dropped promise in an event-sourced core is a determinism hazard - keep it loud.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // The React app: Hooks correctness + Fast Refresh hygiene, plus browser globals.
  {
    files: ['app/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Rules-of-hooks stays an error (a real correctness gate). The dependency-array and
      // the newer React-Compiler-oriented lints are advisory here - surfaced as warnings so
      // they guide without blocking CI on an intentional pattern.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Test files run under node:test. Its top-level `test(...)` calls return a promise the
  // runner awaits, and async cases without an await are a normal shape - so the
  // floating-promise / require-await / test-only assertion lints are noise here, not signal.
  {
    files: ['**/*.test.{ts,tsx,mjs,cjs}', '**/*.spec.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Node-side code (relay, build scripts, gates, config): Node globals, and console is fine.
  {
    files: ['relay/**/*.ts', 'scripts/**/*.{js,mjs,ts}', '*.{js,mjs}', '**/*.config.{js,ts,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Plain JS/MJS tooling is not part of the typed program - skip type-aware rules there.
  {
    files: ['**/*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Config files (vite.config.ts, etc.) live outside the app tsconfig's include, so the
  // type-aware project service can't find them. Parse them plainly, with Node globals.
  {
    files: ['**/*.config.{ts,mts,cts}'],
    languageOptions: {
      parserOptions: { projectService: false },
      globals: { ...globals.node },
    },
    rules: { ...tseslint.configs.disableTypeChecked.rules },
  },

  // Playwright E2E specs run under Playwright's own tooling, outside any package tsconfig.
  {
    files: ['e2e/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: false },
      globals: { ...globals.node },
    },
    rules: { ...tseslint.configs.disableTypeChecked.rules },
  },

  // Prettier last: turn off every rule that would conflict with the formatter.
  prettier,
)
