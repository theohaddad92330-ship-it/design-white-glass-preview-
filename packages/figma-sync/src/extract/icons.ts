import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { REPO_ROOT } from './tokens'

/**
 * Les tracés lucide des icônes que les composants dessinent, lus dans
 * lucide-react — LA version de `packages/ui` (celle que l'app affiche), jamais
 * une copie. Sortie : `{ nom: '<circle …/><path …/>' }`, le contenu d'un
 * `<svg viewBox="0 0 24 24">` lucide.
 */

function iconsDir(): string {
  const require = createRequire(resolve(REPO_ROOT, 'packages/ui/package.json'))
  const entry = require.resolve('lucide-react')
  // …/lucide-react/dist/cjs/lucide-react.js → …/lucide-react/dist/esm/icons
  return resolve(dirname(entry), '../esm/icons')
}

const kebab = (attr: string): string => attr.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Le contenu SVG d'une icône, en suivant les alias (`alert-circle` → `circle-alert`). */
export function readIcon(name: string, dir = iconsDir()): string {
  // #4895.6 — lucide-react 0.x livre `<nom>.js`, la 1.x `<nom>.mjs` (`briefcase` n'est PAS retirée : c'est la
  // première icône du tri, donc la première à tomber sur l'extension).
  const file = ['.js', '.mjs'].map(ext => resolve(dir, `${name}${ext}`)).find(candidate => existsSync(candidate))
  if (!file) throw new Error(`Icône lucide introuvable : ${name} (${resolve(dir, `${name}.js`)} ni .mjs)`)
  const src = readFileSync(file, 'utf8')
  const alias = /export \{ default \} from '\.\/([\w-]+)\.m?js'/.exec(src)
  if (alias?.[1]) return readIcon(alias[1], dir)
  const nodes = [...src.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)]
  if (nodes.length === 0) throw new Error(`Icône lucide illisible : ${name}`)
  return nodes
    .map(([, tag, body]) => {
      const attrs = [...(body ?? '').matchAll(/(\w+):\s*"([^"]*)"/g)]
        .filter(([, k]) => k !== 'key')
        .map(([, k, v]) => `${kebab(k ?? '')}="${v}"`)
        .join(' ')
      return `<${tag} ${attrs}/>`
    })
    .join('')
}

export function extractIcons(names: readonly string[]): Record<string, string> {
  const dir = iconsDir()
  return Object.fromEntries([...names].sort().map(n => [n, readIcon(n, dir)]))
}
