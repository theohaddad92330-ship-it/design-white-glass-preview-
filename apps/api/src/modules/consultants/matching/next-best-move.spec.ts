import { NEXT_BEST_MOVE_OPTIONS, type MatchRun } from '@bellum/contracts'
import { assertCriteriaUnchanged, nextBestMoveOptions } from './next-best-move'

/**
 * #2331.4 / #2331.5 / #2331.7 — LAU-FINAL-072, NO-MATCH ROOT CAUSE ET
 * NEXT-BEST-MOVE. Le calcul du « pourquoi zéro » (#2331.1-.3, .6) est un autre
 * lot ; celui-ci porte les trois garde-fous : la liste FERMÉE des sept
 * arbitrages, jamais un plateau vide sur un zéro résultat, et jamais un
 * critère réécrit en silence.
 */

function baseRun(overrides: Partial<MatchRun> = {}): MatchRun {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    need: {
      needId: null,
      role: 'Ingénieur DevOps',
      accountName: 'Acme',
      accountSector: null,
      projectSectors: [],
      skills: [],
      minYears: null,
      seniorityBand: null,
      environment: [],
      languages: [],
      clearances: [],
    } as unknown as MatchRun['need'],
    weights: {} as MatchRun['weights'],
    threshold: 60,
    evaluatedCount: 0,
    prefilteredCount: 0,
    truncated: false,
    recommended: [],
    borderline: [],
    excluded: [],
    notEvaluable: [],
    exclusionCounts: [],
    identities: [],
    nextBestMove: null,
    feedbackLearnings: [],
    createdAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('nextBestMoveOptions', () => {
  it('rend null quand au moins un profil est recommandé — la question ne se pose pas', () => {
    const run = baseRun({ recommended: [{ consultantId: 'c1' } as never] })
    expect(nextBestMoveOptions(run)).toBeNull()
  })

  it('rend null quand un profil est borderline — encore défendable', () => {
    const run = baseRun({ borderline: [{ consultantId: 'c1' } as never] })
    expect(nextBestMoveOptions(run)).toBeNull()
  })

  it('#2331.7 — ne rend JAMAIS un tableau vide sur un vrai zéro résultat', () => {
    const run = baseRun({ exclusionCounts: [] })
    const options = nextBestMoveOptions(run)
    expect(options).not.toBeNull()
    expect(options!.length).toBeGreaterThan(0)
    for (const option of options!) expect(NEXT_BEST_MOVE_OPTIONS).toContain(option)
  })

  it('propose négocier quand le TJM est le motif qui revient', () => {
    const run = baseRun({ exclusionCounts: [{ reason: 'rate_out_of_range', count: 4 }] })
    expect(nextBestMoveOptions(run)).toContain('negocier')
  })

  it('propose réactiver quand la disponibilité est le motif qui revient', () => {
    const run = baseRun({ exclusionCounts: [{ reason: 'unavailable_at_start', count: 3 }] })
    expect(nextBestMoveOptions(run)).toContain('reactiver')
  })

  it('propose élargir quand la zone est le motif qui revient', () => {
    const run = baseRun({ exclusionCounts: [{ reason: 'out_of_zone', count: 5 }] })
    expect(nextBestMoveOptions(run)).toContain('elargir')
  })

  // #2178.14 — contract_mismatch pousse « élargir CDI/freelance », plus
  // « négocier » : un statut contractuel ne se négocie pas comme un TJM.
  it('propose élargir CDI/freelance quand le contrat est le motif qui revient (#2178.14)', () => {
    const run = baseRun({ exclusionCounts: [{ reason: 'contract_mismatch', count: 2 }] })
    const options = nextBestMoveOptions(run)
    expect(options).toContain('elargir_contrat')
    expect(options).not.toContain('negocier')
  })

  it('propose clarifier quand des profils ne sont pas évaluables', () => {
    const run = baseRun({ notEvaluable: [{ consultantId: 'c1' } as never] })
    expect(nextBestMoveOptions(run)).toContain('clarifier')
  })

  // #2178.16/.17/.18/.20 — les quatre arbitrages de dernier recours, TOUJOURS
  // présents sur un vrai zéro résultat, quel que soit le motif rencontré.
  it('propose toujours recommandation, sourcer, partenaire et refuser en dernier recours (#2178.16-.18/.20)', () => {
    const options = nextBestMoveOptions(baseRun({ exclusionCounts: [{ reason: 'rate_out_of_range', count: 4 }] }))!
    expect(options).toContain('recommandation')
    expect(options).toContain('sourcer')
    expect(options).toContain('partenaire')
    expect(options).toContain('refuser')
  })

  // #2178.21 — le premier élément est le geste lié à la cause RÉELLE, jamais
  // un fallback générique tant qu'un motif structuré pointe vers un arbitrage.
  it('place le motif le plus fréquent en tête — le bouton principal (#2178.21)', () => {
    const run = baseRun({
      exclusionCounts: [
        { reason: 'rate_out_of_range', count: 2 },
        { reason: 'out_of_zone', count: 9 },
      ],
    })
    expect(nextBestMoveOptions(run)![0]).toBe('elargir')
  })

  it('#2178.20 — refuser reste toujours EN DERNIER, jamais le bouton principal', () => {
    const run = baseRun({ exclusionCounts: [] })
    const options = nextBestMoveOptions(run)!
    expect(options[options.length - 1]).toBe('refuser')
  })

  it('des contextes différents rendent des sous-ensembles différents (contextuel, pas fixe)', () => {
    const rateRun = nextBestMoveOptions(baseRun({ exclusionCounts: [{ reason: 'rate_out_of_range', count: 4 }] }))!
    const zoneRun = nextBestMoveOptions(baseRun({ exclusionCounts: [{ reason: 'out_of_zone', count: 4 }] }))!
    expect(rateRun).not.toEqual(zoneRun)
  })

  // #2178.38 — recette : TOUTE cause possède un geste. Chaque motif
  // d'exclusion mappé rend SON arbitrage nommé ; les motifs non mappés
  // (`missing_required_skill`, `no_skills_recorded`, …) retombent quand même
  // sur les arbitrages de dernier recours — jamais un tableau vide.
  it.each(
    Object.entries({
      rate_out_of_range: 'negocier',
      unavailable_at_start: 'reactiver',
      out_of_zone: 'elargir',
      contract_mismatch: 'elargir_contrat',
      previously_rejected_by_client: 'clarifier',
    }),
  )('#2178.38 — le motif « %s » possède le geste « %s »', (reason, option) => {
    const run = baseRun({ exclusionCounts: [{ reason: reason as never, count: 1 }] })
    expect(nextBestMoveOptions(run)).toContain(option)
  })
})

describe('assertCriteriaUnchanged (#2331.4)', () => {
  it('ne lève rien quand le besoin est identique', () => {
    const need = baseRun().need
    expect(() => assertCriteriaUnchanged(need, need)).not.toThrow()
    expect(() => assertCriteriaUnchanged(need, JSON.parse(JSON.stringify(need)))).not.toThrow()
  })

  it('lève une erreur explicite quand un critère a été modifié sans accord client', () => {
    const need = baseRun().need
    const modified = { ...need, minYears: 5 }
    expect(() => assertCriteriaUnchanged(need, modified)).toThrow(/accord client/)
  })
})
