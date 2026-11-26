import nestjsConfig from '@bellum/tooling/eslint/nestjs'

export default [
  ...nestjsConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs'],
  },
]
