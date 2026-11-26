import { describe, expect, it } from 'vitest'
import type { AccountBillingProfile } from '@bellum/contracts'
import { buildAccountBillingResolver, summarizeAccountBilling } from './accountBillingLens'

const NOW = new Date('2026-08-31T12:00:00Z')

function profile(accountId: string, over: Partial<AccountBillingProfile> = {}): AccountBillingProfile {
  return {
    entityId: `entity-${accountId}`,
    accountId,
    legalName: 'NOVA SUPPLY CHAIN SAS',
    siren: '420624777',
    // L'identité légale (31/08/2026). Le défaut est « personne n'a saisi » :
    // c'est l'état d'un dossier qu'on vient de désigner, et le cas où la
    // pastille « vérifié » doit se TAIRE.
    siret: null,
    identitySource: null,
    identityCheckedOn: null,
    paymentTermsDays: 45,
    contractExpiresOn: '2027-03-01',
    billingContactId: 'contact-1',
    ...over,
  }
}

describe('buildAccountBillingResolver', () => {
  it('rend « prêt » et garde le dossier, pour afficher SIREN et raison sociale', () => {
    const badge = buildAccountBillingResolver([profile('a')], [], NOW).get('a')
    expect(badge.state).toBe('ready')
    expect(badge.blockers).toEqual([])
    expect(badge.profile?.siren).toBe('420624777')
    expect(badge.profile?.legalName).toBe('NOVA SUPPLY CHAIN SAS')
  })

  /**
   * ⚠️ LE POINT QUI DISTINGUE CETTE LENTILLE DE L'AUTRE. Un compte sans mission
   * reçoit `none` (« rien à facturer ») côté mission ; ici il reçoit un VERDICT,
   * parce que « ce client est-il facturable » se pose avant la première mission.
   */
  it("juge un compte SANS aucune ligne de mission — la question ne dépend pas d'un relevé", () => {
    expect(buildAccountBillingResolver([], [], NOW).get('sans-mission')).toEqual({
      state: 'blocked',
      blockers: ['missing_billing_entity'],
      profile: null,
    })
  })

  it('lève « bon de commande manquant » depuis les lignes de mission, sans le recalculer', () => {
    const resolver = buildAccountBillingResolver([profile('a')], [{ accountId: 'a', blockers: ['missing_po'] }], NOW)
    expect(resolver.get('a').blockers).toEqual(['missing_po'])
  })

  it("n'attribue à AUCUN compte une ligne de mission sans compte lié", () => {
    const resolver = buildAccountBillingResolver([profile('a')], [{ accountId: null, blockers: ['missing_po'] }], NOW)
    expect(resolver.get('a').blockers).toEqual([])
  })

  /**
   * Les autres bloqueurs de mission (`missing_timesheet`, `missing_rate`…)
   * appartiennent à l'AUTRE colonne : les faire remonter ici afficherait deux
   * fois la même information sous deux noms.
   */
  it('ne lève AUCUN bloqueur de mission autre que le bon de commande', () => {
    const resolver = buildAccountBillingResolver(
      [profile('a')],
      [{ accountId: 'a', blockers: ['missing_timesheet', 'missing_rate', 'missing_billing_contact'] }],
      NOW,
    )
    expect(resolver.get('a').blockers).toEqual([])
  })

  it('nomme les bloqueurs structurels du dossier incomplet', () => {
    const resolver = buildAccountBillingResolver(
      [profile('a', { paymentTermsDays: null, contractExpiresOn: '2026-01-01' })],
      [],
      NOW,
    )
    expect(resolver.get('a').blockers).toEqual(['expired_contract', 'unknown_payment_terms'])
  })

  /** Deux lignes de la même page doivent être jugées au même instant — un
   *  verdict recalculé à chaque rendu changerait au passage de minuit. */
  it('rend le MÊME objet pour deux demandes du même compte', () => {
    const resolver = buildAccountBillingResolver([profile('a')], [], NOW)
    expect(resolver.get('a')).toBe(resolver.get('a'))
  })
})

describe('summarizeAccountBilling', () => {
  it('compte les prêts et les bloqués sur les comptes AFFICHÉS', () => {
    const resolver = buildAccountBillingResolver([profile('a'), profile('b')], [], NOW)
    expect(summarizeAccountBilling(id => resolver.get(id), ['a', 'b', 'c'])).toEqual({ ready: 2, blocked: 1 })
  })

  it('ne compte rien sur une liste vide — jamais un « 0 prêt » inventé', () => {
    const resolver = buildAccountBillingResolver([], [], NOW)
    expect(summarizeAccountBilling(id => resolver.get(id), [])).toEqual({ ready: 0, blocked: 0 })
  })

  /**
   * ⚠️ Le cas qui décide de l'honnêteté du bandeau : pendant un chargement ou
   * sur un échec, la lentille ne rend aucun verdict. Ranger ces comptes dans
   * « prêts » annoncerait un fait ; dans « bloqués », des alertes à traiter qui
   * n'existent pas. Ils ne comptent nulle part.
   */
  it('ne range NULLE PART un compte que la lentille n’a pas su juger', () => {
    expect(summarizeAccountBilling(() => null, ['a', 'b', 'c'])).toEqual({ ready: 0, blocked: 0 })
  })
})
