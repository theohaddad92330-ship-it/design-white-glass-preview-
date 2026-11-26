import base from '@bellum/tooling/eslint/base'

export default [
  ...base,
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs', 'vitest.config.ts'],
  },
]
