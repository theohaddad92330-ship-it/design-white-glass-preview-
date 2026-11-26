import base from './base.mjs'

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['**/*.spec.ts', '**/*.e2e.spec.ts'],
  },
]
