/**
 * Garde-fou : tout `var(--bellum-*)` écrit dans le code doit EXISTER.
 *
 * Pourquoi ce test existe : une variable CSS inconnue ne casse rien de visible
 * au build — ni TypeScript, ni ESLint, ni Tailwind ne connaissent le nom d'un
 * token, et le navigateur ignore silencieusement la déclaration. Le bouton
 * « Lancer la démo » portait `bg-[var(--bellum-accent)]` (jamais défini) avec
 * `text-white` : fond absent, texte blanc sur fond clair, bouton INVISIBLE en
 * production sur la page que voient les prospects (04/08/2026). Les cartes
 * voisines utilisaient `--bellum-surface` alors que le token s'appelle
 * `--bellum-surface-1`.
 *
 * Le test relit la liste des tokens DEPUIS `tokens.css` — rien n'est recopié
 * ici, donc renommer un token fait tomber ses usages plutôt que ce fichier.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(__dirname, '..')
const TOKENS_CSS = join(__dirname, 'tokens.css')

/** Noms déclarés (`--bellum-x: …`) dans la source de vérité. */
function declaredTokens(): Set<string> {
  const css = readFileSync(TOKENS_CSS, 'utf8')
  return new Set(Array.from(css.matchAll(/(--bellum-[a-z0-9-]+)\s*:/g), m => m[1]))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) ? [full] : []
  })
}

describe('tokens --bellum-*', () => {
  it('n’utilise que des variables réellement déclarées dans tokens.css', () => {
    const declared = declaredTokens()
    expect(declared.size).toBeGreaterThan(20) // le parsing lui-même doit tenir

    const unknown: string[] = []
    for (const file of sourceFiles(SRC_DIR)) {
      if (file === TOKENS_CSS || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      const content = readFileSync(file, 'utf8')
      for (const match of content.matchAll(/var\((--bellum-[a-z0-9-]+)/g)) {
        const name = match[1]
        if (!declared.has(name)) unknown.push(`${file.slice(SRC_DIR.length + 1)} → ${name}`)
      }
    }

    expect(unknown).toEqual([])
  })
})
