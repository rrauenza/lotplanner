import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import svelteConfig from './svelte.config.js'

export default tseslint.config(
  {
    ignores: ['.agents/', 'dist/', 'node_modules/', 'playwright-report/', 'test-results/'],
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  ...svelte.configs.recommended,
  ...svelte.configs.prettier,

  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        // The Svelte parser delegates the `<script lang="ts">` body to
        // typescript-eslint, so the type-aware rules work inside components too.
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
    rules: {
      // A component's props are read in the markup, which this rule cannot see.
      '@typescript-eslint/no-unused-vars': 'off',
      // svelte2tsx declares the runes in a shape this rule reads as void, so it
      // fires on every `let x = $state(...)`. It stays on everywhere else, where
      // it earns its place - it caught `() => resolve(x)` in the storage adapter.
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },

  {
    // Config files at the repository root belong to no TypeScript project, so
    // the type-aware rules are switched off for them rather than left to fail.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['**/*.config.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
