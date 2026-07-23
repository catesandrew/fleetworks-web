import path from 'node:path'
import { fileURLToPath } from 'node:url'

import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import a11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import * as tseslint from 'typescript-eslint'

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url))

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vercel/**',
      '**/.DS_Store',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
    ],
  },

  { linterOptions: { reportUnusedDisableDirectives: true } },

  {
    plugins: {
      import: importPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': a11y,
      '@typescript-eslint': tseslint.plugin,
    },
  },

  js.configs.recommended,

  prettier,

  // Import hygiene
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: { project: ['./tsconfig.json'] },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'],
        },
      },
    },
    rules: {
      'import/no-duplicates': 'error',
      'import/newline-after-import': 'error',
      'import/first': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-implicit-coercion': ['error', { boolean: true }],
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-undef': 'off',
    },
  },

  // Declaration files
  {
    files: ['**/*.d.ts'],
    rules: {
      'import/no-duplicates': 'off',
      'import/no-unresolved': 'off',
    },
  },

  // ESLint config files
  {
    files: ['eslint.config.{js,cjs,mjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: globals.node,
    },
  },

  // TypeScript
  ...tseslint.configs.recommended,

  // Type-aware TypeScript
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: undefined,
        tsconfigRootDir,
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': [
        'warn',
        { ignoreMixedLogicalExpressions: false },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'warn',
        { allowConstantLoopConditions: true, checkTypePredicates: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // React + Hooks
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/display-name': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Accessibility
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      ...a11y.configs.recommended.rules,
    },
  },
]
