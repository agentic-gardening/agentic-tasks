import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import noNull from 'eslint-plugin-no-null';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import typescriptLint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '*.config.*js', '**/__mocks__/'] },
  js.configs.recommended,
  ...typescriptLint.configs.recommended,
  sonarjs.configs.recommended,
  ...fixupConfigRules(compat.extends('plugin:import/recommended', 'plugin:import/typescript')),
  {
    plugins: {
      unicorn,
      import: fixupPluginRules(importPlugin),
      'no-null': fixupPluginRules(noNull),
      'simple-import-sort': fixupPluginRules(simpleImportSort),
    },
    settings: { 'import/resolver': { typescript: true, node: true } },
  },
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    rules: {
      eqeqeq: 'error',
      'prefer-promise-reject-errors': 'error',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'no-null/no-null': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'sonarjs/cognitive-complexity': ['error', 20],
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/todo-tag': 'off',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-array-sort': 'error',
      'unicorn/no-useless-undefined': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/prefer-import-in-mock': 'error',
      'vitest/no-alias-methods': 'error',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'no-null/no-null': 'off',
    },
  },
];
