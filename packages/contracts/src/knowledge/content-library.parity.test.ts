import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONTENT_LIBRARY_ENTRIES } from './content-library.js'

/**
 * La garde de parité de la bibliothèque de contenu — TS (le registre source)
 * ↔ Python (le miroir que le copilote peut citer). Même mécanique que
 * `message-matrix.test.ts` : extraire le JSON brut du module Python et le
 * comparer, structure entière, au registre TS — jamais une comparaison de
 * chaînes qui laisserait passer un texte reformulé.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const MIRROR_PY = monorepoFile('apps/ia/app/knowledge/content_library.py')
const mirrorSource = readFileSync(MIRROR_PY, 'utf8')

function mirrorJson(): unknown {
  const match = mirrorSource.match(/_CONTENT_LIBRARY_JSON = r"""([\s\S]*?)"""/)
  expect(match, `\`_CONTENT_LIBRARY_JSON = r"""…"""\` introuvable dans ${MIRROR_PY}`).not.toBeNull()
  return JSON.parse(match?.[1] ?? 'null')
}

describe('parité de la bibliothèque de contenu — le registre TS ↔ le miroir Python', () => {
  it('LIT vraiment le module Python (sinon la garde est borgne)', () => {
    expect(mirrorSource.length).toBeGreaterThan(2000)
    expect(mirrorSource).toContain('_CONTENT_LIBRARY_JSON = r"""')
    expect(CONTENT_LIBRARY_ENTRIES.length).toBe(26)
  })

  it('les DEUX côtés portent exactement les mêmes 26 entrées, verbatim', () => {
    const expected = JSON.parse(JSON.stringify(CONTENT_LIBRARY_ENTRIES))
    expect(mirrorJson()).toEqual(expected)
  })

  it('aucun identifiant n’est déclaré deux fois', () => {
    const ids = CONTENT_LIBRARY_ENTRIES.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
