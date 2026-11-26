import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Les paquets `@bellum/*` résolus sur leurs SOURCES (comme `tsconfig.extract.json`) : le test de
 * fraîcheur de `generated/demo.json` relit le jeu de démonstration de l'API sans exiger un build.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@bellum\/([a-z-]+)$/, replacement: resolve(__dirname, '../$1/src/index.ts') }],
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
