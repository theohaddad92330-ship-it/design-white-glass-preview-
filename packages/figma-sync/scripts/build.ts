import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

/**
 * `pnpm --filter @bellum/figma-sync build` (après `extract`) : bundle le plugin
 * en UN fichier `dist/code.js` qui EMBARQUE generated/tokens.json et les specs
 * — le bac à sable Figma ne lit aucun fichier. Cible ES2017 : le moteur des
 * plugins ne garantit pas la syntaxe plus récente (`?.`, `??`).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(resolve(root, 'dist'), { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/plugin/code.ts')],
  outfile: resolve(root, 'dist/code.js'),
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'neutral',
  logLevel: 'info',
})
copyFileSync(resolve(root, 'src/plugin/ui.html'), resolve(root, 'dist/ui.html'))
