import { describe, expect, it } from 'vitest'
import { exactBatchAnalysisCost } from './discover-batch-analyze-cost'

/**
 * #2166.56 (suite, 18/09/2026 soir) — LE COÛT ANNONCÉ EST LE COÛT DÉBITÉ.
 *
 * Mesuré en production ce soir : le devis du lot multipliait `creditCostOf
 * ('account_analysis')` par le nombre de candidats cochés. Un compte DÉJÀ
 * analysé dans l'espace est ROUVERT sans débit (`cache_hit`) par le même
 * lanceur que `/search` — le devis annonçait donc 8 crédits là où 0 seraient
 * débités. Même correctif que #2288.4 (`marketVerificationCost.ts`) : la
 * somme se fait entreprise par entreprise sur les réponses de
 * `GET /analysis/launch-plan`, jamais sur un prix de grille.
 */
describe('exactBatchAnalysisCost (#2166.56)', () => {
  it('additionne les coûts FRAIS tels que le lanceur les annonce', () => {
    expect(
      exactBatchAnalysisCost({
        isDemo: false,
        plans: [
          { scenario: 'fresh', credits: 8 },
          { scenario: 'fresh', credits: 8 },
        ],
      }),
    ).toEqual({ measured: true, credits: 16, alreadyAnalyzed: 0, demo: false })
  })

  it('un compte DÉJÀ analysé est rouvert sans débit — il ne se facture pas, et il se compte', () => {
    expect(
      exactBatchAnalysisCost({
        isDemo: false,
        plans: [
          { scenario: 'fresh', credits: 8 },
          { scenario: 'fresh', credits: 8 },
          { scenario: 'cache_hit', accountId: 'a1', companyName: 'Cegedim' },
        ],
      }),
    ).toEqual({ measured: true, credits: 16, alreadyAnalyzed: 1, demo: false })
  })

  it('une seule réponse manquante rend le TOTAL non mesuré — jamais une somme partielle', () => {
    expect(exactBatchAnalysisCost({ isDemo: false, plans: [{ scenario: 'fresh', credits: 8 }, null] })).toEqual({
      measured: false,
    })
  })

  it('une réponse en erreur (undefined) rend aussi le total non mesuré', () => {
    expect(exactBatchAnalysisCost({ isDemo: false, plans: [{ scenario: 'fresh', credits: 8 }, undefined] })).toEqual({
      measured: false,
    })
  })

  it('en démonstration, rien n’est débité, et c’est dit — sans lire les plans', () => {
    expect(exactBatchAnalysisCost({ isDemo: true, plans: [null, null] })).toEqual({
      measured: true,
      credits: 0,
      alreadyAnalyzed: 0,
      demo: true,
    })
  })

  it('aucun candidat : zéro MESURÉ', () => {
    expect(exactBatchAnalysisCost({ isDemo: false, plans: [] })).toEqual({
      measured: true,
      credits: 0,
      alreadyAnalyzed: 0,
      demo: false,
    })
  })

  it('un coût illisible dans une réponse n’est pas additionné comme un zéro', () => {
    expect(exactBatchAnalysisCost({ isDemo: false, plans: [{ scenario: 'fresh', credits: Number.NaN }] })).toEqual({
      measured: false,
    })
  })
})
