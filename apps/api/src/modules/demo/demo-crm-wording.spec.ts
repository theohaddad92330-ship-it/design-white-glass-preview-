import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4198 (épopée #4191, lot L7) — la démo est ce qu'un prospect voit : aucun
 * libellé de recette (« RECETTE — … ») ni de test (« (test) ») ne s'y trouve,
 * et aucun jargon interne (BTMMP, Reverse Market, Staffable) dans une valeur
 * affichée. Les fiches pleine page (objets liés, cycle de mission) se lisent
 * sur les mêmes lignes seedées que le panneau (L3) : rien de neuf à semer.
 */
const SOURCES = ['demo-dataset.ts', 'demo-seed.service.ts'].map(name => readFileSync(join(__dirname, name), 'utf8'))

/** Les littéraux de chaîne d'une source, hors commentaires de ligne. */
function literals(source: string): string[] {
  return source
    .split('\n')
    .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .flatMap(line => line.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) ?? [])
}

describe('demo — libellés propres', () => {
  it.each([
    ['« RECETTE — … »', /^['"]RECETTE\s+—/],
    ['« (test) »', /\(test\)['"]$/],
    ['jargon interne', /\b(BTMMP|Reverse Market|Staffable)\b/],
  ])('aucun littéral %s', (_nom, motif) => {
    const fautifs = SOURCES.flatMap(literals)
      .filter(l => motif.test(l))
      .slice(0, 5)
    expect(fautifs).toEqual([])
  })
})
