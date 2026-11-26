/**
 * #2630.2 — CE QU'ON VOIT PENDANT QU'UNE ANALYSE TOURNE, et ce qu'on ne voit
 * surtout pas.
 *
 * Un partiel est la seule chose du produit qui s'affiche AVANT d'être complète.
 * C'est donc l'endroit exact où « on n'affiche pas ce qu'on n'a pas » se joue :
 * une phase qui n'a rien ramené ne fait AUCUNE ligne, et « 0 contact trouvé »
 * ne doit pouvoir sortir d'aucun chemin.
 *
 * Chaque refus est cassé ici sur un COUPABLE FACTICE.
 */
import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_PARTIAL_KINDS,
  ANALYSIS_PARTIAL_MAX_SAMPLES,
  analysisPartialFrom,
  analysisPartialSchema,
} from './analysis-partial.js'

const AT = 1_758_000_000_000

describe('#2630.2 — un partiel dit ce qui est DÉJÀ trouvé', () => {
  it('les natures sont fermées, et ordonnées', () => {
    expect([...ANALYSIS_PARTIAL_KINDS]).toEqual(['contacts', 'angles'])
  })

  it('compte les contacts remontés, et en NOMME quelques-uns', () => {
    const partial = analysisPartialFrom({
      phase: 'contacts_complete',
      data: {
        contacts: [
          { full_name: 'Claire Roggeman', title: 'DSI' },
          { full_name: 'Marc Oberlé' },
          { full_name: 'Hélène Vasseur' },
          { full_name: 'Bruno Delcourt' },
        ],
      },
      at: AT,
    })
    expect(partial?.findings).toEqual([
      { kind: 'contacts', count: 4, samples: ['Claire Roggeman', 'Marc Oberlé', 'Hélène Vasseur'] },
    ])
    expect(analysisPartialSchema.parse(partial)).toBeTruthy()
  })

  it('compte les angles de la phase de recherche par leur titre', () => {
    const partial = analysisPartialFrom({
      phase: 'research_complete',
      data: { angles: [{ title: 'Migration du SI de production' }, { title: 'Ouverture d’un site à Toulouse' }] },
      at: AT,
    })
    expect(partial?.findings).toEqual([
      { kind: 'angles', count: 2, samples: ['Migration du SI de production', 'Ouverture d’un site à Toulouse'] },
    ])
  })

  it('ne NOMME jamais plus de trois choses, quel que soit le nombre trouvé', () => {
    const partial = analysisPartialFrom({
      phase: 'contacts_complete',
      data: { contacts: Array.from({ length: 30 }, (_, index) => ({ full_name: `Personne ${index}` })) },
      at: AT,
    })
    expect(partial?.findings[0]?.count).toBe(30)
    expect(partial?.findings[0]?.samples).toHaveLength(ANALYSIS_PARTIAL_MAX_SAMPLES)
  })

  it('porte l’instant du constat — un partiel sans date se relit comme frais', () => {
    const partial = analysisPartialFrom({
      phase: 'contacts_complete',
      data: { contacts: [{ full_name: 'Claire Roggeman' }] },
      at: AT,
    })
    expect(partial?.at).toBe(AT)
    expect(partial?.phase).toBe('contacts_complete')
  })
})

describe('#2630.2 — une absence ne fait AUCUNE ligne', () => {
  it('une phase qui n’a RIEN ramené ne produit pas de partiel', () => {
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: { contacts: [] }, at: AT })).toBeNull()
  })

  it('une charge absente ou illisible ne produit pas de partiel — rien ne se devine', () => {
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: undefined, at: AT })).toBeNull()
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: null, at: AT })).toBeNull()
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: 'trois contacts', at: AT })).toBeNull()
    expect(analysisPartialFrom({ phase: 'contacts_complete', data: { contacts: 12 }, at: AT })).toBeNull()
  })

  it('une phase sans nature connue ne produit pas de partiel', () => {
    expect(analysisPartialFrom({ phase: 'plan_complete', data: { plan: { steps: [1, 2] } }, at: AT })).toBeNull()
  })

  it('un élément sans nom est COMPTÉ mais pas nommé — on ne fabrique aucun libellé', () => {
    const partial = analysisPartialFrom({
      phase: 'contacts_complete',
      data: { contacts: [{ title: 'DSI' }, { full_name: 'Marc Oberlé' }, { full_name: '   ' }] },
      at: AT,
    })
    expect(partial?.findings[0]?.count).toBe(3)
    expect(partial?.findings[0]?.samples).toEqual(['Marc Oberlé'])
  })
})

describe('#2630.2 — le contrat sait dire NON (coupables factices)', () => {
  it('refuse un décompte à ZÉRO — « 0 contact trouvé » n’est pas un partiel', () => {
    const honest = analysisPartialFrom({
      phase: 'contacts_complete',
      data: { contacts: [{ full_name: 'Claire Roggeman' }] },
      at: AT,
    })
    expect(analysisPartialSchema.parse(honest)).toBeTruthy()
    expect(() =>
      analysisPartialSchema.parse({ ...honest, findings: [{ kind: 'contacts', count: 0, samples: [] }] }),
    ).toThrow()
  })

  it('refuse un partiel SANS aucune trouvaille', () => {
    expect(() => analysisPartialSchema.parse({ phase: 'contacts_complete', at: AT, findings: [] })).toThrow()
  })

  it('refuse PLUS DE NOMS que de choses trouvées — un nom de trop est un nom inventé', () => {
    expect(() =>
      analysisPartialSchema.parse({
        phase: 'contacts_complete',
        at: AT,
        findings: [{ kind: 'contacts', count: 1, samples: ['Claire Roggeman', 'Marc Oberlé'] }],
      }),
    ).toThrow()
  })

  it('refuse un POURCENTAGE de complétude — un partiel dit ce qu’il a, pas où il en est', () => {
    expect(() =>
      analysisPartialSchema.parse({
        phase: 'contacts_complete',
        at: AT,
        findings: [{ kind: 'contacts', count: 2, samples: [] }],
        percentComplete: 40,
      }),
    ).toThrow()
  })
})
