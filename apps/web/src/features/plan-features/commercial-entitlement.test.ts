import { describe, expect, it } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import { COMMERCIAL_ENTITLEMENT_KINDS, deriveCommercialEntitlement } from './commercial-entitlement'

/**
 * #2003.1 — « Créer deux états indépendants : droit d'accès commercial / niveau
 * de compréhension métier. »
 *
 * Le SECOND axe existe déjà : `onboardingStatusSchema` en nomme douze états, et
 * la contrainte SQL a été élargie par la migration `1793583494449` (#2004). Le
 * PREMIER n'avait aucun nom : l'app ne répondait qu'à un booléen,
 * `hasExistingOffer`, qui dit « servi ou non » sans jamais dire DE QUOI.
 *
 * Ce fichier garde la dérivation du premier axe. Elle ne recopie rien : c'est
 * `hasExistingOffer` qui reste seul juge de « servi ? », et `creditsRemaining`
 * seul juge du solde. Ce module NOMME, il ne recalcule pas.
 */
const credits = (over: Partial<UserCredits> = {}): UserCredits => ({
  user_id: 'u1',
  plan: 'decouverte',
  accounts_limit: 0,
  accounts_used: 0,
  enrichment_credits: 0,
  ...over,
})

describe('deriveCommercialEntitlement — le droit d’accès commercial, nommé', () => {
  it('nomme exactement les six facettes de #2003.1, plus « rien » et « non mesuré »', () => {
    // Un total est un argument : l'issue énumère offre / essai / bêta /
    // invitation / démonstration / crédits. S'y ajoutent les deux seuls états
    // que l'issue ne nomme pas et qui existent pourtant : le compte neuf
    // (`none`) et la lecture qui n'a pas répondu (`unknown`).
    expect([...COMMERCIAL_ENTITLEMENT_KINDS]).toEqual([
      'unknown',
      'none',
      'demonstration',
      'invitation',
      'beta',
      'trial',
      'subscription',
      'credits',
    ])
  })

  it('sans lecture de crédits, répond « non mesuré » — et surtout PAS zéro crédit', () => {
    // « Non mesuré » n'est jamais « 0 » : si la valeur est absente, « 0 » n'est
    // pas VRAI — un compte peut très bien avoir 250 crédits que la requête n'a
    // pas ramenés.
    for (const absent of [undefined, null]) {
      const entitlement = deriveCommercialEntitlement(absent)
      expect(entitlement.kind).toBe('unknown')
      expect(entitlement.credits).toBeNull()
      expect(entitlement.served).toBe(false)
    }
  })

  it('non mesuré n’ARRÊTE pas le nouveau venu devant une porte close', () => {
    // Un timeout n'est pas un échec : on ne CONCLUT pas « pas d'offre », mais on
    // ne peut pas non plus laisser un compte neuf sans écran. La sélection
    // reste donc visible, et c'est la redirection (qui, elle, exige `served`)
    // qui ne part pas.
    const entitlement = deriveCommercialEntitlement(undefined)
    expect(entitlement.showsPlanSelection).toBe(true)
  })

  it('un compte self-service neuf n’a aucun droit, et voit la grille', () => {
    const entitlement = deriveCommercialEntitlement(credits())
    expect(entitlement.kind).toBe('none')
    expect(entitlement.served).toBe(false)
    expect(entitlement.showsPlanSelection).toBe(true)
  })

  it('nomme la démonstration avant tout le reste', () => {
    // Une salle de démonstration porte un palier vendu (migration
    // `1791594612903-DemoRoomsOnSoldPlan`) : lue par le palier seul, elle
    // passerait pour un abonnement.
    const entitlement = deriveCommercialEntitlement(credits({ plan: 'growth', is_demo: true }))
    expect(entitlement.kind).toBe('demonstration')
    expect(entitlement.showsPlanSelection).toBe(false)
  })

  it('nomme l’invitation — un siège ne choisit pas l’offre de quelqu’un d’autre', () => {
    // #2014.1 « invitation d'un collègue » : l'API résout la facturation sur le
    // PROPRIÉTAIRE de l'espace, donc l'invité lit le palier de son espace. Lui
    // présenter une sélection d'abonnement lui ferait payer deux fois.
    const entitlement = deriveCommercialEntitlement(credits({ plan: 'growth', is_billing_owner: false }))
    expect(entitlement.kind).toBe('invitation')
    expect(entitlement.showsPlanSelection).toBe(false)
  })

  it('nomme la bêta et l’essai séparément de l’offre', () => {
    expect(deriveCommercialEntitlement(credits({ plan: 'beta' })).kind).toBe('beta')
    expect(deriveCommercialEntitlement(credits({ plan: 'trial' })).kind).toBe('trial')
  })

  it('nomme l’offre payée', () => {
    const entitlement = deriveCommercialEntitlement(credits({ plan: 'growth' }))
    expect(entitlement.kind).toBe('subscription')
    expect(entitlement.served).toBe(true)
    expect(entitlement.showsPlanSelection).toBe(false)
  })

  it('nomme les crédits quand c’est la CONSOMMATION qui sert le compte, pas le palier', () => {
    // Le cas de l'ancien compte incomplet (#2014.1) : palier de signup, mais des
    // analyses déjà consommées. `hasExistingOffer` le tient pour servi — il faut
    // donc pouvoir le dire autrement que « abonnement ».
    const entitlement = deriveCommercialEntitlement(credits({ plan: 'decouverte', accounts_used: 3 }))
    expect(entitlement.kind).toBe('credits')
    expect(entitlement.served).toBe(true)
  })

  it('lit le solde par la dérivation canonique, jamais par une soustraction refaite ici', () => {
    // `creditsRemaining` répond `credits_remaining` quand le serveur le porte,
    // sinon la soustraction des alias historiques. Deux chemins qui refont cette
    // dérivation divergent — c'est déjà arrivé sur la pastille de crédits.
    expect(deriveCommercialEntitlement(credits({ plan: 'growth', credits_remaining: 42 })).credits).toBe(42)
    expect(
      deriveCommercialEntitlement(credits({ plan: 'growth', accounts_limit: 250, accounts_used: 10 })).credits,
    ).toBe(240)
  })

  it('un solde à zéro RÉELLEMENT lu reste zéro — il ne devient pas « non mesuré »', () => {
    // La symétrie de la règle : on refuse d'écrire 0 pour une absence, on refuse
    // tout autant d'effacer un vrai 0, qui est l'information « plus de crédits ».
    expect(deriveCommercialEntitlement(credits({ plan: 'growth', credits_remaining: 0 })).credits).toBe(0)
  })
})
