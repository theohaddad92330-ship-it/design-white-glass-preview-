import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS, creditCostOf } from './credit-weights.js'
import {
  MARKET_MEMORY_FREE_READS,
  MARKET_MEMORY_PAID_VERIFICATIONS,
  MARKET_MEMORY_TELEMETRY,
  PAID_CALLS_AVOIDED_REFUSAL,
  measureMarketPrefilter,
} from './market-memory-credit-policy.js'

describe('lire ce qu’on sait déjà ne coûte rien', () => {
  it('les sept lectures du retour sont NOMMÉES, et chacune porte sa raison', () => {
    // Le retour en liste sept. Les recopier sans leur raison ferait de cette
    // classification une opinion : dans six mois, personne ne saura pourquoi
    // `search_market_memory` est gratuit et un refresh ciblé ne l'est pas.
    expect(MARKET_MEMORY_FREE_READS).toHaveLength(7)
    for (const read of MARKET_MEMORY_FREE_READS) {
      expect(read.why.length).toBeGreaterThan(20)
      expect(read.creditCost).toBe(0)
    }
    // Les clés sont uniques — deux entrées du même geste diraient deux fois la
    // même chose, et l'une des deux se périmerait seule.
    expect(new Set(MARKET_MEMORY_FREE_READS.map(read => read.key)).size).toBe(7)
  })

  it('aucune lecture gratuite ne pointe vers une action FACTURÉE de la grille', () => {
    // La garde de fond : si un jour quelqu'un rattachait une de ces lectures à
    // une action pondérée, ce test tomberait AVANT que l'écran ne mente.
    for (const read of MARKET_MEMORY_FREE_READS) {
      if (read.gridAction === null) continue
      expect(CREDIT_WEIGHTS[read.gridAction]).toBe(0)
    }
  })

  it('ce qui est PAYANT lit son prix dans la grille, jamais un nombre écrit à la main', () => {
    expect(MARKET_MEMORY_PAID_VERIFICATIONS.length).toBeGreaterThan(0)
    for (const paid of MARKET_MEMORY_PAID_VERIFICATIONS) {
      // Le prix n'est pas RECOPIÉ dans ce fichier : il est dérivé de la grille
      // au moment de la lecture. Un changement de grille suit tout seul.
      expect(paid.creditCost).toBe(creditCostOf(paid.gridAction))
      expect(paid.creditCost).toBeGreaterThan(0)
    }
  })
})

describe('la mesure du préfiltre — un fait, jamais une estimation', () => {
  it('compte ce qui entre et ce qui sort, et ce que le préfiltre a retiré', () => {
    const measure = measureMarketPrefilter({ candidatesBefore: 120, candidatesAfter: 18 })
    expect(measure).toEqual({ candidatesBefore: 120, candidatesAfter: 18, candidatesRemoved: 102 })
  })

  it('un portefeuille VIDE ne rend pas « 0 retiré » — il n’y avait rien à filtrer', () => {
    // « Non mesuré » n'est jamais « 0 ». Sans candidat en entrée, le préfiltre
    // n'a rien fait : écrire « 0 candidat retiré » se lirait comme une mesure
    // (« le préfiltre n'a servi à rien ») là où la vérité est « rien à mesurer ».
    expect(measureMarketPrefilter({ candidatesBefore: 0, candidatesAfter: 0 })).toBeNull()
  })

  it('refuse une entrée incohérente plutôt que de rendre un négatif', () => {
    // Plus de sortants que d'entrants n'a aucun sens : un préfiltre RETIRE. Un
    // « -3 retirés » voyagerait jusqu'à un écran sans que rien ne le rattrape.
    expect(measureMarketPrefilter({ candidatesBefore: 3, candidatesAfter: 9 })).toBeNull()
    expect(measureMarketPrefilter({ candidatesBefore: Number.NaN, candidatesAfter: 1 })).toBeNull()
    expect(measureMarketPrefilter({ candidatesBefore: 2.5, candidatesAfter: 1 })).toBeNull()
    expect(measureMarketPrefilter({ candidatesBefore: -1, candidatesAfter: -4 })).toBeNull()
  })

  it('un préfiltre qui ne retire RIEN reste une mesure — zéro y est vrai', () => {
    // La distinction qui fait tout l'objet du test précédent : ici on a bien
    // mesuré, et la réponse mesurée est zéro. Ce zéro-là s'affiche.
    expect(measureMarketPrefilter({ candidatesBefore: 12, candidatesAfter: 12 })).toEqual({
      candidatesBefore: 12,
      candidatesAfter: 12,
      candidatesRemoved: 0,
    })
  })
})

describe('les compteurs — quatre mesurés, un refusé', () => {
  it('nomme les quatre grandeurs que le retour demande et qu’on sait mesurer', () => {
    expect(MARKET_MEMORY_TELEMETRY).toEqual({
      prefilterEvent: 'market_prefilter_used',
      paidVerificationEvent: 'paid_verification_triggered',
      candidatesBeforeProperty: 'market_candidates_before',
      candidatesAfterProperty: 'market_candidates_after',
    })
  })

  it('« paid_calls_avoided » est REFUSÉ, et la raison est écrite', () => {
    // Le cinquième compteur du retour n'est pas une mesure : il suppose de
    // savoir ce que l'utilisateur AURAIT payé sans le préfiltre. Ce fichier
    // porte le refus plutôt que le chiffre — pour qu'on ne le re-propose pas
    // dans six mois en croyant qu'il avait été oublié.
    expect(PAID_CALLS_AVOIDED_REFUSAL.counter).toBe('paid_calls_avoided')
    expect(PAID_CALLS_AVOIDED_REFUSAL.why).toMatch(/contrefactuel/i)
    expect(PAID_CALLS_AVOIDED_REFUSAL.measuredInstead).toBe('market_candidates_before − market_candidates_after')
  })
})
