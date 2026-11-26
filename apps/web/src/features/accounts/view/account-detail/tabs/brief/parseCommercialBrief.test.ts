import { describe, expect, it } from 'vitest'
import bpce from '../../../../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'
import { parseCommercialBrief } from './parseCommercialBrief'

/**
 * #3712.6 (DEC-4036 Q9, Louis 19/10 : « c'est parasite ») — la fiche compte ne NOMME plus les
 * limites du brief (« on ne sait pas qui décide chez X »). Les briefs déjà écrits (base, semis
 * démo) portent encore la rubrique : elle tombe à la lecture.
 */
const withRows = (rows: { rubric: string; known: string; meaning: string }[]) => ({
  commercial_brief: { ...structuredClone(bpce), what_i_know: rows },
})
const row = (rubric: string) => ({ rubric, known: 'k', meaning: 'm' })

describe('#3712.6 — parseCommercialBrief retire les rubriques de limites', () => {
  it('retire « CE QU’ON NE SAIT PAS » et ses variantes', () => {
    const parsed = parseCommercialBrief(
      withRows([
        row('IDENTITÉ'),
        row("CE QU'ON NE SAIT PAS"),
        row('CE QU’ON NE SAIT PAS'),
        row("CE QUE L'ON NE SAIT PAS — ACHATS"),
        row('LIMITES'),
      ]),
    )
    expect(parsed?.what_i_know.map(r => r.rubric)).toEqual(['IDENTITÉ'])
  })

  it('sait dire NON — « QUI DÉCIDE » et les autres rubriques restent', () => {
    const parsed = parseCommercialBrief(withRows([row('ORGANISATION MÉTIER — QUI DÉCIDE'), row('ACHATS')]))
    expect(parsed?.what_i_know).toHaveLength(2)
  })

  it('un brief qui ne disait QUE ses limites ne s’affiche pas (on n’affiche pas ce qu’on n’a pas)', () => {
    expect(parseCommercialBrief(withRows([row("CE QU'ON NE SAIT PAS")]))).toBeNull()
  })
})
