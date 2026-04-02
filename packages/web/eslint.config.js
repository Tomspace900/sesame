import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // ── TypeScript ──────────────────────────────────────────────────────────

      // Enforce import type for type-only imports (matches verbatimModuleSyntax)
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],

      // Unused vars: allow _-prefixed intentional ignores
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // No any — strict mode already catches, keep explicit for clarity
      '@typescript-eslint/no-explicit-any': 'error',

      // Avoid non-null assertions — warn (query fns guarantee user is non-null via `enabled: !!user`)
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Consistent array types: T[] not Array<T>
      '@typescript-eslint/array-type': ['error', { default: 'array' }],

      // No empty functions (bugs waiting to happen)
      '@typescript-eslint/no-empty-function': ['error', {
        allow: ['arrowFunctions'],
      }],

      // Project uses `type` throughout — do not force interface
      '@typescript-eslint/consistent-type-definitions': 'off',

      // ── React ───────────────────────────────────────────────────────────────

      // react-hooks/exhaustive-deps is already set to warn by the plugin
      // Upgrade to error so missing deps are caught at lint time
      'react-hooks/exhaustive-deps': 'error',

      // Date.now() and similar "impure" calls in render are intentional (relative timestamps)
      'react-hooks/purity': 'off',

      // ── General JS ──────────────────────────────────────────────────────────

      // console.log is noise in production — use console.warn/error for intent
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Prefer const over let when not reassigned
      'prefer-const': 'error',

      // Ban var
      'no-var': 'error',

      // Disabled: conflicts with verbatimModuleSyntax which requires separate `import type` statements
      // @typescript-eslint/consistent-type-imports enforces the inline-type-imports pattern instead
      'no-duplicate-imports': 'off',

      // Consistent object shorthand: { foo } not { foo: foo }
      'object-shorthand': 'error',
    },
  },
])
