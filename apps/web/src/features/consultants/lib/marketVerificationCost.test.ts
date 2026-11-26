import { describe, expect, it } from 'vitest'
import { exactVerificationCost } from './marketVerificationCost'

/**
 * #2288.4 — LE COÛT ANNONCÉ EST LE COÛT DÉBITÉ, pas une multiplication de grille.
 *
 * Mesuré en production le 18/09/2026 : un rafraîchissement d'axe annonçait 1
 * crédit et en débitait 2. Le devis de la vérification ne multiplie donc plus
 * un prix de grille par un nombre d'entreprises : il additionne, entreprise par
 * entreprise, ce que `GET /analysis/launch-plan` répond — `planLaunch`, qui lit
 * les MÊMES signaux dans le MÊME ordre que `start()`, le geste qui débite.
 */
describe('exactVerificationCost', () => {
  it('additionne les coûts FRAIS tels que le lanceur les annonce', () => {
    expect(
      exactVerificationCost({
        isDemo: false,
        plans: [
          { scenario: 'fresh', credits: 8 },
          { scenario: 'fresh', credits: 8 },
        ],
      }),
    ).toEqual({ measured: true, credits: 16, reopened: 0, demo: false })
  })

  it('un dossier DÉJÀ analysé est rouvert sans débit — il ne se facture pas, et il se compte', () => {
    expect(
      exactVerificationCost({
        isDemo: false,
        plans: [
          { scenario: 'fresh', credits: 8 },
          { scenario: 'cache_hit', accountId: 'a1', companyName: 'Cegedim' },
        ],
      }),
    ).toEqual({ measured: true, credits: 8, reopened: 1, demo: false })
  })

  it('une seule réponse manquante rend le TOTAL non mesuré — jamais une somme partielle', () => {
    expect(exactVerificationCost({ isDemo: false, plans: [{ scenario: 'fresh', credits: 8 }, null] })).toEqual({
      measured: false,
    })
  })

  it('en démonstration, rien n’est débité, et c’est dit', () => {
    expect(exactVerificationCost({ isDemo: true, plans: [null, null] })).toEqual({
      measured: true,
      credits: 0,
      reopened: 0,
      demo: true,
    })
  })

  it('aucun candidat : zéro MESURÉ', () => {
    expect(exactVerificationCost({ isDemo: false, plans: [] })).toEqual({
      measured: true,
      credits: 0,
      reopened: 0,
      demo: false,
    })
  })

  it('un coût illisible dans une réponse n’est pas additionné comme un zéro', () => {
    expect(exactVerificationCost({ isDemo: false, plans: [{ scenario: 'fresh', credits: Number.NaN }] })).toEqual({
      measured: false,
    })
  })
})
