/**
 * GA-405 — UN SIGNAL NE DEVIENT JAMAIS UN BESOIN DANS UNE SEULE PAGE (#3423.10,
 * retour bêta du 30/09/2026).
 *
 * « Un signal ne devient jamais besoin dans une seule page et reste signal dans
 * une autre. » Sur le dossier d'un compte, la frontière signal / besoin est UN
 * prédicat — `isConfirmedNeedRow` (`accountNeedRows.ts`) : une ligne de pipe
 * qui n'est pas un signal ET dont le stade est « confirmé ». Il était écrit deux
 * fois, mot pour mot (l'onglet Besoins et l'index de recherche du dossier), avec
 * pour seule garantie un commentaire « même règle ». Un commentaire n'est pas
 * une garde : qu'une des deux copies bouge, et la recherche rangerait en
 * « besoin » ce que l'onglet Besoins montre comme signal.
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon ce docblock la ferait
 * échouer elle-même.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DETAIL = join(__dirname, '..', 'features', 'accounts', 'view', 'account-detail')
const CANONICAL = join(DETAIL, 'tabs', 'accountNeedRows.ts')
const SURFACES = [join(DETAIL, 'tabs', 'TabNeeds.tsx'), join(DETAIL, 'search', 'dossierSearchIndex.ts')]

function read(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Un second moteur : `.kind` comparé à `'signal'` ET `'confirmed'` écrits à la main. */
const localNeedRule = /\.kind\s*[!=]==?\s*['"]signal['"][^\n]{0,80}\.stage\s*===?\s*['"]confirmed['"]/

describe('GA-405 — la garde LIT vraiment quelque chose', () => {
  it('le prédicat canonique existe et porte la règle', () => {
    expect(read(CANONICAL)).toMatch(/export function isConfirmedNeedRow/)
  })

  it('savoir dire NON : le motif attrape une copie locale de la règle', () => {
    expect(localNeedRule.test(`rows.filter(row => row.kind !== 'signal' && row.stage === 'confirmed')`)).toBe(true)
    expect(localNeedRule.test(`rows.filter(isConfirmedNeedRow)`)).toBe(false)
  })
})

describe('GA-405 — Besoins et recherche du dossier lisent le MÊME prédicat', () => {
  for (const file of SURFACES) {
    it(`${file.split('/').pop()} importe le prédicat canonique et n'en recopie pas la règle`, () => {
      const source = read(file)
      expect(source).toMatch(/isConfirmedNeedRow/)
      expect(source).toMatch(/accountNeedRows/)
      expect(source).not.toMatch(localNeedRule)
    })
  }
})
